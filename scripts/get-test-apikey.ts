import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

(async () => {
  const p = new PrismaClient();
  const user = await p.user.findFirst({ where: { email: "test@example.com" } });
  if (!user) { console.log("NO USER"); process.exit(1); }
  console.log("USER balance:", user.balance);

  // 创建一把临时 key，明文打印一次
  const plain = "sk-test-" + crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(plain).digest("hex");
  const last4 = plain.slice(-4);
  await p.apiKey.create({
    data: {
      userId: user.id,
      name: "nano-banana-e2e-test",
      keyHash: hash,
      keyPrefix: plain.slice(0, 10),
    },
  });
  console.log("APIKEY:", plain);
  await p.$disconnect();
})();
