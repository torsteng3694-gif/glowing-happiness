import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ComicAutoClient from "./ComicAutoClient";

export const dynamic = "force-dynamic";

export default async function ComicAutoPage() {
  try {
    await requireUser();
  } catch {
    redirect("/login");
  }

  const [llmModels, imageModels] = await Promise.all([
    prisma.model.findMany({
      where: { type: "chat", enabled: true },
      select: { id: true, slug: true, name: true, provider: { select: { name: true, logo: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.model.findMany({
      where: { type: "image", enabled: true },
      select: { id: true, slug: true, name: true, provider: { select: { name: true, logo: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <ComicAutoClient
      llmModels={llmModels.map((m) => ({
        id: m.id,
        slug: m.slug,
        name: m.name,
        provider: m.provider.name,
        logo: m.provider.logo || "🤖",
      }))}
      imageModels={imageModels.map((m) => ({
        id: m.id,
        slug: m.slug,
        name: m.name,
        provider: m.provider.name,
        logo: m.provider.logo || "🖼️",
      }))}
    />
  );
}

