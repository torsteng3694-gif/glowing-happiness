/**
 * 电商一键出图 · 起始页（创建项目）
 *
 *   - 输入商品描述 + 上传商品图（≤9）
 *   - 一键 Demo 按钮（生成完整演示项目）
 *
 * URL: /dashboard/ecom-image/new
 *      /dashboard/ecom-image/new?demo=1  → 进入页面后自动触发 demo
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import NewProjectForm from "./NewProjectForm";

export const dynamic = "force-dynamic";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/dashboard/ecom-image/new");
  const params = await searchParams;
  return <NewProjectForm autoDemo={params.demo === "1"} />;
}
