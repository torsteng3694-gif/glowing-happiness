/**
 * 新增 / 更新「vidu-explain-comic」解说剧成片模型
 * provider = vidu，slug = vidu-explain-comic
 *
 * 同时：
 *   - 创建一个 slug=vidu-cn 的 Upstream（默认占位 apiKey 需在 admin 后台填入真实 Token）
 *   - 创建一条「国内线路」渠道，绑定到该 Upstream
 *
 * 计费换算：Vidu 报价 20 积分/秒，约定 1 积分 = 0.10 元 → sellUnitPrice = 2.00 元/秒
 *           成本占位为售价的 60%（1.20 元/秒）便于看利润率，管理员请按真实成本核对。
 *
 * 用法：npx tsx scripts/add-vidu-explain-comic.ts
 */

import { prisma } from "../src/lib/db";

async function main() {
  const provider = await prisma.provider.upsert({
    where: { slug: "vidu" },
    update: { name: "Vidu", logo: "🎬" },
    create: { slug: "vidu", name: "Vidu", logo: "🎬" },
  });

  const desc =
    "Vidu 解说剧成片：输入剧名 + 200~1000 字剧本 + 角色/场景/道具资产，自动生成带配音、对口型的剧情短视频。约 400 字/分钟，按视频实际秒数计费。";

  const model = await prisma.model.upsert({
    where: { slug: "vidu-explain-comic" },
    update: {
      name: "Vidu 解说剧成片",
      // 用独立 type 避免污染普通视频生成页面（/dashboard/video 只列 type=video）
      type: "explain-comic",
      description: desc,
      tags: "解说剧,异步,有声视频,对口型",
      unitPrice: 2.0,
      unit: "second",
      enabled: true,
      providerId: provider.id,
    },
    create: {
      slug: "vidu-explain-comic",
      name: "Vidu 解说剧成片",
      type: "explain-comic",
      description: desc,
      tags: "解说剧,异步,有声视频,对口型",
      unitPrice: 2.0,
      unit: "second",
      enabled: true,
      providerId: provider.id,
    },
  });

  // Vidu 国内 Upstream
  const upstream = await prisma.upstream.upsert({
    where: { slug: "vidu-cn" },
    update: {
      name: "Vidu 国内（vidu.cn）",
      baseUrl: "https://api.vidu.cn",
    },
    create: {
      slug: "vidu-cn",
      name: "Vidu 国内（vidu.cn）",
      baseUrl: "https://api.vidu.cn",
      // 占位空 key，请到 /admin/upstreams 填入真实 Token
      apiKey: "",
      enabled: true,
      priority: 50,
    },
  });

  // 渠道：国内线路
  const existing = await prisma.channel.findFirst({
    where: { modelId: model.id, upstreamId: upstream.id, name: "国内线路" },
  });
  if (!existing) {
    await prisma.channel.create({
      data: {
        modelId: model.id,
        upstreamId: upstream.id,
        name: "国内线路",
        tier: "standard",
        upstreamModelSlug: null,
        costInputPrice: 0,
        costOutputPrice: 0,
        costUnitPrice: 1.2, // 占位成本：60% of sell
        sellInputPrice: 0,
        sellOutputPrice: 0,
        sellUnitPrice: 2.0, // 20 积分/秒 × 0.10 元/积分
        priority: 100,
        enabled: true,
        enableFallback: true,
        notes: "Vidu explain-comic · 20 积分/秒（按 1 积分 = 0.10 元换算）· 成本占位待核对",
      },
    });
    console.log("✅ 已创建『国内线路』渠道");
  } else {
    console.log("ℹ️  『国内线路』渠道已存在，跳过");
  }

  console.log("\n✅ Vidu 解说剧成片模型就绪：");
  console.log({
    provider: { slug: provider.slug, name: provider.name },
    model: {
      slug: model.slug,
      name: model.name,
      unitPrice: model.unitPrice,
      unit: model.unit,
    },
    upstream: {
      slug: upstream.slug,
      baseUrl: upstream.baseUrl,
      keyConfigured: !!upstream.apiKey,
    },
  });
  if (!upstream.apiKey) {
    console.log("\n⚠️  Upstream 'vidu-cn' 还没有 apiKey，请到 /admin/upstreams 填入真实 Vidu Token 后再调用。");
  }
  console.log(
    "\n提示：如果要让 Vidu 主动回调，请配置环境变量 PUBLIC_BASE_URL（你的公网地址）和可选的 VIDU_CALLBACK_SECRET（共享密钥）。否则前端会用轮询方式查询任务状态。",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
