import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { randomCode } from "./utils";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-please-change-in-production",
);
const COOKIE = "ai_hub_token";

export type SessionUser = {
  id: string;
  email: string;
  role: string;
  name: string | null;
};

export async function hashPassword(pwd: string) {
  return bcrypt.hash(pwd, 10);
}
export async function verifyPassword(pwd: string, hash: string) {
  return bcrypt.compare(pwd, hash);
}

export async function signToken(user: SessionUser) {
  return new SignJWT({ id: user.id, email: user.email, role: user.role, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      id: payload.id as string,
      email: payload.email as string,
      role: (payload.role as string) || "user",
      name: (payload.name as string) || null,
    };
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearAuthCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireUser(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHORIZED");
  return s;
}

export async function requireAdmin(): Promise<SessionUser> {
  const s = await requireUser();
  if (s.role !== "admin") throw new Error("FORBIDDEN");
  return s;
}

/** 代理商中心：role = agent；管理员也可进入便于调试（可选，上架时可改为仅 agent） */
export async function requireAgent(): Promise<SessionUser> {
  const s = await requireUser();
  if (s.role !== "agent" && s.role !== "admin") throw new Error("FORBIDDEN");
  return s;
}

// 创建新用户，附带邀请人绑定、注册奖励
export async function createUser(opts: {
  email: string;
  password: string;
  name?: string;
  referralCode?: string;
}) {
  const exists = await prisma.user.findUnique({ where: { email: opts.email } });
  if (exists) throw new Error("该邮箱已被注册");

  let referredById: string | undefined;
  if (opts.referralCode) {
    const inviter = await prisma.user.findUnique({ where: { referralCode: opts.referralCode } });
    if (inviter) referredById = inviter.id;
  }

  const signupBonusSetting = await prisma.setting.findUnique({ where: { key: "signup_bonus" } });
  const signupBonus = signupBonusSetting ? parseFloat(signupBonusSetting.value) : 5;

  let code = randomCode(8);
  for (let i = 0; i < 5; i++) {
    const c = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!c) break;
    code = randomCode(8);
  }

  const user = await prisma.user.create({
    data: {
      email: opts.email,
      passwordHash: await hashPassword(opts.password),
      name: opts.name,
      referralCode: code,
      referredById,
      balance: signupBonus,
    },
  });

  if (signupBonus > 0) {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "recharge",
        amount: signupBonus,
        balance: signupBonus,
        note: "注册赠送体验金",
      },
    });
  }

  return user;
}

// 按 API Key 鉴权（用于 /v1 接口）
export async function authenticateApiKey(authHeader?: string | null) {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const hash = await bcrypt.hash(token, 10).catch(() => null); // 不是真比较
  // 真正校验：我们在创建时用 sha256 存 keyHash，这里改用确定性 hash
  return null;
}

// 使用 WebCrypto 做 sha256（Edge/Node 都兼容）
async function sha256(input: string) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashApiKey(key: string) {
  return sha256(key);
}

/**
 * 从请求中按优先级提取 API Key，兼容 4 种鉴权方式：
 *   1. Authorization: Bearer sk-xxx        （推荐，OpenAI 风格）
 *   2. x-api-key: sk-xxx                    （Anthropic 风格）
 *   3. x-goog-api-key: sk-xxx               （Google 风格）
 *   4. ?key=sk-xxx                          （Query 参数）
 * 多个都存在时以 Bearer 为准。
 */
export function extractApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m && m[1].trim()) return m[1].trim();
  }
  const xApi = req.headers.get("x-api-key");
  if (xApi?.trim()) return xApi.trim();
  const xGoog = req.headers.get("x-goog-api-key");
  if (xGoog?.trim()) return xGoog.trim();
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("key");
    if (q?.trim()) return q.trim();
  } catch { /* ignore */ }
  return null;
}

/** 根据 token 字符串查找 user 和 apiKey 记录（内部使用） */
async function findUserAndKeyByToken(token: string) {
  const keyHash = await sha256(token);
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });
  if (!apiKey || apiKey.revokedAt) return null;
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });
  return { user: apiKey.user, apiKey };
}

async function findUserByApiKey(token: string) {
  const pair = await findUserAndKeyByToken(token);
  return pair?.user ?? null;
}

/** 向后兼容：接收 Authorization 头字符串 */
export async function authenticateBearer(authHeader?: string | null) {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  return findUserByApiKey(token);
}

/** 推荐：接收整个 Request，自动支持 4 种鉴权方式 */
export async function authenticateRequest(req: Request) {
  const token = extractApiKey(req);
  if (!token) return null;
  return findUserByApiKey(token);
}

/** 同时返回 user 和 apiKey（用于渠道权限解析） */
export async function authenticateRequestWithKey(req: Request) {
  const token = extractApiKey(req);
  if (!token) return null;
  return findUserAndKeyByToken(token);
}

export function generateApiKey() {
  const rand = crypto.getRandomValues(new Uint8Array(32));
  const key = "sk-aihub-" + Array.from(rand).map((b) => b.toString(16).padStart(2, "0")).join("");
  const prefix = key.slice(0, 14);
  return { key, prefix };
}
