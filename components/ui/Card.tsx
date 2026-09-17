import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export function Card({ className, ...rest }: ComponentProps<"section">) {
  return <section className={cn("rounded-3xl border border-ink-200/70 bg-paper/95 shadow-card backdrop-blur-sm", className)} {...rest} />;
}

export function CardHeader({
  title,
  description,
  eyebrow,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-xs font-semibold tracking-wide text-market-600">{eyebrow}</p> : null}
        <h2 className="text-lg font-bold text-ink-900">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-relaxed text-ink-600">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 animate-rise">
      {eyebrow ? (
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-sign-100 px-3 py-1 text-xs font-bold text-sign-800">{eyebrow}</p>
      ) : null}
      <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
      {description ? <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-600">{description}</p> : null}
      {children}
    </header>
  );
}
