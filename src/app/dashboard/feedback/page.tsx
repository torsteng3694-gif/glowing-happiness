import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import FeedbackClient from "./FeedbackClient";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const session = await requireUser();
  const list = await prisma.feedback.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <FeedbackClient
      initial={list.map((f) => ({
        id: f.id, type: f.type, endpoint: f.endpoint, question: f.question,
        status: f.status, resolution: f.resolution,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      }))}
    />
  );
}
