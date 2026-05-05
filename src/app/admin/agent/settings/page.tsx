import { Card } from "@/components/ui";

export default function AdminAgentSettingsPage() {
  return (
    <div className="space-y-4">
      <nav className="text-xs text-slate-500">
        <span>代理商中心</span>
        <span className="mx-1">/</span>
        <span className="text-slate-800 font-medium">系统设置</span>
      </nav>
      <h2 className="text-lg font-bold text-slate-900">系统设置</h2>
      <Card className="p-6 text-sm text-slate-600">
        代理商专属参数（通知、结算周期等）可在此扩展。
      </Card>
    </div>
  );
}
