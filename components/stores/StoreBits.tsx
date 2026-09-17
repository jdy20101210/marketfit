import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import type { RecommendationItem, StoreDTO } from "@/lib/api/schemas";
import { scoreLabel } from "@/lib/recommendation/engine";
import { ENTITY_KIND_LABEL } from "@/lib/stores/parse";
import type { LocationAccuracy } from "@/lib/stores/types";

export type StoreSummary = Pick<StoreDTO, "id" | "name" | "storeType" | "primaryCategory" | "categories" | "entityKind" | "recommendable"> & {
  accuracy: LocationAccuracy;
};

export function toSummary(s: StoreDTO): StoreSummary {
  return {
    id: s.id,
    name: s.name,
    storeType: s.storeType,
    primaryCategory: s.primaryCategory,
    categories: s.categories,
    entityKind: s.entityKind,
    recommendable: s.recommendable,
    accuracy: s.location.accuracy,
  };
}

export const ACCURACY_LABEL: Record<LocationAccuracy, string> = {
  exact: "정확한 위치",
  approximate: "대략적 위치",
  unknown: "위치 미확인",
};

export function AccuracyBadge({ accuracy }: { accuracy: LocationAccuracy }) {
  return (
    <Badge
      tone={accuracy === "exact" ? "market" : accuracy === "approximate" ? "sign" : "outline"}
      icon={<MapPin className="size-3" aria-hidden />}
    >
      {ACCURACY_LABEL[accuracy]}
    </Badge>
  );
}

export function ScorePill({ score, className }: { score: number; className?: string }) {
  const top = score >= 70;
  return (
    <span
      className={cn(
        "tabular inline-flex min-w-11 shrink-0 items-baseline justify-center gap-0.5 whitespace-nowrap rounded-xl px-2 py-1 text-sm font-extrabold",
        top ? "bg-market-700 text-white" : "bg-ink-100 text-ink-700",
        className,
      )}
      aria-label={`추천 점수 ${score}점, ${scoreLabel(score)}`}
    >
      {score}
      <span className="text-[10px] font-semibold opacity-80">점</span>
    </span>
  );
}

export function StoreMiniCard({ store, rec, rank }: { store: StoreSummary; rec?: RecommendationItem; rank?: number }) {
  return (
    <Link
      href={`/store/${store.id}`}
      className="group flex h-full items-start gap-3 rounded-2xl border border-ink-200/80 bg-paper p-4 transition-colors hover:border-market-300 hover:bg-white"
    >
      {rank !== undefined ? (
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sign-400 text-sm font-extrabold text-ink-900">{rank}</span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-bold text-ink-900 group-hover:text-market-700">{store.name}</p>
            <p className="truncate text-xs text-ink-500">
              {store.storeType} · {ENTITY_KIND_LABEL[store.entityKind]}
            </p>
          </div>
          {rec && store.recommendable ? <ScorePill score={rec.score} /> : null}
        </div>
        {rec ? <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-700">{rec.reason}</p> : null}
      </div>
      <ChevronRight className="mt-1 size-4 shrink-0 text-ink-300 group-hover:text-market-600" aria-hidden />
    </Link>
  );
}
