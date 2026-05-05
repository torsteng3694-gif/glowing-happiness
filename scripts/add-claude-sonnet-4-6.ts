import { prisma } from "../src/lib/db";

/**
 * 新增 / 更新「Claude Sonnet 4.6」聊天模型。
 *
 * 来源：星爷ai (ai6700.com) 聚合，兼容 Anthropic / OpenAI 协议（ai6700 /v1/chat/completions 走 OpenAI 兼容即可，
 * upstreamChat 无需改动）。
 *
 * 家族：Claude → provider = anthropic（便于和其他 Claude 模型一起归类）
 * 展示名：sonnet-4-6，真实 model slug：claude-sonnet-4-6
 *
 * 脚本会做这些事：
 *   1) upsert `anthropic` provider
 *   2) upsert `claude-sonnet-4-6` model
 *   3) 若尚未配置渠道，尝试找一条 ai6700 上游，自动建一条默认渠道（可直接用）
 *
 * 默认定价仅作初始值，可在 /admin/models 或 /admin/upstream-keys 调整。
 */

const DEFAULT_COST_INPUT = 0.015;  // ¥/1K tokens
const DEFAULT_COST_OUTPUT = 0.075;
const DEFAULT_SELL_INPUT = 0.022;
const DEFAULT_SELL_OUTPUT = 0.108;

async function main() {
  const provider = await prisma.provider.upsert({
    where: { slug: "anthropic" },
    update: { name: "Anthropic", logo: "🟠" },
    create: { slug: "anthropic", name: "Anthropic", logo: "🟠" },
  });

  const modelData = {
    name: "sonnet-4-6",
    type: "chat",
    description:
      "Claude Sonnet 4.6 · 大规模前沿智能的均衡旗舰，专为编码、代理和企业工作流打造，安全拟人著称（由星爷ai 聚合提供）。",
    tags: "推荐,旗舰,写代码,深度思考,长上下文,联网搜索",
    contextLength: 200000,
    inputPrice: DEFAULT_SELL_INPUT,
    outputPrice: DEFAULT_SELL_OUTPUT,
    unit: "1K tokens",
    enabled: true,
    providerId: provider.id,
  };

  const model = await prisma.model.upsert({
    where: { slug: "claude-sonnet-4-6" },
    update: modelData,
    create: { slug: "claude-sonnet-4-6", ...modelData },
  });

  console.log("✅ 已写入模型:");
  console.log({
    provider: { slug: provider.slug, name: provider.name },
    model: {
      id: model.id,
      slug: model.slug,
      name: model.name,
      inputPrice: model.inputPrice,
      outputPrice: model.outputPrice,
      contextLength: model.contextLength,
      tags: model.tags,
    },
  });

  // 尝试找一条 ai6700 上游，自动建渠道
  const upstream =
    (await prisma.upstream.findFirst({
      where: {
        enabled: true,
        OR: [
          { baseUrl: { contains: "ai6700" } },
          { slug: { contains: "xingye" } },
          { slug: { contains: "Xingye" } },
          { name: { contains: "星爷" } },
        ],
      },
    })) ||
    (await prisma.upstream.findFirst({ where: { slug: "default" } }));

  if (!upstream) {
    console.log(
      "\n⚠️  没找到 ai6700 / 星爷ai 上游，也没有 slug=default 上游。" +
        "\n   请先在 /admin/upstreams 建好上游（baseUrl=https://api.ai6700.com，填上 API Key），" +
        "\n   再到 /admin/models 里为 claude-sonnet-4-6 关联一条渠道。",
    );
    return;
  }

  const existing = await prisma.channel.findFirst({
    where: { modelId: model.id, upstreamId: upstream.id },
  });

  if (existing) {
    console.log(
      `\nℹ️  已存在渠道 (name=${existing.name}, priority=${existing.priority})，不重复创建。` +
        `\n   如需调整售价，请去 /admin/models 找到该模型编辑渠道。`,
    );
    return;
  }

  const channel = await prisma.channel.create({
    data: {
      modelId: model.id,
      upstreamId: upstream.id,
      name: "sonnet-4-6 · 星爷",
      tier: "premium",
      upstreamModelSlug: "claude-sonnet-4-6",
      costInputPrice: DEFAULT_COST_INPUT,
      costOutputPrice: DEFAULT_COST_OUTPUT,
      sellInputPrice: DEFAULT_SELL_INPUT,
      sellOutputPrice: DEFAULT_SELL_OUTPUT,
      priority: 10,
      enabled: true,
      enableFallback: true,
    },
  });

  console.log("\n✅ 已自动创建渠道（使用上游现有 API Key）:");
  console.log({
    channel: {
      id: channel.id,
      name: channel.name,
      tier: channel.tier,
      upstreamModelSlug: channel.upstreamModelSlug,
      sellInputPrice: channel.sellInputPrice,
      sellOutputPrice: channel.sellOutputPrice,
      costInputPrice: channel.costInputPrice,
      costOutputPrice: channel.costOutputPrice,
      priority: channel.priority,
      upstream: { slug: upstream.slug, baseUrl: upstream.baseUrl },
    },
  });
  console.log(
    "\n下一步：\n" +
      "   · 打开 /dashboard/chat 即可看到「sonnet-4-6 · Anthropic」\n" +
      "   · 打开 /dashboard/chat-multi 把它勾进多模型协作\n" +
      "   · 成本/售价可在 /admin/models 里随时调整",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
