import { Card } from "@/components/ui";

export default function AdminAgentCustomersPage() {
  return (
    <div className="max-w-3xl">
      <Card className="p-6 text-slate-600 text-sm">
        通过本账号邀请码注册的下级用户列表（来自 User.referredById），后续可加搜索与分页表格。
      </Card>
    </div>
  );
}
