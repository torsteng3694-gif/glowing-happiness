import XingyeClient from "./XingyeClient";

export const metadata = {
  title: "星爷ai · GPT-5.4 对话",
  description: "由星爷ai 驱动的 GPT-5.4 在线对话，支持流式输出、多轮记忆与 Markdown 渲染。",
};

export default function Page() {
  const model = process.env.XINGYE_MODEL || "gpt-5.4";
  const configured = Boolean(process.env.XINGYE_API_KEY && process.env.XINGYE_BASE_URL);
  return <XingyeClient model={model} configured={configured} />;
}
