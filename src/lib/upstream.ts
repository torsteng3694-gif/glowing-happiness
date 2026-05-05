import { prisma } from "./db";
import type { Upstream } from "@prisma/client";

/**
 * 上游聚合渠道配置。
 *
 * 架构迁移后（Upstream + Channel 模型）：
 * - 新代码优先使用 Upstream 表里的记录（通过 Channel.upstreamId 关联）
 * - `getUpstream()` 保留作为"默认兜底"：无渠道/旧接口时使用 slug=default 的那条
 * - 老版本通过 Setting 写入的 upstream_* 已由 migrate-to-channels.ts 迁移到 Upstream 表
 */
export type UpstreamConfig = {
  id?: string;
  slug?: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
};

const K_BASE = "upstream_base_url";
const K_KEY = "upstream_api_key";
const K_ENABLED = "upstream_enabled";

/** 兼容旧调用：从 Upstream 表读 slug=default，其次回落到环境变量 */
export async function getUpstream(): Promise<UpstreamConfig | null> {
  // 先查 Upstream 表（新架构）
  const def = await prisma.upstream.findUnique({ where: { slug: "default" } });
  if (def && def.apiKey) {
    return {
      id: def.id,
      slug: def.slug,
      baseUrl: def.baseUrl.replace(/\/+$/, ""),
      apiKey: def.apiKey,
      enabled: def.enabled,
    };
  }

  // 兜底：旧版 Setting 表（防止 migrate 还没跑）
  const rows = await prisma.setting.findMany({
    where: { key: { in: [K_BASE, K_KEY, K_ENABLED] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const baseUrl =
    map.get(K_BASE) || process.env.UPSTREAM_BASE_URL || "https://api.ai6700.com";
  const apiKey = map.get(K_KEY) || process.env.UPSTREAM_API_KEY || "";
  const enabledVal = map.get(K_ENABLED) ?? process.env.UPSTREAM_ENABLED ?? "";

  if (!apiKey) return null;
  const enabled = enabledVal === "" ? true : enabledVal !== "false";
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, enabled };
}

export function toUpstreamConfig(u: Upstream): UpstreamConfig {
  return {
    id: u.id,
    slug: u.slug,
    baseUrl: u.baseUrl.replace(/\/+$/, ""),
    apiKey: u.apiKey,
    enabled: u.enabled,
  };
}

export async function getUpstreamById(id: string): Promise<UpstreamConfig | null> {
  const u = await prisma.upstream.findUnique({ where: { id } });
  if (!u) return null;
  return toUpstreamConfig(u);
}

export async function isUpstreamActive(): Promise<boolean> {
  const u = await getUpstream();
  return !!(u && u.enabled);
}

/** 兼容旧设置 API：同步写入 Setting 表 + default Upstream 表 */
export async function setUpstream(partial: Partial<UpstreamConfig>) {
  const updates: { key: string; value: string }[] = [];
  if (partial.baseUrl !== undefined) updates.push({ key: K_BASE, value: partial.baseUrl });
  if (partial.apiKey !== undefined) updates.push({ key: K_KEY, value: partial.apiKey });
  if (partial.enabled !== undefined) updates.push({ key: K_ENABLED, value: String(partial.enabled) });

  for (const { key, value } of updates) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  // 同步到 default Upstream
  const current = await prisma.upstream.findUnique({ where: { slug: "default" } });
  if (current) {
    await prisma.upstream.update({
      where: { id: current.id },
      data: {
        baseUrl: partial.baseUrl !== undefined ? partial.baseUrl.replace(/\/+$/, "") : current.baseUrl,
        apiKey: partial.apiKey !== undefined ? partial.apiKey : current.apiKey,
        enabled: partial.enabled !== undefined ? partial.enabled : current.enabled,
      },
    });
  } else if (partial.baseUrl && partial.apiKey) {
    await prisma.upstream.create({
      data: {
        slug: "default",
        name: "默认上游",
        baseUrl: partial.baseUrl.replace(/\/+$/, ""),
        apiKey: partial.apiKey,
        enabled: partial.enabled ?? true,
        priority: 0,
      },
    });
  }
}

/** 屏蔽 API Key 中间部分，用于向管理员展示 */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 12) return key;
  return key.slice(0, 8) + "…" + key.slice(-4);
}
