"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/* ============================================================
 * Button
 * - 即时点击反馈（active:scale + brightness）
 * - 内置 loading（点击即锁，不依赖外部 state 淡入）
 * - touch-manipulation，消除移动端 300ms tap 延迟
 * - 明确过渡属性（colors/transform/shadow），避免全属性过渡浪费主线程
 * ============================================================ */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline" | "glow";
  size?: "sm" | "md" | "lg";
  /** 显示 spinner 并自动禁用，防止重复点击 */
  loading?: boolean;
  /** 左侧 / 右侧图标（仅作为语义占位，也可直接在 children 写） */
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

export const Button = React.forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { className, variant = "primary", size = "md", loading, leftIcon, rightIcon, disabled, children, ...props },
  ref,
) {
  const base =
    "relative inline-flex items-center justify-center gap-2 rounded-lg font-medium select-none " +
    "touch-manipulation " +
    "transition-[background-color,color,box-shadow,border-color,opacity,transform] duration-100 ease-out " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-white " +
    "active:scale-[0.98] active:brightness-[0.97] " +
    "disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100";
  const variants: Record<string, string> = {
    primary:   "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
    secondary: "bg-slate-900 text-white hover:bg-slate-800",
    ghost:     "text-slate-700 hover:bg-slate-100",
    danger:    "bg-rose-600 text-white hover:bg-rose-700",
    outline:   "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-brand-300",
    glow:      "btn-glow",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {/* loading 时用绝对定位的 spinner 覆盖，保证内容不重排 */}
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Spinner />
        </span>
      )}
      <span
        className={cn(
          "inline-flex items-center gap-2 transition-opacity duration-100",
          loading && "opacity-0",
        )}
      >
        {leftIcon}
        {children}
        {rightIcon}
      </span>
    </button>
  );
});

/* ============================================================
 * Inputs
 * ============================================================ */
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm",
        "transition-[border-color,box-shadow] duration-150",
        "focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-400",
        "placeholder:text-slate-400",
        className,
      )}
      {...props}
    />
  );
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm",
          "transition-[border-color,box-shadow] duration-150",
          "focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-400",
          "placeholder:text-slate-400 resize-y min-h-[80px]",
          className,
        )}
        {...props}
      />
    );
  },
);

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 px-3 pr-8 rounded-lg border border-slate-300 bg-white text-sm",
        "transition-[border-color,box-shadow] duration-150",
        "focus:outline-none focus:ring-2 focus:ring-brand-400/40",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/* ============================================================
 * Card
 * ============================================================ */
export function Card({
  className,
  children,
  hover = false,
}: {
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white shadow-sm",
        hover && "glow-hover",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ============================================================
 * Badge / Label / EmptyState / Spinner
 * ============================================================ */
export function Badge({
  children, color = "slate", className,
}: { children: React.ReactNode; color?: "slate" | "brand" | "green" | "amber" | "rose" | "violet"; className?: string }) {
  const map = {
    slate: "bg-slate-100 text-slate-700",
    brand: "bg-brand-50 text-brand-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", map[color], className)}>
      {children}
    </span>
  );
}

export function Label({ children, htmlFor, className }: { children: React.ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("block text-sm font-medium text-slate-700 mb-1.5", className)}>
      {children}
    </label>
  );
}

export function EmptyState({ title, desc, icon }: { title: string; desc?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">{icon}</div>}
      <div className="text-slate-700 font-medium">{title}</div>
      {desc && <div className="text-sm text-slate-500 mt-1">{desc}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span className={cn("inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin", className)} />
  );
}
