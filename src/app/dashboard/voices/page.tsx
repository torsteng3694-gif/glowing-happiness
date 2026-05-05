import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import VoicesClient from "./VoicesClient";

export const dynamic = "force-dynamic";

export default async function VoicesPage() {
  let session;
  try {
    session = await requireUser();
  } catch {
    redirect("/login");
  }

  const models = await prisma.model.findMany({
    where: { type: "audio", enabled: true, slug: "vidu-audio-clone" },
    include: {
      provider: true,
      channels: {
        where: { enabled: true },
        include: { upstream: { select: { enabled: true } } },
        orderBy: { priority: "asc" },
      },
    },
  });

  const items = await prisma.voiceClone.findMany({
    where: { userId: session.id, modelSlug: "vidu-audio-clone" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <VoicesClient
      models={models.map((m) => ({
        id: m.id,
        slug: m.slug,
        name: m.name,
        unitPrice: m.unitPrice,
        unit: m.unit || "clone",
        channels: m.channels
          .filter((c) => c.upstream.enabled)
          .map((c) => ({ id: c.id, name: c.name, sellUnitPrice: c.sellUnitPrice })),
      }))}
      voices={items.map((v) => ({
        id: v.id,
        voiceId: v.voiceId,
        name: v.name,
        audioSampleUrl: v.audioSampleUrl,
        demoAudio: v.demoAudio,
        isActivated: v.isActivated,
        cloneCost: v.cloneCost,
        expiresAt: v.expiresAt?.toISOString() || null,
        createdAt: v.createdAt.toISOString(),
      }))}
    />
  );
}
