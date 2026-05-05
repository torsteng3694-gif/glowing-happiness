import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

export const runtime = "nodejs";
export const maxDuration = 800;

type PanelInput = {
  index?: number;
  title?: string;
  caption?: string;
  url?: string;
};

function normalizeFormat(x: unknown): "png" | "pdf" {
  const s = typeof x === "string" ? x.toLowerCase() : "";
  return s === "pdf" ? "pdf" : "png";
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]") return true;
  if (h.startsWith("0.") || h.startsWith("10.") || h.startsWith("192.168.") || h.startsWith("169.254.")) return true;
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172) {
    const second = parseInt(m172[1] || "0", 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (h.startsWith("fe80:") || h.startsWith("fc00:") || h.startsWith("fd00:")) return true;
  return false;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("鍥剧墖 URL 鏃犳晥");
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error("鍙敮鎸?http/https 鍥剧墖");
  if (isPrivateHost(u.hostname)) throw new Error("绂佹璁块棶鍐呯綉鍥剧墖鍦板潃");

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      Accept: "image/*,*/*;q=0.8",
      Referer: `${u.protocol}//${u.hostname}/`,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`鎷夊彇鍥剧墖澶辫触: ${res.status}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function buildMosaicPng(urls: string[]): Promise<Buffer> {
  const cols = urls.length <= 4 ? 2 : 3;
  const rows = Math.ceil(urls.length / cols);
  const cellW = 1024;
  const cellH = 1024;
  const gap = 24;
  const width = cols * cellW + (cols + 1) * gap;
  const height = rows * cellH + (rows + 1) * gap;

  const base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  });

  const layers: sharp.OverlayOptions[] = [];
  for (let i = 0; i < urls.length; i++) {
    const x = i % cols;
    const y = Math.floor(i / cols);
    const left = gap + x * (cellW + gap);
    const top = gap + y * (cellH + gap);

    const buf = await fetchImageBuffer(urls[i]!);
    const tile = await sharp(buf).resize(cellW, cellH, { fit: "cover", position: "centre" }).png().toBuffer();
    layers.push({ input: tile, left, top });
  }

  return await base.composite(layers).png().toBuffer();
}

async function pngToPdf(png: Buffer): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(png);
  const page = pdf.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  const out = await pdf.save();
  return Buffer.from(out);
}

export async function POST(req: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "error" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "error" }, { status: 400 });
  }

  const format = normalizeFormat((body as Record<string, unknown>).format);
  const panelsRaw = Array.isArray((body as Record<string, unknown>).panels)
    ? ((body as Record<string, unknown>).panels as PanelInput[])
    : [];
  const urls = panelsRaw.map((p) => p.url || "").filter(Boolean);
  if (urls.length < 2 || urls.length > 8) {
    return NextResponse.json({ error: "鍙鍑哄浘鐗囨暟閲忓繀椤诲湪 2~8 涔嬮棿" }, { status: 400 });
  }

  try {
    const png = await buildMosaicPng(urls);
    if (format === "png") {
      return new Response(new Uint8Array(png), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `attachment; filename="comic-page-${Date.now()}.png"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const pdf = await pngToPdf(png);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="comic-page-${Date.now()}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "瀵煎嚭澶辫触" },
      { status: 502 },
    );
  }
}

