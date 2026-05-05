import * as fs from "fs";
import * as path from "path";
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
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
  const m = await prisma.model.findUnique({ where: { slug: "veo3.1" } });
  if (!m) {
    console.log("no veo3.1 model");
    process.exit(0);
  }
  const channels = await prisma.channel.findMany({
    where: { modelId: m.id },
    include: { upstream: true, optionPrices: true },
  });
  for (const c of channels) {
    console.log("=".repeat(80));
    console.log(`channel ${c.id} ${c.name}`);
    console.log(`  enabled=${c.enabled} upstream.enabled=${c.upstream?.enabled}`);
    console.log(`  upstream baseUrl=${c.upstream?.baseUrl}`);
    console.log(`  upstream slug=${c.upstream?.slug}`);
    console.log(`  channel:`, JSON.stringify(c, null, 2).slice(0, 3000));
    console.log(`  optionPrices:`);
    for (const op of c.optionPrices) {
      console.log(`    ${op.paramKey}=${op.optionValue} cost=${op.costUnitPrice} sell=${op.sellUnitPrice}`);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
