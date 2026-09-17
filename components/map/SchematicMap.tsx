"use client";

import { useMemo } from "react";
import { MapPinned, TriangleAlert } from "lucide-react";
import { cn } from "@/components/ui/cn";
import type { MapStoreView } from "./types";

/**
 * Kakao JavaScript 키가 없을 때 보여주는 데모 안내도 (MockMapProvider)
 * - 실제 지리 좌표가 아니라 '주소별 묶음'을 배치한 도식입니다.
 * - 정확한 위치처럼 보이지 않도록 안내 문구를 함께 표시합니다.
 */
export function SchematicMap(props: {
  views: MapStoreView[];
  selectedStoreId: string | null;
  reason: "no-key" | "load-failed";
  onSelect: (storeId: string) => void;
}) {
  const zones = useMemo(() => {
    const map = new Map<string, { key: string; title: string; subtitle: string; kind: "zone" | "address" | "unknown"; views: MapStoreView[] }>();
    for (const v of props.views) {
      const s = v.store;
      const key = s.locationBasis === "market_zone" ? `zone:${s.raw.zone ?? "market"}` : (s.geocodeQuery ?? "unknown");
      if (!map.has(key)) {
        map.set(key, {
          key,
          kind: s.locationBasis === "market_zone" ? "zone" : s.geocodeQuery ? "address" : "unknown",
          title:
            s.locationBasis === "market_zone"
              ? (s.raw.zone ?? "중앙시장 구역")
              : s.geocodeQuery
                ? s.geocodeQuery.replace(/^대전(광역시)?\s*동구\s*/, "")
                : "위치 미확인",
          subtitle:
            s.locationBasis === "market_zone"
              ? "구역명만 있는 점포 (세부 위치 미확인)"
              : s.locationBasis === "near_road_address"
                ? "건물 주변 노점"
                : s.locationBasis === "parcel_address"
                  ? "지번 주소"
                  : s.geocodeQuery
                    ? "도로명 주소"
                    : "주소 정보 없음",
          views: [],
        });
      }
      map.get(key)!.views.push(v);
    }
    return [...map.values()].sort((a, b) => Math.min(...a.views.map((v) => v.rank)) - Math.min(...b.views.map((v) => v.rank)));
  }, [props.views]);

  return (
    <div className="relative h-full w-full overflow-auto bg-[#f4eee2]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgb(207 197 184 / .45) 1px, transparent 1px), linear-gradient(rgb(207 197 184 / .45) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="relative p-3 sm:p-4">
        <div className="mb-3 flex items-start gap-2 rounded-2xl bg-paper/95 px-3 py-2.5 text-xs leading-relaxed text-ink-700 shadow-card">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-sign-600" aria-hidden />
          <p>
            <strong>데모 안내도</strong> · {props.reason === "no-key" ? "Kakao 지도 키가 설정되지 않아" : "Kakao 지도를 불러오지 못해"} 주소별로 묶은 도식으로
            보여줘요. 실제 위치·배치와 다를 수 있어요.
          </p>
        </div>
        {zones.length === 0 ? <p className="rounded-2xl bg-paper/95 px-4 py-6 text-center text-sm text-ink-600">표시할 추천 점포가 없어요.</p> : null}
        <ul className="grid gap-3 sm:grid-cols-2">
          {zones.map((zone) => (
            <li
              key={zone.key}
              className={cn(
                "rounded-2xl border-2 bg-paper/95 p-3 shadow-card",
                zone.kind === "zone" ? "border-dashed border-sign-500" : zone.kind === "unknown" ? "border-dotted border-ink-300" : "border-market-200",
              )}
            >
              <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                <MapPinned className="size-4 text-market-600" aria-hidden />
                {zone.title}
                <span className="tabular rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">{zone.views.length}</span>
              </p>
              <p className="mb-2 text-xs text-ink-500">{zone.subtitle}</p>
              <ul className="flex flex-wrap gap-1.5">
                {zone.views.map((v) => {
                  const selected = v.store.id === props.selectedStoreId;
                  return (
                    <li key={v.store.id}>
                      <button
                        type="button"
                        onClick={() => props.onSelect(v.store.id)}
                        aria-pressed={selected}
                        className={cn(
                          "tabular inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                          selected
                            ? "border-sign-500 bg-sign-100 text-ink-900 ring-2 ring-sign-400"
                            : v.rank <= 3
                              ? "border-market-700 bg-market-700 text-white hover:bg-market-800"
                              : "border-ink-200 bg-white text-ink-700 hover:border-ink-400",
                        )}
                      >
                        <span>{v.rank}위</span>
                        <span className="font-normal">{v.store.name}</span>
                        <span className="opacity-80">{v.rec.score}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
