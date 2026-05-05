import { prisma } from "@/lib/db";
import { toStatusShape } from "@/lib/task-status";
import AdminTasksClient from "./AdminTasksClient";

export const dynamic = "force-dynamic";

export default async function AdminTasks() {
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      user: { select: { email: true, name: true } },
      model: { select: { name: true, provider: { select: { logo: true } } } },
    },
  });
  return (
    <AdminTasksClient
      initial={tasks.map((t) => ({
        ...toStatusShape(t),
        user_email: t.user.email,
        user_name: t.user.name,
        model_name: t.model?.name || null,
        provider_logo: t.model?.provider?.logo || null,
        prompt: t.prompt,
      }))}
    />
  );
}
