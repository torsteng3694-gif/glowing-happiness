import { prisma } from "../src/lib/db";

async function main() {
  const list = await prisma.channel.findMany({
    include: { upstream: { select: { name: true } }, model: { select: { slug: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log("\n========== 所有渠道 apiKey 状态 ==========");
  for (const c of list) {
    const has = Boolean(c.apiKey && c.apiKey.trim());
    const masked = has && c.apiKey
      ? (c.apiKey.length <= 12 ? "****" + c.apiKey.slice(-2) : c.apiKey.slice(0, 6) + "…" + c.apiKey.slice(-4))
      : "(使用上游默认)";
    console.log(`  [${c.enabled ? "✅" : "⛔"}] ${c.model.name.padEnd(20)} · ${c.name.padEnd(14)} · 上游=${(c.upstream?.name || "?").padEnd(10)} · key=${masked}`);
  }
  console.log("");
}
main().catch(console.error).finally(() => prisma.$disconnect());
