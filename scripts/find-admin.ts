import { prisma } from "../src/lib/db";

async function main() {
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  console.log(JSON.stringify(admins, null, 2));
}

main().finally(() => prisma.$disconnect());
