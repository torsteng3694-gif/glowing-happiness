import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { routeImage } from "@/lib/providers";
import { pickChannel, getChannelsForModel } from "@/lib/channels";
import { chargeUsage } from "@/lib/billing";
import { rewriteLocalRefsToBase64 } from "@/lib/media-ref";
import { saveMediaAssets } from "@/lib/media-assets";

export const runtime = "nodejs";
export const maxDuration = 800;

type PanelDraft = {
  index: number;
  title: string;
  caption: string;
  imagePrompt: string;
};

export async function POST(req: Request) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "error" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "error" }, { status: 400 });
  }

  const imageModelId = typeof body.imageModelId === "string" ? body.imageModelId : "";
  const aspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : "3:2";
  const drafts = Array.isArray(body.drafts) ? (body.drafts as PanelDraft[]) : [];
  if (!imageModelId) return NextResponse.json({ error: "error" }, { status: 400 });
  if (drafts.length < 2 || drafts.length > 8) {
    return NextResponse.json({ error: "error" }, { status: 400 });
  }

  const [user, imageModel] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.id } }),
    prisma.model.findUnique({ where: { id: imageModelId }, include: { provider: true } }),
  ]);
  if (!user) return NextResponse.json({ error: "error" }, { status: 400 });
  if (!imageModel || imageModel.type !== "image") {
    return NextResponse.json({ error: "error" }, { status: 400 });
  }

  const imageChannel = await pickChannel(imageModel.id, null);
  const imageFallbacks = imageChannel ? await getChannelsForModel(imageModel.id) : [];

  const images: Array<{ index: number; title: string; caption: string; url?: string; error?: string }> = [];
  let totalImageCost = 0;
  let anchorRefUrl: string | null = null;
  const batchId = `comic-auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  for (const d of drafts) {
    const baseParams: Record<string, unknown> = {
      aspectRatio,
      imageSize: "1K",
      seed: Math.floor(Math.random() * 2_147_483_647),
    };
    if (anchorRefUrl) {
      baseParams.image = anchorRefUrl;
      baseParams.image_url = anchorRefUrl;
      baseParams.images = [anchorRefUrl];
      baseParams.reference_images = [anchorRefUrl];
    }
    const rawParams = await rewriteLocalRefsToBase64(baseParams);

    try {
      const started = Date.now();
      const img = await routeImage(
        {
          model: imageModel.slug,
          prompt: anchorRefUrl
            ? `Keep character identity strictly consistent with reference image. ${d.imagePrompt}`
            : d.imagePrompt,
          n: 1,
          size: "1024x1024",
          rawParams,
        },
        imageModel.provider.slug,
        imageChannel,
        imageFallbacks,
      );
      const url = img.images[0]?.url;
      if (!url) throw new Error("error");
      if (!anchorRefUrl) anchorRefUrl = url;
      const billing = await chargeUsage({
        userId: user.id,
        modelId: imageModel.id,
        channelId: imageChannel?.id ?? null,
        type: "image",
        units: 1,
        latencyMs: Date.now() - started,
        meta: { source: "comic-auto:panel-image", panel: d.index, title: d.title },
      });
      totalImageCost += billing.cost;
      images.push({ index: d.index, title: d.title, caption: d.caption, url });
    } catch (e) {
      images.push({
        index: d.index,
        title: d.title,
        caption: d.caption,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const successUrls = images.map((x) => x.url).filter((x): x is string => typeof x === "string" && x.length > 0);
  if (successUrls.length > 0) {
    const combinedPrompt = drafts
      .map((d) => `#${d.index} ${d.title}\n${d.imagePrompt}`)
      .join("\n\n")
      .slice(0, 2000);
    await saveMediaAssets({
      userId: user.id,
      modelId: imageModel.id,
      type: "image",
      urls: successUrls,
      prompt: combinedPrompt,
      params: {
        source: "comic-auto:render",
        sourceLabel: "閼奉亜濮╁⿻顐ゆ暰閺呴缚鍏樻担?,
        batchId,
        aspectRatio,
        panelCount: drafts.length,
        anchorRefUrl,
      },
      totalCost: totalImageCost,
    }).catch((e) => console.error("saveMediaAssets error", e));
  }

  return NextResponse.json({
    panels: images,
    consistency: { enabled: true, anchorRefUrl },
    usage: { imageCost: +totalImageCost.toFixed(4) },
  });
}

