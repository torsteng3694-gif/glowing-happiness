import { prisma } from "@/lib/db";
import { adminAdjustBalance } from "@/lib/billing";

/**
 * 兼容占位：当前仓库没有独立任务执行器进程。
 * 管理端点击「重试」时，先把任务状态置为 queued，等待后续 worker 接管。
 */
export function enqueueTask(taskId: number) {
  void prisma.task
    .update({
      where: { id: taskId },
      data: {
        status: "queued",
        progress: 0,
        updatedAt: new Date(),
      },
    })
    .catch((e) => {
      console.error("[task-runner] enqueueTask failed:", e);
    });
}

/**
 * 管理员手动退款失败任务。
 * - 仅退款一次（通过 task.refunded 防重）
 * - 退款金额使用 task.cost
 */
export async function refundTask(taskId: number) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("任务不存在");
  if (task.refunded) return;
  if (!task.cost || task.cost <= 0) {
    await prisma.task.update({
      where: { id: taskId },
      data: { refunded: true, updatedAt: new Date() },
    });
    return;
  }

  await adminAdjustBalance(task.userId, task.cost, {
    note: `任务退款 #${task.id}`,
  });

  await prisma.task.update({
    where: { id: taskId },
    data: { refunded: true, updatedAt: new Date() },
  });
}

