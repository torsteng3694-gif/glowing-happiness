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

const KEY = "sk-f0158fd7ec5f672e65c05d50b243eae5fdabdc8d17bfc04d";

async function poll(taskId: string) {
  const r = await fetch(`https://api.ai6700.com/v1/media/status?task_id=${taskId}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  return await r.text();
}

async function main() {
  const ids = process.argv.slice(2);
  for (const id of ids) {
    const r = await poll(id);
    console.log(`[${id}] ${r.slice(0, 600)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
