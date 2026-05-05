/**
 * 从上游（ai6700.com 等聚合渠道）拉取模型列表 + 价格，写入本地 Model/Provider 表。
 * 用法：tsx scripts/sync-upstream-models.ts [--purge]
 *   --purge  先清空本地 Model/Provider（默认只 upsert，不删除）
 */
import { PrismaClient } from "@prisma/client";

type UpstreamModel = {
  name: string;
  display_name: string;
  type: string;       // chat | image | video | audio
  tags?: string[];
  description?: string;
  api_format?: string;
};

type UpstreamList = { type: string | null; total: number; models: UpstreamModel[] };

type PricingChannel = {
  group_name: string;
  is_active: boolean;
  base_price: number;
  input_token_price: number;
  output_token_price: number;
};
type PricingResp = { channel_groups: PricingChannel[] };

async function main() {
  const prisma = new PrismaClient();
  const purge = process.argv.includes("--purge");

  const cfgRows = await prisma.setting.findMany({
    where: { key: { in: ["upstream_base_url", "upstream_api_key"] } },
  });
  const cfg = new Map(cfgRows.map((r) => [r.key, r.value]));
  const baseUrl = (cfg.get("upstream_base_url") || "https://api.ai6700.com").replace(/\/+$/, "");
  const apiKey = cfg.get("upstream_api_key");
  if (!apiKey) throw new Error("未配置 upstream_api_key，先运行 set-upstream.ts");

  async function fetchJson(path: string): Promise<any> {
    const r = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }

  // 拉取全部类型
  const types = ["chat", "image", "video", "audio"];
  const all: UpstreamModel[] = [];
  for (const t of types) {
    const j: UpstreamList = await fetchJson(`/v1/skills/models?type=${t}`);
    console.log(`↓ ${t}: ${j.total} 个`);
    for (const m of j.models || []) all.push(m);
  }
  console.log(`合计 ${all.length} 个模型`);

  if (purge) {
    console.log("🧹 清空本地 Model / Provider ...");
    await prisma.usage.deleteMany();
    await prisma.task.deleteMany();
    await prisma.model.deleteMany();
    await prisma.provider.deleteMany();
  }

  // 建一个统一的 "ai6700 聚合" provider
  const provider = await prisma.provider.upsert({
    where: { slug: "ai6700" },
    update: { name: "AI6700 聚合", logo: "☁️", enabled: true },
    create: { slug: "ai6700", name: "AI6700 聚合", logo: "☁️", enabled: true },
  });

  // 先把现有模型全部置为 disabled，然后 upsert 新的启用项（保留历史数据以便不丢失 Usage）
  await prisma.model.updateMany({ data: { enabled: false } });

  let okCount = 0;
  for (const m of all) {
    const type = m.type === "audio" ? "audio" : m.type;
    // 本地定价（平台自定，这里用默认值；可以后续手动在 /admin/models 调整）
    let inputPrice = 0, outputPrice = 0, unitPrice = 0, unit: string | null = null;

    if (type === "chat") {
      try {
        const p: PricingResp = await fetchJson(`/v1/skills/models/${encodeURIComponent(m.name)}/pricing?status=active`);
        const g = p.channel_groups?.[0];
        // 上游价格基础上加 20% markup
        if (g) {
          inputPrice = +(g.input_token_price * 1.2).toFixed(6);
          outputPrice = +(g.output_token_price * 1.2).toFixed(6);
          unit = "1K tokens";
        }
      } catch { /* ignore */ }
    } else {
      try {
        const p: PricingResp = await fetchJson(`/v1/skills/models/${encodeURIComponent(m.name)}/pricing?status=active`);
        const g = p.channel_groups?.[0];
        if (g) {
          unitPrice = +(g.base_price * 1.2).toFixed(4);
          unit = type === "video" ? "second" : "image";
        }
      } catch { /* ignore */ }
    }

    await prisma.model.upsert({
      where: { slug: m.name },
      update: {
        name: m.display_name || m.name,
        type, description: m.description || "",
        tags: (m.tags || []).slice(0, 5).join(","),
        inputPrice, outputPrice, unitPrice, unit,
        providerId: provider.id,
        enabled: true,
      },
      create: {
        slug: m.name, name: m.display_name || m.name, type,
        description: m.description || "",
        tags: (m.tags || []).slice(0, 5).join(","),
        inputPrice, outputPrice, unitPrice, unit,
        providerId: provider.id,
        enabled: true,
      },
    });
    okCount++;
    if (okCount % 20 === 0) process.stdout.write(`  ${okCount}...\n`);
  }

  await prisma.$disconnect();
  console.log(`✅ 同步完成 ${okCount} 个模型（其余保留但 disabled）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
