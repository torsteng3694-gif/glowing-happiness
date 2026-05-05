#!/usr/bin/env node
/**
 * Build 阶段的数据库准备：
 * 1) 检查 DATABASE_URL 是否存在且格式合法（必须能解析出 host:port）
 * 2) 合法 → 跑 `prisma db push` + `tsx prisma/seed.ts`
 * 3) 不合法/缺失 → 打印警告并跳过，让 next build 仍能完成
 *
 * 这样可以避免 build 时 DATABASE_URL 没就绪导致整个部署卡死。
 * 数据库初始化失败不致命；运行时再连不上才是致命的。
 */

import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL;

function bail(msg) {
  console.warn(`\n[build-db-setup] ⚠️  ${msg}`);
  console.warn("[build-db-setup] 跳过 prisma db push / seed，仍会继续 next build。");
  console.warn("[build-db-setup] 部署后请在容器里手动执行：");
  console.warn("[build-db-setup]   npx prisma db push --accept-data-loss --skip-generate");
  console.warn("[build-db-setup]   npx tsx prisma/seed.ts\n");
  process.exit(0);
}

if (!url) {
  bail("DATABASE_URL 未设置");
}

let parsed;
try {
  parsed = new URL(url);
} catch (e) {
  bail(`DATABASE_URL 格式无法解析为 URL：${e.message}`);
}

if (!parsed.hostname) bail("DATABASE_URL 缺少 host");
if (!parsed.port) bail(`DATABASE_URL 缺少 port（host=${parsed.hostname}）`);
if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
  bail(`DATABASE_URL 协议不是 postgresql:// （收到 ${parsed.protocol}）`);
}

console.log(
  `[build-db-setup] DATABASE_URL OK: ${parsed.protocol}//${parsed.hostname}:${parsed.port}${parsed.pathname}`,
);

function run(cmd) {
  console.log(`[build-db-setup] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

try {
  run("npx prisma db push --accept-data-loss --skip-generate");
  run("npx tsx prisma/seed.ts");
  console.log("[build-db-setup] ✅ 数据库 schema 同步 + seed 完成");
} catch (e) {
  // 已经 inherit 输出了，这里只标记，不让 build 失败
  console.warn("\n[build-db-setup] ⚠️  数据库初始化命令报错，但不阻塞 build。");
  console.warn("[build-db-setup] 请在容器 Console 里手动跑一次 db push + seed。\n");
}
