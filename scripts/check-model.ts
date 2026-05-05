import { PrismaClient } from "@prisma/client";
(async () => {
  const p = new PrismaClient();
  const m = await p.model.findUnique({ where: { slug: "gemini-3-pro-image-preview" } });
  console.log(m ? JSON.stringify(m, null, 2) : "NOT FOUND");
  await p.$disconnect();
})();
