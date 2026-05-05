import { prisma } from "@/lib/db";
import ModelsClient, { type M, type ChannelOption } from "./ModelsClient";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const models = await prisma.model.findMany({
    where: { enabled: true },
    include: {
      provider: true,
      channels: {
        where: { enabled: true },
        include: { upstream: true },
        orderBy: { priority: "asc" },
      },
    },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });

  const list: M[] = models.map((m) => {
    const isChat = m.type === "chat";
    const channels: ChannelOption[] = m.channels
      .filter((c) => c.upstream.enabled)
      .map((c) => ({
        id: c.id,
        name: c.name,
        tier: c.tier,
        priority: c.priority,
        inputPrice: c.sellInputPrice,
        outputPrice: c.sellOutputPrice,
        unitPrice: c.sellUnitPrice,
      }));
    return {
      id: m.id,
      slug: m.slug,
      name: m.name,
      type: m.type as "chat" | "image" | "video",
      description: m.description || "",
      provider: m.provider.name,
      providerSlug: m.provider.slug,
      logo: m.provider.logo || "🤖",
      contextLength: m.contextLength,
      inputPrice: m.inputPrice,
      outputPrice: m.outputPrice,
      unitPrice: m.unitPrice,
      unit: m.unit,
      tags: m.tags?.split(",").filter(Boolean) || [],
      channels,
      isChat,
    };
  });

  return <ModelsClient models={list} />;
}
