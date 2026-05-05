"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * AI 对话消息的 Markdown 渲染组件。
 * - 支持 GFM（表格、删除线、任务列表、自动链接）
 * - 代码块语法高亮（github-dark）
 * - 图片自适应、懒加载、外链安全跳转
 * - 仅渲染白名单 url scheme（http/https/data/mailto），过滤 javascript: 等
 */
export default function MarkdownMessage({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={"prose-chat " + (className ?? "")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        urlTransform={safeUrl}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function safeUrl(url: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (/^(https?:|mailto:|tel:|data:image\/)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  return "";
}

const components: Components = {
  a({ href, children, ...rest }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-600 hover:text-brand-700 underline underline-offset-2 break-all"
        {...rest}
      >
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    if (!src || typeof src !== "string") return null;
    return (
      <img
        src={src}
        alt={alt || ""}
        loading="lazy"
        className="my-2 max-w-full h-auto rounded-lg border border-slate-200"
      />
    );
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto">
        <table className="min-w-full text-sm border-collapse">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-slate-50">{children}</thead>;
  },
  th({ children }) {
    return (
      <th className="px-3 py-2 border border-slate-200 text-left font-semibold text-slate-700">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="px-3 py-2 border border-slate-200 align-top">{children}</td>;
  },
  pre({ children }) {
    const code = extractCode(children);
    return (
      <CodeBlock raw={code}>
        <pre className="my-3 p-3 rounded-lg bg-slate-900 text-slate-100 text-[13px] leading-6 overflow-x-auto">
          {children}
        </pre>
      </CodeBlock>
    );
  },
};

function extractCode(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractCode).join("");
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: React.ReactNode } }).props;
    return extractCode(props?.children);
  }
  return "";
}

function CodeBlock({ raw, children }: { raw: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="relative group">
      {children}
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-700/70 hover:bg-slate-600 text-slate-200 opacity-0 group-hover:opacity-100 transition"
        title={copied ? "已复制" : "复制代码"}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
