import { PrismaClient } from "@prisma/client";
(async () => {
  const p = new PrismaClient();
  const rows = await p.setting.findMany({ where: { key: { startsWith: "upstream" } } });
  for (const r of rows) {
    const masked = r.key.toLowerCase().includes("key") && r.value
      ? r.value.slice(0, 6) + "***" + r.value.slice(-4)
      : r.value;
    console.log(r.key, "=", masked);
  }
  await p.$disconnect();
})();
