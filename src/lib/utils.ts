import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(n: number, digits = 2) {
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function relativeTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return date.toLocaleDateString("zh-CN");
}

export function randomCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export function truncate(s: string, n = 80) {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

/**
 * 生成一个随机 id，浏览器端兼容「非安全上下文」（HTTP + 非 localhost）场景。
 *
 * 背景：`crypto.randomUUID()` 和 `crypto.getRandomValues()` 需要 Secure Context
 * （HTTPS 或 localhost）。用局域网 IP（比如 http://192.168.1.25:3000）访问时，
 * `crypto.randomUUID` 直接是 undefined，调用会抛 TypeError。
 */
export function uid(): string {
  try {
    const g: any = globalThis as any;
    if (g?.crypto?.randomUUID) return g.crypto.randomUUID();
    if (g?.crypto?.getRandomValues) {
      const buf = new Uint8Array(16);
      g.crypto.getRandomValues(buf);
      // 改成 RFC4122 v4 风格
      buf[6] = (buf[6] & 0x0f) | 0x40;
      buf[8] = (buf[8] & 0x3f) | 0x80;
      const hex: string[] = [];
      for (let i = 0; i < buf.length; i++) hex.push(buf[i].toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
    }
  } catch {
    // ignore
  }
  // 纯 Math.random 兜底（碰撞概率足够低）
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}
