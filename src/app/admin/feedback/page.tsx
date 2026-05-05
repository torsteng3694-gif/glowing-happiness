import { prisma } from "@/lib/db";
import AdminFeedbackClient from "./AdminFeedbackClient";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const list = await prisma.feedback.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { user: { select: { email: true, name: true } } },
    take: 300,
  });
  return (
    <AdminFeedbackClient
      initial={list.map((f) => ({
        id: f.id, type: f.type, endpoint: f.endpoint, question: f.question,
        contact: f.contact,
        status: f.status, resolution: f.resolution,
        userEmail: f.user.email, userName: f.user.name,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      }))}
    />
  );
}
