import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAgentNetworkPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const u = await prisma.user.findUnique({
    where: { id: s.id },
    select: { referralCode: true },
  });
  const base =
    (process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/, "") || "https://你的域名";
  const refUrl = u?.referralCode ? `${base}/register?ref=${u.referralCode}` : "";

  return (
    <div className="max-w-2xl">
      <Card className="p-5 space-y-3 text-sm text-slate-600">
        <p>将邀请链接发给客户，其注册后绑定为您的下级，产生的消费将按平台规则计算佣金（Commission 表）。</p>
        {u?.referralCode ? (
          <div>
            <div className="text-xs text-slate-500 mb-1">你的邀请码</div>
            <code className="block rounded-lg bg-slate-100 px-3 py-2 text-slate-800 font-mono text-sm break-all">
              {u.referralCode}
            </code>
            <div className="text-xs text-slate-500 mt-3 mb-1">注册页链接（需配置 PUBLIC_BASE_URL）</div>
            <code className="block rounded-lg bg-slate-100 px-3 py-2 text-slate-800 font-mono text-xs break-all">
              {refUrl}
            </code>
          </div>
        ) : (
          <p className="text-amber-800">未找到邀请码，请联系管理员检查账号。</p>
        )}
      </Card>
    </div>
  );
}
