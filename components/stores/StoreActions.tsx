"use client";

import { useState } from "react";
import { Bookmark, Check, EyeOff, Footprints, Heart } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { recordInteraction } from "@/lib/client/recommendations";
import { useMarketFit } from "@/lib/client/store";

type ActionType = "like" | "bookmark" | "visit" | "dismiss";

/**
 * 토글 버튼: 이름은 고정하고 상태는 aria-pressed + 채워진 아이콘·체크 표시로 알립니다
 * (이름과 상태가 함께 바뀌면 스크린리더에서 의미가 뒤집혀 들릴 수 있음).
 */
const ACTIONS: { type: ActionType; list: "liked" | "bookmarked" | "visited" | "dismissed"; label: string; icon: typeof Heart }[] = [
  { type: "like", list: "liked", label: "좋아요", icon: Heart },
  { type: "bookmark", list: "bookmarked", label: "저장", icon: Bookmark },
  { type: "visit", list: "visited", label: "방문했어요", icon: Footprints },
  { type: "dismiss", list: "dismissed", label: "관심 없음", icon: EyeOff },
];

export function StoreActions({
  storeId,
  storeName,
  compact = false,
  include,
}: {
  storeId: string;
  /** 목록에서 여러 점포의 버튼이 함께 보일 때 스크린리더용 점포 이름 */
  storeName?: string;
  compact?: boolean;
  include?: ActionType[];
}) {
  const { state, hydrated } = useMarketFit();
  const [busy, setBusy] = useState<ActionType | null>(null);
  const actions = ACTIONS.filter((a) => !include || include.includes(a.type));

  return (
    <div className={cn("flex flex-wrap gap-1.5", compact && "gap-1")}>
      {actions.map((a) => {
        const active = hydrated && state.interactions[a.list].includes(storeId);
        return (
          <button
            key={a.type}
            type="button"
            aria-pressed={active}
            aria-label={storeName ? `${storeName} ${a.label}` : undefined}
            disabled={busy !== null}
            onClick={async () => {
              setBusy(a.type);
              try {
                await recordInteraction(storeId, a.type, !active);
              } finally {
                setBusy(null);
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border font-semibold transition-colors disabled:opacity-60",
              compact ? "h-9 px-3 text-xs" : "h-10 px-3.5 text-sm",
              active
                ? a.type === "dismiss"
                  ? "border-ink-400 bg-ink-100 text-ink-800"
                  : a.type === "like"
                    ? "border-brick-300 bg-brick-50 text-brick-700"
                    : "border-market-300 bg-market-50 text-market-800"
                : "border-ink-200 bg-paper text-ink-700 hover:border-ink-300",
            )}
          >
            <a.icon className={cn("size-4", active && a.type !== "dismiss" && "fill-current")} aria-hidden />
            {a.label}
            {active ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
