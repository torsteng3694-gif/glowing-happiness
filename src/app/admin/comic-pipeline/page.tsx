import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getComicPipeline, DEFAULT_PIPELINE } from "@/lib/comic-pipeline";
import ComicPipelineClient from "./ComicPipelineClient";

export const dynamic = "force-dynamic";

async function listModelOptions(type: "chat" | "image" | "video" | "audio") {
  const rows = await prisma.model.findMany({
    where: { type, enabled: true },
    select: { slug: true, name: true, provider: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ slug: r.slug, label: `${r.name}（${r.provider.name}）` }));
}

export default async function Page() {
  try {
    await requireAdmin();
  } catch {
    redirect("/login");
  }
  const [current, llms, ttss, images, videos] = await Promise.all([
    getComicPipeline(),
    listModelOptions("chat"),
    listModelOptions("audio"),
    listModelOptions("image"),
    listModelOptions("video"),
  ]);
  return (
    <ComicPipelineClient
      initial={{
        current,
        defaults: DEFAULT_PIPELINE,
        options: { llm: llms, tts: ttss, image: images, video: videos },
      }}
    />
  );
}
