const { resolveImageParams } = await import("../src/lib/ecom-image/image-model-specs.ts");

const slugs = [
  "gpt-image-2-all",
  "gemini-3-pro-image-preview",
  "gemini-3.1-flash-image-preview",
  "mj_imagine",
  "grok-4.2-image",
];
const ratios = ["1:1", "3:4", "9:16", "16:9", "1:8", "1080:720"];

for (const s of slugs) {
  console.log("\n=== " + s + " ===");
  for (const r of ratios) {
    const x = resolveImageParams(s, r);
    let pixels = "";
    if (x.size) {
      const [w, h] = x.size.split("x").map(Number);
      pixels = ` pixels=${(w * h).toLocaleString()} ${w * h >= 655360 ? "OK" : "[LOW]"}`;
    }
    console.log(
      `  ${r.padEnd(10)} => size=${x.size ?? "(none)"} aspect=${x.aspectRatio} extra=${JSON.stringify(x.extraParams)}${pixels}`,
    );
  }
}
