/**
 * 电商一键出图 · 节点动作
 *
 *   POST /api/ecom-image/projects/:id/nodes/:key/:action
 *
 *   action ∈ run | confirm | reject | skip | rollback
 *
 *   body（按 action 不同）：
 *     run:    { modelSlug?: string, sourceImageId?: string }   // 节点 01/03 必填 modelSlug
 *     reject: { feedback: string }
 *     其他：   无
 *
 * 节点 01-03 走真实 engine（vision LLM）；节点 04-07 仍走 mock-engine（阶段 2-3 替换）。
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NODE_KEYS, NODE_ORDER, type NodeKey } from "@/lib/ecom-image/nodes";
import * as engine from "@/lib/ecom-image/engine";
import {
  mockConfirmNode,
  mockRejectNode,
  mockRollbackToPrev,
  mockRunNode,
  mockSkipNode,
} from "@/lib/ecom-image/mock-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ACTIONS = ["run", "confirm", "reject", "skip", "rollback"] as const;
type Action = (typeof VALID_ACTIONS)[number];

/** 真 engine 节点（阶段 3 全部 7 节点接真）；mock 仅保留 demo 项目和 createDemoProject */
const REAL_ENGINE_NODES = new Set<NodeKey>([
  NODE_KEYS.PRODUCT_ANALYSIS,
  NODE_KEYS.SUPPLEMENT_INFO,
  NODE_KEYS.IMAGE_ANALYSIS,
  NODE_KEYS.PLAN_CREATION,
  NODE_KEYS.MODEL_SELECTION,
  NODE_KEYS.PROMPT_GENERATION,
  NODE_KEYS.IMAGE_GENERATION,
]);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; key: string; action: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id, key, action } = await ctx.params;

  if (!VALID_ACTIONS.includes(action as Action)) {
    return NextResponse.json({ error: `非法 action: ${action}` }, { status: 400 });
  }
  if (!NODE_ORDER.includes(key as NodeKey)) {
    return NextResponse.json({ error: `非法节点 key: ${key}` }, { status: 400 });
  }
  const nodeKey = key as NodeKey;

  // 鉴权 + 项目归属校验
  const project = await prisma.ecomProject.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  if (project.userId !== session.id) {
    return NextResponse.json({ error: "无权访问该项目" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const useReal = REAL_ENGINE_NODES.has(nodeKey);

  try {
    switch (action as Action) {
      case "run": {
        if (useReal) {
          const modelSlug = typeof body?.modelSlug === "string" ? body.modelSlug : undefined;
          const sourceImageId =
            typeof body?.sourceImageId === "string" ? body.sourceImageId : undefined;
          await engine.runNode({
            projectId: id,
            userId: session.id,
            nodeKey,
            modelSlug,
            sourceImageId,
          });
        } else {
          await mockRunNode(id, nodeKey);
        }
        return NextResponse.json({ ok: true });
      }

      case "confirm": {
        if (useReal) {
          const result = await engine.confirmNode(id, nodeKey);
          // 真 engine：confirm 后下一节点默认 = pending（等用户主动启动）
          // 但下面这两类下一节点是"免费/瞬时"的，可以自动跑一下省一步：
          //   - supplement_info：永远 skip
          //   - model_selection：仅拉 DB 列表，不调 LLM
          if (
            result.nextKey === NODE_KEYS.SUPPLEMENT_INFO ||
            result.nextKey === NODE_KEYS.MODEL_SELECTION
          ) {
            await engine.runNode({
              projectId: id,
              userId: session.id,
              nodeKey: result.nextKey,
            });
          }
          return NextResponse.json({ ok: true, nextKey: result.nextKey });
        } else {
          // mock 节点：保留原行为（confirm 后立即 mock-run 下一节点）
          const result = await mockConfirmNode(id, nodeKey);
          if (result.nextKey) {
            await mockRunNode(id, result.nextKey);
          }
          return NextResponse.json({ ok: true, nextKey: result.nextKey });
        }
      }

      case "reject": {
        const feedback = typeof body?.feedback === "string" ? body.feedback : "";
        if (useReal) {
          await engine.rejectNode(id, nodeKey, feedback);
          // 真 engine：reject 不自动 run（避免昂贵调用），用户在 UI 主动点重新分析
          return NextResponse.json({ ok: true });
        } else {
          await mockRejectNode(id, nodeKey, feedback);
          await mockRunNode(id, nodeKey);
          return NextResponse.json({ ok: true });
        }
      }

      case "skip": {
        if (useReal) {
          const result = await engine.skipNode(id, nodeKey);
          return NextResponse.json({ ok: true, nextKey: result.nextKey });
        } else {
          const result = await mockSkipNode(id, nodeKey);
          if (result.nextKey) {
            await mockRunNode(id, result.nextKey);
          }
          return NextResponse.json({ ok: true, nextKey: result.nextKey });
        }
      }

      case "rollback": {
        if (useReal) {
          const result = await engine.rollbackNode(id, nodeKey);
          return NextResponse.json({ ok: true, prevKey: result.prevKey });
        } else {
          const result = await mockRollbackToPrev(id, nodeKey);
          return NextResponse.json({ ok: true, prevKey: result.prevKey });
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
