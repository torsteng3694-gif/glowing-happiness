/**
 * 一次性脚本：把上游（ai6700.com）的 API Key / Base URL 写入 Setting 表
 * 用法：tsx scripts/set-upstream.ts <apiKey> [baseUrl]
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const apiKey = process.argv[2];
  const baseUrl = (process.argv[3] || "https://api.ai6700.com").replace(/\/+$/, "");
  if (!apiKey) {
    console.error("用法: tsx scripts/set-upstream.ts <apiKey> [baseUrl]");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  for (const [key, value] of [
    ["upstream_base_url", baseUrl],
    ["upstream_api_key", apiKey],
    ["upstream_enabled", "true"],
  ] as const) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  await prisma.$disconnect();

  const masked = apiKey.length > 12 ? apiKey.slice(0, 8) + "…" + apiKey.slice(-4) : apiKey;
  console.log(`✅ upstream 写入完成:
   base_url = ${baseUrl}
   api_key  = ${masked}
   enabled  = true`);
}

main().catch((e) => { console.error(e); process.exit(1); });
