import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "./cn";

export function EmptyState({ title, description, action, icon, className }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-3xl border border-dashed border-ink-300 bg-paper/80 px-6 py-10 text-center", className)}>
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-sign-100 text-sign-700">{icon ?? <Inbox className="size-6" aria-hidden />}</div>
      <p className="text-base font-bold text-ink-900">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-600">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "문제가 발생했어요", message, action, className }: { title?: string; message: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("rounded-3xl border border-brick-100 bg-brick-50/90 px-5 py-5", className)}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-brick-600" aria-hidden />
        <div className="min-w-0">
          <p className="font-bold text-brick-700">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-700">{message}</p>
          {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function Notice({ tone = "sign", icon, children, className }: { tone?: "sign" | "market" | "neutral"; icon?: ReactNode; children: ReactNode; className?: string }) {
  const toneClass =
    tone === "market" ? "bg-market-50 text-market-800 border-market-100" : tone === "neutral" ? "bg-ink-50 text-ink-700 border-ink-200" : "bg-sign-50 text-sign-900 border-sign-200";
  return (
    <div className={cn("flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm leading-relaxed", toneClass, className)}>
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse-soft rounded-2xl bg-ink-200/70", className)} />;
}
