import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "ok",
      uptimeSec: Math.round(process.uptime()),
      latencyMs: Date.now() - startedAt,
      version: process.env.APP_VERSION ?? null,
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "error",
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
        time: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
