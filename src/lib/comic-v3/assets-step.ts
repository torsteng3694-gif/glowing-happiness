import { prisma } from "@/lib/db";
import { STEP_KEYS_V3 } from "@/lib/comic-v3/steps";
import { AssetsOutputSchema } from "@/lib/comic-v3/schemas";

/**
 * 把当前所有 ComicAssetV3 行的最新选图状态，回写到 assets_render step 的 candidates 里
 * （只有一个 candidate，覆盖它的 data）。
 *
 * confirm 时引擎会从这个 candidate 读 data 写到 output。
 */
export async function refreshAssetsStepCandidate(projectId: string) {
  const step = await prisma.comicStepV3.findUnique({
    where: { projectId_stepKey: { projectId, stepKey: STEP_KEYS_V3.ASSETS_RENDER } },
  });
  if (!step) return;

  const assets = await prisma.comicAssetV3.findMany({
    where: { projectId },
    orderBy: { orderIdx: "asc" },
  });

  const data = AssetsOutputSchema.parse({
    assets: assets.map((a) => ({
      id: a.id,
      type: a.type as "character" | "scene" | "prop",
      name: a.name,
      pickedUrl: a.pickedUrl,
      visualAnchor: a.visualAnchor,
      imagePrompt: a.imagePrompt,
    })),
  });

  let cands: Array<{ id: string; kind: string; data: unknown; mdSummary?: string }> = [];
  if (step.candidates) {
    try {
      cands = JSON.parse(step.candidates);
    } catch {
      /* ignore */
    }
  }
  if (cands.length === 0) {
    cands = [{ id: "main", kind: "assets", data, mdSummary: undefined }];
  } else {
    cands[0] = { ...cands[0], data };
  }

  await prisma.comicStepV3.update({
    where: { projectId_stepKey: { projectId, stepKey: STEP_KEYS_V3.ASSETS_RENDER } },
    data: {
      candidates: JSON.stringify(cands),
      pickedCandidateId: cands[0].id,
    },
  });
}
