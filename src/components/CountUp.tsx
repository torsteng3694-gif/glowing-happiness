"use client";
import * as React from "react";

/**
 * 数字从 0 缓动到 value，给数字指标带来轻"点亮"感。
 * - 仅在进入视口时触发
 * - 小屏/降动画偏好直接显示终值
 */
export function CountUp({
  value,
  duration = 900,
  className,
  prefix,
  suffix,
  decimals = 0,
}: {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [n, setN] = React.useState(0);
  const started = React.useRef(false);

  React.useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setN(value);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !started.current) {
            started.current = true;
            const t0 = performance.now();
            const step = (t: number) => {
              const p = Math.min(1, (t - t0) / duration);
              const eased = 1 - Math.pow(1 - p, 3);
              setN(value * eased);
              if (p < 1) requestAnimationFrame(step);
              else setN(value);
            };
            requestAnimationFrame(step);
          }
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);

  const shown = decimals > 0 ? n.toFixed(decimals) : Math.floor(n).toString();
  return (
    <span ref={ref} className={className}>
      {prefix}
      {shown}
      {suffix}
    </span>
  );
}
