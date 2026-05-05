import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserComicPipelineDetailed, type ComicPipeline } from "@/lib/comic-pipeline";
import ExplainComicClient from "./ExplainComicClient";

export const dynamic = "force-dynamic";

export type ModelOpt = { slug: string; name: string; provider: string; logo: string };

async function listModelOptions(type: "chat" | "image" | "video" | "audio"): Promise<ModelOpt[]> {
  const rows = await prisma.model.findMany({
    where: { type, enabled: true },
    select: { slug: true, name: true, provider: { select: { name: true, logo: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    provider: r.provider.name,
    logo: r.provider.logo || "🎬",
  }));
}

export default async function ExplainComicPage() {
  let session;
  try {
    session = await requireUser();
  } catch {
    redirect("/login");
  }

  const [detailed, llm, tts, image, video] = await Promise.all([
    getUserComicPipelineDetailed(session.id),
    listModelOptions("chat"),
    listModelOptions("audio"),
    listModelOptions("image"),
    listModelOptions("video"),
  ]);

  // 用户已有的复刻音色（阶段 3 配音用）
  const myClones = await prisma.voiceClone.findMany({
    where: { userId: session.id, modelSlug: "vidu-audio-clone" },
    orderBy: { createdAt: "desc" },
    select: { voiceId: true, name: true, isActivated: true },
  });

  return (
    <ExplainComicClient
      pipeline={{
        effective: detailed.effective,
        global: detailed.global,
        userOverrides: detailed.userOverrides as Partial<ComicPipeline>,
      }}
      options={{ llm, tts, image, video }}
      voiceClones={myClones.map((v) => ({
        voiceId: v.voiceId,
        name: v.name,
        activated: v.isActivated,
      }))}
    />
  );
}
