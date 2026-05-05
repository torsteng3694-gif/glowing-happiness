import { PrismaClient } from "@prisma/client";
(async () => {
  const p = new PrismaClient();
  const u = await p.user.findUnique({ where: { email: "test@example.com" } });
  if (!u) { console.log("user not found"); return; }
  const t = await p.transaction.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 5 });
  const g = await p.usage.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 5, include: { model: true } });
  console.log(`balance=${u.balance}  totalSpent=${u.totalSpent}`);
  console.log("recent transactions:");
  for (const x of t) console.log(`  ${x.createdAt.toISOString()}  ${x.type}  ${x.amount}  ${x.note}`);
  console.log("recent usages:");
  for (const x of g) console.log(`  ${x.createdAt.toISOString()}  ${x.type}  model=${x.model.slug}  in=${x.inputTokens} out=${x.outputTokens} cost=${x.cost}`);
  await p.$disconnect();
})();
