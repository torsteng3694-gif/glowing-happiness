/**
 * AI 漫剧 · S3.0 — 项目级跨进程互斥锁（CAS 字段实现）
 *
 * 设计：
 *   - ComicProjectV3.runLockId / runLockExpiresAt 两个字段
 *   - acquire：updateMany + where 校验 lockId 为 null 或已过期，count=1 抢到
 *   - heartbeat：持锁者每跑一步续期
 *   - release：清空 lockId
 *
 * 适用：
 *   - 单机多进程（PM2 cluster）
 *   - SQLite / Postgres / MySQL（依赖 Prisma 的 updateMany 原子性）
 *
 * 注意：
 *   - 抢锁失败不抛错，由调用方决定是直接返回还是排队
 *   - 锁默认 TTL 5 分钟，每跑一步续期。一步耗时极长（视频生成）的场景应单独续期
 */

import { prisma } from "@/lib/db";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export type LockHandle = {
  projectId: string;
  lockId: string;
  /** 同一句柄上反复调用 heartbeat 续期 */
  heartbeat: (extraMs?: number) => Promise<boolean>;
  release: () => Promise<void>;
};

function newLockId() {
  try {
    return crypto.randomUUID();
  } catch {
    return "lock-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
}

/**
 * 尝试抢锁。
 * @returns 抢到 → LockHandle；没抢到 → null
 */
export async function acquireProjectLock(
  projectId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<LockHandle | null> {
  const lockId = newLockId();
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMs);

  // CAS：仅当 runLockId IS NULL 或 runLockExpiresAt < now 才更新
  const r = await prisma.comicProjectV3.updateMany({
    where: {
      id: projectId,
      OR: [
        { runLockId: null },
        { runLockExpiresAt: { lt: now } },
      ],
    },
    data: {
      runLockId: lockId,
      runLockExpiresAt: expires,
    },
  });

  if (r.count !== 1) return null;

  return {
    projectId,
    lockId,
    heartbeat: (extra?: number) => heartbeat(projectId, lockId, extra ?? ttlMs),
    release: () => releaseProjectLock(projectId, lockId),
  };
}

/**
 * 续期。仅当当前持锁者就是 lockId 才续期，避免抢回别人新拿到的锁。
 */
export async function heartbeat(
  projectId: string,
  lockId: string,
  extraMs: number = DEFAULT_TTL_MS,
): Promise<boolean> {
  const r = await prisma.comicProjectV3.updateMany({
    where: { id: projectId, runLockId: lockId },
    data: { runLockExpiresAt: new Date(Date.now() + extraMs) },
  });
  return r.count === 1;
}

/**
 * 释放锁。仅当当前 lockId 与持锁者一致才清空（防止误释放他人的锁）。
 */
export async function releaseProjectLock(
  projectId: string,
  lockId: string,
): Promise<void> {
  await prisma.comicProjectV3.updateMany({
    where: { id: projectId, runLockId: lockId },
    data: { runLockId: null, runLockExpiresAt: null },
  });
}

/**
 * 查询项目是否被某个进程持锁（仅做 UI 提示用，不要用作并发判定）
 */
export async function isProjectLocked(projectId: string): Promise<boolean> {
  const p = await prisma.comicProjectV3.findUnique({
    where: { id: projectId },
    select: { runLockId: true, runLockExpiresAt: true },
  });
  if (!p?.runLockId) return false;
  if (p.runLockExpiresAt && p.runLockExpiresAt < new Date()) return false;
  return true;
}
