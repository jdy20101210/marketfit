import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "neutral" | "market" | "sign" | "brick" | "outline";

const TONES: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  market: "bg-market-50 text-market-700 ring-1 ring-market-200",
  sign: "bg-sign-100 text-sign-800 ring-1 ring-sign-200",
  brick: "bg-brick-50 text-brick-700 ring-1 ring-brick-100",
  outline: "bg-paper text-ink-600 ring-1 ring-ink-200",
};

export function Badge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/** Mock/Real 연동 상태 표시 (색 + 텍스트 + 아이콘으로 구분) */
export function ModeBadge({ real, realLabel, mockLabel }: { real: boolean; realLabel: string; mockLabel: string }) {
  return real ? (
    <Badge tone="market" icon={<span aria-hidden className="size-1.5 rounded-full bg-market-500" />}>
      {realLabel}
    </Badge>
  ) : (
    <Badge tone="sign" icon={<span aria-hidden className="size-1.5 rounded-full border border-sign-600" />}>
      {mockLabel}
    </Badge>
  );
}
