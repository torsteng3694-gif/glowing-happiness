import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
(async () => {
  const p = new PrismaClient();
  const hash = await bcrypt.hash("test1234", 10);
  await p.user.update({ where: { email: "test@example.com" }, data: { passwordHash: hash } });
  console.log("OK: test@example.com / test1234");
  await p.$disconnect();
})();
