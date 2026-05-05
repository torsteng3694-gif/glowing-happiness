import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import WorkspaceClient, { type WorkspaceModel } from "./WorkspaceClient";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, name: true, email: true, avatarUrl: true, balance: true },
  });
  if (!user) redirect("/login");

  // 模型列表（与 /dashboard/models 同源）
  const models = await prisma.model.findMany({
    where: { enabled: true },
    include: {
      provider: true,
      channels: {
        where: { enabled: true },
        include: { upstream: true },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const list: WorkspaceModel[] = models.map((m) => {
    const usable = m.channels.filter((c) => c.upstream.enabled).length;
    // 健康度：本轮先用 "可用渠道数 vs 总渠道数 * 100"，未来接 Usage 表算 success/total
    const total = m.channels.length || 1;
    const health = Math.round((usable / total) * 100);
    return {
      id: m.id,
      slug: m.slug,
      name: m.name,
      type: m.type as WorkspaceModel["type"],
      description: m.description || "",
      provider: m.provider.name,
      providerSlug: m.provider.slug,
      logo: m.provider.logo || "🤖",
      tags: m.tags?.split(",").filter(Boolean) || [],
      health, // 0-100
      usableChannels: usable,
      hasChannel: usable > 0,
    };
  });

  return (
    <WorkspaceClient
      user={{
        id: user.id,
        name: user.name || user.email,
        avatarUrl: user.avatarUrl,
        balance: user.balance,
      }}
      models={list}
    />
  );
}
