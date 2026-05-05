/**
 * 端到端 smoke：创建项目 + 跑前 3 步（纯 LLM，便宜）
 * 用法：npx tsx scripts/smoke-comic-agent.ts
 */
import { prisma } from "../src/lib/db";
import { createProject, runOneStep } from "../src/lib/comic-agent/engine";

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("数据库里没有用户，先注册一个再来");
  console.log(`用户: ${user.email}  余额: ¥${user.balance}`);

  const { project, estimate, policy } = await createProject({
    userId: user.id,
    initialPrompt:
      "一个普通的程序员在地铁里捡到一只会说话的猫，猫告诉他三天后世界会重启，让他赶紧去找前女友道歉。",
    mode: "step",
  });
  console.log(`✓ 项目已创建: ${project.id}`);
  console.log(`  预估总价: ¥${estimate.total}`);
  console.log(`  policy: ${JSON.stringify(policy.retry)}`);

  // 默认跑前 7 步纯 LLM（剧本创作阶段全部）；传 --all 跑全 14 步
  const runAll = process.argv.includes("--all");
  const limit = runAll ? 14 : 7;
  for (let i = 0; i < limit; i++) {
    console.log(`\n→ 执行第 ${i + 1}/${limit} 步…`);
    try {
      const r = await runOneStep({ userId: user.id, projectId: project.id });
      console.log(`✓ ${r.stepKey}  cost=¥${r.result.cost.toFixed(4)}`);
      console.log(`  preview:`, JSON.stringify(r.result.output).slice(0, 200));
    } catch (e) {
      console.error(`✗ 步骤失败:`, e instanceof Error ? e.message : e);
      break;
    }
  }

  const after = await prisma.user.findUnique({
    where: { id: user.id },
    select: { balance: true },
  });
  console.log(`\n用户余额: ¥${after?.balance.toFixed(4)}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ smoke 失败:", e);
  process.exit(1);
});
