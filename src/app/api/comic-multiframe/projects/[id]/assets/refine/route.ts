/**
 *   POST /api/comic-multiframe/projects/:id/assets/refine
 *     body: { instruction: string }
 *
 *   用户用自然语言描述对资产识别结果的修改建议（如"再加一个保安角色"），
 *   LLM 在现有资产基础上做"增量补充" — 只返回新增项，不删除已有。
 *   新增项会作为 ComicCharacter 入库（pending），之后串行生图。
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { callLLM, parseLooseJSON } from "@/lib/comic-agent/helpers";
import { generateAssetImagesForCharacter } from "@/lib/comic-agent/shot-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // Vercel Hobby 上限

type RefineOutput = {
  added: { type: "character" | "scene" | "prop" | "skill"; name: string; description: string }[];
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const project = await prisma.comicProject.findUnique({
      where: { id },
      include: { characters: { orderBy: { orderIdx: "asc" } } },
    });
    if (!project || project.userId !== session.id) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const body = await req.json().catch(() => ({}));
    const instruction = String(body.instruction || "").trim();
    if (!instruction) return NextResponse.json({ error: "请输入修改建议" }, { status: 400 });

    // 把现有资产清单告诉 LLM，让它只返回"建议新增"的资产
    const current = project.characters.map((c) => ({
      type: c.type,
      name: c.name,
      description: c.description,
    }));

    const llm = await callLLM({
      userId: session.id,
      modelSlug: project.llmSlug,
      system:
        "你是漫剧资产识别助理。基于用户已有资产清单与修改建议，给出需要新增的资产（不要重复已有）。仅输出 JSON。",
      user: `已有资产清单：
${JSON.stringify(current, null, 2)}

用户的修改建议：
"""
${instruction}
"""

仅输出 JSON：
{
  "added": [
    { "type": "character|scene|prop|skill", "name": "≤8字", "description": "≤40字" }
  ]
}
要求：
- 只返回需要新增的；如果建议是"删除/修改名字"等不属于新增的诉求，added 给空数组
- name 要简洁、稳定、不要与已有资产同名`,
      temperature: 0.4,
      maxTokens: 800,
      metaTag: "comic-agent:asset-refine",
    });

    const parsed = parseLooseJSON<RefineOutput>(llm.data.text);
    const added = (parsed.added || []).filter(
      (x) =>
        ["character", "scene", "prop", "skill"].includes(x.type) &&
        typeof x.name === "string" &&
        x.name.trim(),
    );

    // 落库 + 启动生图（异步，不阻塞返回）
    const existingNames = new Set(project.characters.map((c) => `${c.type}:${c.name}`));
    let lastIdx = project.characters.reduce((m, c) => Math.max(m, c.orderIdx), -1);
    const newIds: string[] = [];
    for (const a of added) {
      const key = `${a.type}:${a.name.trim()}`;
      if (existingNames.has(key)) continue;
      const created = await prisma.comicCharacter.create({
        data: {
          projectId: id,
          type: a.type,
          name: a.name.trim().slice(0, 12),
          description: a.description?.slice(0, 200) || "",
          visualAnchor: `${a.name}：${a.description}`,
          orderIdx: ++lastIdx,
          genStatus: "pending",
        },
      });
      newIds.push(created.id);
      existingNames.add(key);
    }

    // 后台串行生图
    if (newIds.length > 0) {
      (async () => {
        for (const cid of newIds) {
          try {
            await generateAssetImagesForCharacter({
              userId: session.id,
              projectId: id,
              charId: cid,
            });
          } catch (e) {
            console.warn("[refine] gen failed:", e);
          }
        }
      })();
    }

    return NextResponse.json({
      ok: true,
      addedCount: newIds.length,
      cost: llm.cost,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
