/**
 * 电商一键出图 · 项目工作台 SSR shell
 *
 * URL: /dashboard/ecom-image/[id]
 */

import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Workspace from "./Workspace";

export const dynamic = "force-dynamic";

export default async function EcomProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/dashboard/ecom-image/${id}`);

  const project = await prisma.ecomProject.findUnique({
    where: { id },
    select: { id: true, userId: true, title: true },
  });
  if (!project) notFound();
  if (project.userId !== session.id) redirect("/dashboard/ecom-image");

  return <Workspace projectId={id} />;
}
