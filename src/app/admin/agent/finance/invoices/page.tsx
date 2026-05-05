import { Card } from "@/components/ui";

export default function AdminAgentInvoicesPage() {
  return (
    <div className="space-y-4">
      <nav className="text-xs text-slate-500">
        <span>代理商中心</span>
        <span className="mx-1">/</span>
        <span>财务</span>
        <span className="mx-1">/</span>
        <span className="text-slate-800 font-medium">发票记录</span>
      </nav>
      <h2 className="text-lg font-bold text-slate-900">发票记录</h2>
      <Card className="p-6 text-sm text-slate-600">
        发票申请与开票状态在此扩展（企业结算场景）。
      </Card>
    </div>
  );
}
