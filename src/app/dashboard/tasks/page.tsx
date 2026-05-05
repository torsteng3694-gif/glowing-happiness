import { prisma } from "@/lib/db";
import TasksClient from "./TasksClient";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const models = await prisma.model.findMany({
    where: { enabled: true, type: { in: ["image", "video"] } },
    include: {
      provider: true,
      channels: {
        where: { enabled: true },
        include: { upstream: { select: { enabled: true } } },
        orderBy: { priority: "asc" },
      },
    },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });
  return (
    <TasksClient
      models={models.map((m) => ({
        id: m.id,
        slug: m.slug,
        name: m.name,
        type: m.type,
        provider: m.provider.name,
        logo: m.provider.logo || "🤖",
        unitPrice: m.unitPrice,
        unit: m.unit,
        channels: m.channels
          .filter((c) => c.upstream.enabled)
          .map((c) => ({ id: c.id, name: c.name, tier: c.tier, sellUnitPrice: c.sellUnitPrice })),
      }))}
    />
  );
}
