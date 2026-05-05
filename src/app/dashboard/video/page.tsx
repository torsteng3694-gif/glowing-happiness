import { prisma } from "@/lib/db";
import VideoClient from "./VideoClient";

export const dynamic = "force-dynamic";

export default async function VideoPage() {
  const models = await prisma.model.findMany({
    where: { type: "video", enabled: true },
    include: {
      provider: true,
      channels: {
        where: { enabled: true },
        include: { upstream: { select: { enabled: true } } },
        orderBy: { priority: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return (
    <VideoClient
      models={models.map((m) => ({
        id: m.id,
        slug: m.slug,
        name: m.name,
        provider: m.provider.name,
        logo: m.provider.logo || "🎬",
        unitPrice: m.unitPrice,
        channels: m.channels
          .filter((c) => c.upstream.enabled)
          .map((c) => ({ id: c.id, name: c.name, tier: c.tier, sellUnitPrice: c.sellUnitPrice })),
      }))}
    />
  );
}
