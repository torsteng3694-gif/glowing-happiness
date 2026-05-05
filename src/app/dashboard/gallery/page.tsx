import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import GalleryClient from "./GalleryClient";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const session = await requireUser();
  const [counts, totalSpent, favoriteCount] = await Promise.all([
    prisma.mediaAsset.groupBy({
      by: ["type"],
      where: { userId: session.id, deletedAt: null },
      _count: { _all: true },
      _sum: { cost: true },
    }),
    prisma.mediaAsset.aggregate({
      where: { userId: session.id, deletedAt: null },
      _sum: { cost: true },
    }),
    prisma.mediaAsset.count({
      where: { userId: session.id, deletedAt: null, favorite: true },
    }),
  ]);

  const countsMap: Record<string, number> = { all: 0, image: 0, video: 0, audio: 0, inspiration: favoriteCount };
  for (const c of counts) {
    countsMap[c.type] = c._count._all;
    countsMap.all += c._count._all;
  }

  return (
    <GalleryClient
      initialCounts={countsMap}
      totalCost={totalSpent._sum.cost || 0}
    />
  );
}
