"use client";

import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { ScoreMeter } from "@/components/charts/TasteBars";
import { AccuracyBadge, ScorePill } from "@/components/stores/StoreBits";
import { StoreActions } from "@/components/stores/StoreActions";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { matchHeadline, scoreLabel } from "@/lib/recommendation/engine";
import { ENTITY_KIND_LABEL } from "@/lib/stores/parse";
import type { MapStoreView } from "./types";

export function SelectedStorePanel({
  views,
  selectedId,
  hasProfile,
  mapMode,
  onSelect,
  onClose,
}: {
  views: MapStoreView[];
  selectedId: string | null;
  hasProfile: boolean;
  mapMode: "kakao" | "schematic";
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const current = views.find((v) => v.store.id === selectedId) ?? views[0];
  if (!current) return null;
  const { store, rec } = current;
  const accuracy = current.location?.accuracy ?? "unknown";

  return (
    <div
      className="rounded-3xl border border-ink-200 bg-paper p-4 shadow-float sm:p-5"
      role="region"
      aria-label={`선택한 점포: ${store.name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {views.length > 1 ? (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold text-ink-500">이 위치의 점포 {views.length}곳</p>
          <ul className="flex gap-1.5 overflow-x-auto pb-1">
            {views.map((v) => (
              <li key={v.store.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onSelect(v.store.id)}
                  aria-pressed={v.store.id === store.id}
                  className={
                    v.store.id === store.id
                      ? "rounded-full bg-market-700 px-3 py-1 text-xs font-semibold text-white"
                      : "rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-200"
                  }
                >
                  {v.store.name}
                  {hasProfile && v.rec && v.store.recommendable ? ` · ${v.rec.score}` : ""}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{store.primaryCategory}</Badge>
            <AccuracyBadge accuracy={accuracy} />
          </div>
          <h3 className="text-lg font-extrabold text-ink-900">{store.name}</h3>
          <p className="text-sm text-ink-600">
            {store.storeType} · {ENTITY_KIND_LABEL[store.entityKind]}
          </p>
        </div>
        <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-ink-100" aria-label="닫기">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {store.recommendable && hasProfile && rec ? (
        <div className="mt-3 rounded-2xl bg-market-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-bold text-market-800">
              {matchHeadline(rec.score)} <span className="font-medium text-market-700">· {scoreLabel(rec.score)}</span>
            </p>
            <ScorePill score={rec.score} />
          </div>
          <ScoreMeter score={rec.score} size="sm" />
          <p className="mt-2 text-sm leading-relaxed text-ink-800">{rec.reason}</p>
          <p className="mt-1 text-[11px] text-ink-500">{rec.reasonProvider === "gemini" ? "Gemini가 작성한 추천 이유" : "점포 데이터 기반 추천 이유"}</p>
        </div>
      ) : !store.recommendable ? (
        <p className="mt-3 rounded-2xl bg-sign-50 p-3 text-sm text-ink-700">시장 관리·고객 문의 창구예요. 개인화 추천 대상은 아니에요.</p>
      ) : (
        <p className="mt-3 rounded-2xl bg-ink-50 p-3 text-sm text-ink-700">취향 분석을 하면 이 점포와 얼마나 잘 맞는지 알려드려요.</p>
      )}

      <p className="mt-2 text-xs text-ink-500">
        📍{" "}
        {current.location
          ? current.location.note
          : mapMode === "schematic"
            ? `${store.raw.addressRaw || "주소 정보 없음"} — 데모 안내도에서 주소별로 묶어 보여줘요 (좌표 미확인)`
            : "좌표를 확인하지 못해 지도에 표시하지 않았어요."}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {store.recommendable ? <StoreActions storeId={store.id} compact include={["like", "bookmark"]} /> : <span />}
        <Link href={`/store/${store.id}`} className={buttonClass("primary", "sm")}>
          상세 보기 <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
