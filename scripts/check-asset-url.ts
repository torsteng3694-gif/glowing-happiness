import { prisma } from "../src/lib/db";

async function main() {
  const assets = await prisma.mediaAsset.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, type: true, url: true, prompt: true, createdAt: true },
  });
  console.log(JSON.stringify(assets, null, 2));
}

main().finally(() => prisma.$disconnect());
