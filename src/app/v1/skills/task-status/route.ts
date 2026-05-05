/**
 * GET /v1/skills/task-status?id=xxx
 * 与 /v1/media/status 功能一致的别名。
 */
export { GET } from "../../media/status/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
