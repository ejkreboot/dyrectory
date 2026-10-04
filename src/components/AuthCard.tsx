import type { ReactNode } from "react";
import { APP_NAME } from "../lib/supabase";
import { Logo } from "./Logo";

export function AuthCard({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-4 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <Logo />
        <span className="font-serif text-xl text-ink">{APP_NAME}</span>
      </div>
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-7 shadow-sm">
        <h1 className="font-serif text-2xl font-medium text-ink">{title}</h1>
        {description && <div className="mt-1.5 text-sm leading-relaxed text-ink-muted">{description}</div>}
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-6 text-xs text-ink-faint">Private and access-controlled. For family use only.</p>
    </div>
  );
}
