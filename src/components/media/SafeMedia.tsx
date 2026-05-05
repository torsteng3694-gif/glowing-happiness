"use client";
/**
 * SafeMedia：外链媒体的安全渲染组件
 * -------------------------------------------
 * 上游 CDN（如 cos.lingkeai.vip）会做 Referer / hotlink 检查，
 * 直接用 <img src=...> 在跨域站点上经常被退回 403/被浏览器当作"broken image"隐藏。
 *
 * 解决方案：所有外部 http(s) 链接统一走 `/api/proxy?url=...` 服务端中转，
 * 浏览器视为同源，CDN 看到的 Referer 也是远端自身域名 —— 可绕过大多数防盗链策略。
 *
 * 兜底逻辑：
 *   1. 如果代理失败（或已是同源 / data: / blob: URL），直接用原始 URL
 *   2. onError 时显示"加载失败，新窗口打开"占位符
 */
import * as React from "react";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/** 判断一个 URL 是否需要走服务端代理（外部 http(s) 资源才需要） */
function needsProxy(src: string): boolean {
  if (!src) return false;
  if (src.startsWith("data:") || src.startsWith("blob:")) return false;
  if (src.startsWith("/")) return false; // 同源相对路径
  if (!/^https?:\/\//i.test(src)) return false;
  try {
    const u = new URL(src);
    // 如果就是当前页面同源，也不需要代理
    if (typeof window !== "undefined" && u.origin === window.location.origin) return false;
    return true;
  } catch {
    return false;
  }
}

/** 把外部 URL 包装成走 /api/proxy?url= */
export function proxify(src: string): string {
  if (!needsProxy(src)) return src;
  return `/api/proxy?url=${encodeURIComponent(src)}`;
}

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "onError"> & {
  src: string;
  fallbackText?: string;
};
export function SafeImage({ src, className, alt = "", fallbackText, ...rest }: ImgProps) {
  const [failed, setFailed] = React.useState(false);
  const [useDirect, setUseDirect] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
    setUseDirect(false);
  }, [src]);

  if (!src) return <FallbackBox className={className} text={fallbackText || "无地址"} />;
  if (failed) {
    return (
      <FallbackBox className={className} text={fallbackText || "图片加载失败"}>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 underline"
          onClick={(e) => e.stopPropagation()}
        >
          新窗口打开 <ExternalLink className="w-3 h-3" />
        </a>
      </FallbackBox>
    );
  }

  const actualSrc = useDirect ? src : proxify(src);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={actualSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => {
        // 第一次失败：如果是走的代理，则回退到直连原始 URL 再试一次
        if (!useDirect && actualSrc !== src) {
          setUseDirect(true);
        } else {
          setFailed(true);
        }
      }}
      {...rest}
    />
  );
}

type VideoProps = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "onError"> & {
  src: string;
  poster?: string;
  fallbackText?: string;
};
export function SafeVideo({ src, poster, className, fallbackText, ...rest }: VideoProps) {
  const [failed, setFailed] = React.useState(false);
  const [useDirect, setUseDirect] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
    setUseDirect(false);
  }, [src]);

  if (!src) return <FallbackBox className={className} text={fallbackText || "无视频"} />;
  if (failed) {
    return (
      <FallbackBox className={className} text={fallbackText || "视频加载失败"}>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 underline"
          onClick={(e) => e.stopPropagation()}
        >
          新窗口打开 <ExternalLink className="w-3 h-3" />
        </a>
      </FallbackBox>
    );
  }

  const actualSrc = useDirect ? src : proxify(src);
  const actualPoster = poster ? (useDirect ? poster : proxify(poster)) : undefined;
  return (
    <video
      src={actualSrc}
      poster={actualPoster}
      preload="metadata"
      playsInline
      className={className}
      onError={() => {
        if (!useDirect && actualSrc !== src) {
          setUseDirect(true);
        } else {
          setFailed(true);
        }
      }}
      {...rest}
    />
  );
}

function FallbackBox({
  className,
  text,
  children,
}: {
  className?: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-3 bg-slate-100 text-slate-500 gap-1",
        className,
      )}
    >
      <AlertTriangle className="w-5 h-5 text-amber-500" />
      <div className="text-[11px] leading-tight">{text}</div>
      {children}
    </div>
  );
}
