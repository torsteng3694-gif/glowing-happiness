import { Card } from "@/components/ui";

export default function AgentCustomersPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-bold text-slate-900 mb-2">客户列表</h1>
      <Card className="p-6 text-slate-600 text-sm">
        将展示通过您的邀请码注册的下级用户列表、消费与复购情况。数据模型已存在（User.referredById），可在此做表格与搜索。
      </Card>
    </div>
  );
}
