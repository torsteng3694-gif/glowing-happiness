import { prisma } from "@/lib/db";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function AdminUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <UsersClient
      users={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        balance: u.balance,
        totalRecharge: u.totalRecharge,
        totalSpent: u.totalSpent,
        referralCode: u.referralCode,
        createdAt: u.createdAt.toISOString(),
      }))}
    />
  );
}
