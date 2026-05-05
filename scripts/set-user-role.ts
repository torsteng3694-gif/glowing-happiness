/**
 * 将用户角色设为 agent，以便访问 /agent 代理商后台
 * 用法：npx tsx scripts/set-user-role.ts <email> agent
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const role = process.argv[3] as "user" | "admin" | "agent";
  if (!email || !["user", "admin", "agent"].includes(role)) {
    console.error("用法: npx tsx scripts/set-user-role.ts <email> user|admin|agent");
    process.exit(1);
  }
  const u = await prisma.user.updateMany({
    where: { email },
    data: { role },
  });
  if (u.count === 0) {
    console.error("未找到该邮箱用户");
    process.exit(1);
  }
  console.log("已更新", email, "->", role);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
