import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const session = await requireUser();
  const [user, transactions, usages30d] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.id } }),
    prisma.transaction.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.usage.findMany({
      where: {
        userId: session.id,
        createdAt: { gte: new Date(Date.now() - 30 * 86400 * 1000) },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!user) throw new Error("user not found");

  const dayMap: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400 * 1000);
    dayMap[d.toISOString().slice(0, 10)] = 0;
  }
  for (const u of usages30d) {
    const k = u.createdAt.toISOString().slice(0, 10);
    if (k in dayMap) dayMap[k] += u.cost;
  }
  const chart = Object.entries(dayMap).map(([date, value]) => ({ date: date.slice(5), value: Number(value.toFixed(4)) }));

  return (
    <BillingClient
      user={{
        balance: user.balance,
        totalRecharge: user.totalRecharge,
        totalSpent: user.totalSpent,
      }}
      transactions={transactions.map((t) => ({
        id: t.id, type: t.type, amount: t.amount, balance: t.balance,
        note: t.note, createdAt: t.createdAt.toISOString(),
      }))}
      chart={chart}
    />
  );
}
