import AgentDashboardClient from "@/app/agent/(protected)/dashboard/AgentDashboardClient";

export const dynamic = "force-dynamic";

/** 直接复用代理商前端组件（同一份 /api/agent/overview 接口） */
export default function AdminAgentDashboardPage() {
  return <AgentDashboardClient />;
}
