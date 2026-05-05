/**
 * AI 漫剧 · S3.0 — 项目工作台
 */

import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ProjectWorkspace from "./ProjectWorkspace";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/dashboard/comic-v3");

  const { id } = await params;
  const project = await prisma.comicProjectV3.findUnique({
    where: { id },
    select: { id: true, userId: true, title: true },
  });
  if (!project || project.userId !== session.id) notFound();

  return <ProjectWorkspace projectId={id} initialTitle={project.title} />;
}
