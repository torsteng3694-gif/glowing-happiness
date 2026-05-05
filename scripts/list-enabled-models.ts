import * as fs from "fs";
import * as path from "path";
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const c = fs.readFileSync(envPath, "utf-8");
  for (const line of c.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      const k = m[1];
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

import { prisma } from "../src/lib/db";

async function main() {
  const models = await prisma.model.findMany({
    where: { type: { in: ["image", "video"] } },
    orderBy: [{ type: "asc" }, { slug: "asc" }],
    include: { provider: true, channels: { include: { upstream: true } } },
  });
  for (const m of models) {
    const enabled = m.channels.filter((c) => c.enabled && c.upstream?.enabled);
    if (enabled.length === 0) continue;
    console.log(`${m.type.padEnd(6)} ${m.slug.padEnd(40)} ¥${m.unitPrice}/u  渠道=${enabled.length} (provider=${m.provider.slug})`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
