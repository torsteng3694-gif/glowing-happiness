import { prisma } from "@/lib/db";
import { maskKey } from "@/lib/upstream";
import UpstreamsClient, { type UpstreamRow } from "./UpstreamsClient";

export const dynamic = "force-dynamic";

export default async function UpstreamsPage() {
  const rows = await prisma.upstream.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { channels: true } } },
  });
  const list: UpstreamRow[] = rows.map((u) => ({
    id: u.id,
    slug: u.slug,
    name: u.name,
    baseUrl: u.baseUrl,
    maskedKey: maskKey(u.apiKey),
    hasKey: Boolean(u.apiKey),
    enabled: u.enabled,
    priority: u.priority,
    channelCount: u._count.channels,
  }));
  return <UpstreamsClient initial={list} />;
}
