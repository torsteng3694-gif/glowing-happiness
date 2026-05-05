import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { callImage } from "@/lib/comic-agent/helpers";
import { anglesForType, getStylePrefix } from "@/lib/comic-agent/visual-styles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function loadOwned(userId: string, projectId: string, charId: string) {
  const c = await prisma.comicCharacter.findUnique({
    where: { id: charId },
    include: { project: { select: { userId: true, id: true } } },
  });
  if (!c || c.project.id !== projectId || c.project.userId !== userId) {
    throw new Error("角色不存在或无权访问");
  }
  return c;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; charId: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id, charId } = await params;
  try {
    await loadOwned(session.id, id, charId);
    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      data.name = body.name.slice(0, 12);
      // 用户主动改名 = 锁定，往后重生成不会被覆盖
      data.nameLocked = true;
    }
    if (typeof body.nameLocked === "boolean") data.nameLocked = body.nameLocked;
    if (typeof body.description === "string") data.description = body.description.slice(0, 200);
    if (typeof body.visualAnchor === "string") data.visualAnchor = body.visualAnchor.slice(0, 200);
    if (typeof body.referenceUrl === "string") data.referenceUrl = body.referenceUrl;
    if (Array.isArray(body.referenceUrls))
      data.referenceUrls = JSON.stringify(body.referenceUrls.filter((u: unknown) => typeof u === "string"));
    const updated = await prisma.comicCharacter.update({ where: { id: charId }, data });
    return NextResponse.json({ ok: true, character: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

/**
 * POST  body: { action: "regen-image", angleId?: string, replaceIndex?: number }
 *   - 不传 angleId → 用 type 默认第一个角度，append 一张到 referenceUrls
 *   - 传 angleId  → 按指定角度生图
 *   - 传 replaceIndex → 替换 referenceUrls[index] 这张
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; charId: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id, charId } = await params;
  try {
    const c = await loadOwned(session.id, id, charId);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "regen-image");
    if (action !== "regen-image") {
      return NextResponse.json({ error: "未知 action" }, { status: 400 });
    }

    const project = await prisma.comicProject.findUnique({ where: { id } });
    if (!project) throw new Error("项目不存在");

    const type = (c.type || "character") as "character" | "scene" | "prop" | "skill";
    const angles = anglesForType(type);
    const angle = body.angleId ? angles.find((a) => a.id === body.angleId) || angles[0] : angles[0];
    const stylePrefix = getStylePrefix(project.visualStyle);
    const styleHint = project.style ? `画风：${project.style}。` : "";

    const visualAnchor = c.visualAnchor || `${c.name}：${c.description || ""}`;
    const prompt = type === "character"
      ? `${stylePrefix}${styleHint}character reference sheet, ${angle.suffix}. Subject: ${visualAnchor}. Clean background.`
      : type === "scene"
      ? `${stylePrefix}${styleHint}${angle.suffix}. Location: ${visualAnchor}.`
      : type === "prop"
      ? `${stylePrefix}${styleHint}${angle.suffix}. Object: ${visualAnchor}.`
      : `${stylePrefix}${styleHint}${angle.suffix}. Theme: ${visualAnchor}.`;

    const img = await callImage({
      userId: session.id,
      modelSlug: project.imageSlug,
      prompt,
      n: 1,
      rawParams: { aspectRatio: type === "character" ? "3:4" : "16:9" },
      metaTag: `comic-agent:character-regen:${c.name}:${angle.id}`,
      saveAs: { projectId: id, category: "subject", label: `${c.name}-${angle.label}` },
    });
    const url = img.data.urls[0];
    if (!url) throw new Error("图像模型未返回 URL");

    const existing: string[] = c.referenceUrls ? safeParseArr(c.referenceUrls) : c.referenceUrl ? [c.referenceUrl] : [];
    let next: string[];
    if (typeof body.replaceIndex === "number" && body.replaceIndex >= 0 && body.replaceIndex < existing.length) {
      next = [...existing];
      next[body.replaceIndex] = url;
    } else {
      next = [...existing, url];
    }
    const updated = await prisma.comicCharacter.update({
      where: { id: charId },
      data: {
        referenceUrls: JSON.stringify(next),
        referenceUrl: next[0] || url,
      },
    });
    return NextResponse.json({ ok: true, character: updated, generatedUrl: url, cost: img.cost });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

function safeParseArr(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((u) => typeof u === "string") : [];
  } catch {
    return [];
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; charId: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id, charId } = await params;
  try {
    await loadOwned(session.id, id, charId);
    await prisma.comicCharacter.delete({ where: { id: charId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
