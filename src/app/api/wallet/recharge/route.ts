import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * 用户自助充值已关闭。
 *
 * 充值统一走管理员手动调账：/admin/users → 调账。
 * 这里保留端点只是为了告知前端/脚本：请联系管理员。
 */
export async function POST() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  return NextResponse.json(
    {
      error: "自助充值已关闭，请联系管理员充值",
      contact: "请在「反馈中心」留言，或联系客服获取卡密 / 对公汇款等方式",
    },
    { status: 403 },
  );
}
