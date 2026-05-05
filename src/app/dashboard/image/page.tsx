import { prisma } from "@/lib/db";
import ImageClient from "./ImageClient";

export const dynamic = "force-dynamic";

export default async function ImagePage() {
  const models = await prisma.model.findMany({
    where: { type: "image", enabled: true },
    include: {
      provider: true,
      channels: {
        where: { enabled: true },
        include: {
          upstream: { select: { id: true, name: true, slug: true, enabled: true } },
          optionPrices: { where: { enabled: true } },
        },
        orderBy: { priority: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return (
    <ImageClient
      models={models.map((m) => ({
        id: m.id,
        slug: m.slug,
        name: m.name,
        provider: m.provider.name,
        logo: m.provider.logo || "🎨",
        unitPrice: m.unitPrice,
        tags: m.tags?.split(",").filter(Boolean) || [],
        channels: m.channels
          .filter((c) => c.upstream.enabled)
          .map((c) => ({
            id: c.id,
            name: c.name,
            tier: c.tier,
            priority: c.priority,
            sellUnitPrice: c.sellUnitPrice,
            upstreamName: c.upstream.name,
            upstreamSlug: c.upstream.slug,
            optionPrices: c.optionPrices.map((o) => ({
              paramKey: o.paramKey,
              optionValue: o.optionValue,
              sellUnitPrice: o.sellUnitPrice,
            })),
          })),
      }))}
    />
  );
}
