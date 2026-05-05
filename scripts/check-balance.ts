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
  const project = await prisma.comicProject.findFirst({
    where: { steps: { some: { stepKey: "keyframes", status: "succeeded" } } },
    orderBy: { updatedAt: "desc" },
    include: { user: { select: { id: true, name: true, email: true, balance: true } } },
  });
  console.log("项目用户：", project?.user);

  const videoModel = await prisma.model.findUnique({ where: { slug: "veo3.1" } });
  console.log("veo3.1 单价：", videoModel?.unitPrice, " 单价单位：1 视频片段");
  console.log("（实际可能按秒计费，看 channel option price）");

  const channel = await prisma.channel.findFirst({
    where: { modelId: videoModel?.id },
    include: { optionPrices: true },
  });
  console.log("\n  channel optionPrices:");
  for (const op of channel?.optionPrices ?? []) {
    console.log(`    ${op.paramKey}=${op.optionValue} costPrice=${op.costUnitPrice} sellPrice=${op.sellUnitPrice}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
