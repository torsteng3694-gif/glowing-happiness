import { prisma } from "@/lib/db";
import ChatMultiClient from "./ChatMultiClient";

export const dynamic = "force-dynamic";

export default async function ChatMultiPage() {
  const models = await prisma.model.findMany({
    where: { type: "chat", enabled: true },
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

  const mapped = models
    .filter((m) => m.channels.some((c) => c.upstream.enabled))
    .map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      provider: m.provider.name,
      logo: m.provider.logo || "🤖",
      inputPrice: m.inputPrice,
      outputPrice: m.outputPrice,
      tags: m.tags?.split(",").filter(Boolean) || [],
    }));

  return <ChatMultiClient models={mapped} />;
}
