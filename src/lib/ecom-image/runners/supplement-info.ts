/**
 * 节点 02 · 资料补全 runner（阶段 1：永远 skip）
 *
 * 阶段 4 再做 AI QA 模式。
 */

import { prisma } from "@/lib/db";
import { NODE_KEYS } from "../nodes";
import { SupplementInfoOutputSchema } from "../schemas";

export async function runSupplementInfo(opts: { projectId: string }) {
  const output = SupplementInfoOutputSchema.parse({
    mode: "skip",
    judgement:
      "现有信息已经可以直接进入出图阶段。AI 已基于商品描述和上传图片完成分析，无需再补充资料。",
    questions: [],
  });
  await prisma.ecomProjectNode.update({
    where: { projectId_nodeKey: { projectId: opts.projectId, nodeKey: NODE_KEYS.SUPPLEMENT_INFO } },
    data: { output: JSON.stringify(output) },
  });
}
