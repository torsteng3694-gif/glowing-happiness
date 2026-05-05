import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import KeysClient from "./KeysClient";

export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const session = await requireUser();
  const keys = await prisma.apiKey.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
  });
  return (
    <KeysClient
      initial={keys.map((k) => ({
        id: k.id, name: k.name, keyPrefix: k.keyPrefix,
        lastUsedAt: k.lastUsedAt?.toISOString() || null,
        revokedAt: k.revokedAt?.toISOString() || null,
        createdAt: k.createdAt.toISOString(),
      }))}
    />
  );
}
