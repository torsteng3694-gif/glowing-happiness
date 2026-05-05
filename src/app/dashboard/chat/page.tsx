import { prisma } from "@/lib/db";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
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
  return (
    <ChatClient
      models={models.map((m) => ({
        id: m.id,
        slug: m.slug,
        name: m.name,
        provider: m.provider.name,
        logo: m.provider.logo || "🤖",
        inputPrice: m.inputPrice,
        outputPrice: m.outputPrice,
        tags: m.tags?.split(",").filter(Boolean) || [],
        channels: m.channels
          .filter((c) => c.upstream.enabled)
          .map((c) => ({
            id: c.id,
            name: c.name,
            tier: c.tier,
            sellInputPrice: c.sellInputPrice,
            sellOutputPrice: c.sellOutputPrice,
          })),
      }))}
    />
  );
}
