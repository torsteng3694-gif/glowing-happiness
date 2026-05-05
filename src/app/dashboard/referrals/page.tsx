import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import ReferralsClient from "./ReferralsClient";

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const session = await requireUser();
  const [user, invited, commissions] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.id } }),
    prisma.user.findMany({
      where: { referredById: session.id },
      select: { id: true, email: true, name: true, createdAt: true, totalSpent: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.commission.findMany({
      where: { userId: session.id },
      include: { source: { select: { email: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  if (!user) return null;

  const rateSetting = await prisma.setting.findUnique({ where: { key: "referral_rate" } });
  const rate = rateSetting ? parseFloat(rateSetting.value) : 0.1;

  const totalCommission = commissions.reduce((s, c) => s + c.amount, 0);
  return (
    <ReferralsClient
      referralCode={user.referralCode}
      rate={rate}
      invited={invited.map((i) => ({
        id: i.id, email: i.email, name: i.name,
        createdAt: i.createdAt.toISOString(), totalSpent: i.totalSpent,
      }))}
      commissions={commissions.map((c) => ({
        id: c.id, amount: c.amount, baseAmount: c.baseAmount, rate: c.rate,
        sourceEmail: c.source.email,
        createdAt: c.createdAt.toISOString(),
      }))}
      totalCommission={totalCommission}
    />
  );
}
