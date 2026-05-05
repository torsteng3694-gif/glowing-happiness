import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth";

/** 仅允许站内相对路径，防止开放重定向 */
function safeNext(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== "string") return "/login";
  const s = raw.trim();
  if (!s.startsWith("/") || s.startsWith("//")) return "/login";
  if (s.includes("\\") || /[\r\n]/.test(s)) return "/login";
  return s || "/login";
}

async function resolveNext(request: Request): Promise<string> {
  const url = new URL(request.url);
  const fromQuery = safeNext(url.searchParams.get("next"));

  if (request.method !== "POST") {
    return fromQuery;
  }

  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
      const fd = await request.formData();
      const bodyNext = fd.get("next");
      if (bodyNext != null && String(bodyNext).trim() !== "") {
        return safeNext(String(bodyNext));
      }
    }
  } catch {
    /* ignore body parse errors */
  }

  return fromQuery;
}

export async function POST(request: Request) {
  await clearAuthCookie();
  const next = await resolveNext(request);
  return NextResponse.redirect(new URL(next, request.url), 303);
}

/** 直接打开 /api/auth/logout 时也能退出并回到登录页，而不是只看到 JSON */
export async function GET(request: Request) {
  await clearAuthCookie();
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  return NextResponse.redirect(new URL(next, request.url), 303);
}
