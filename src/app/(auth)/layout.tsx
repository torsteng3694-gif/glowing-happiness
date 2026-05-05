import Link from "next/link";
import { Sparkles } from "lucide-react";
import LocaleSwitcher from "@/i18n/LocaleSwitcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <header className="px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          AI Hub
        </Link>
        <LocaleSwitcher variant="ghost" />
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
