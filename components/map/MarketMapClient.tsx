"use client";

import { useCallback, useMemo, useState } from "react";
import { Bookmark, Heart, List, Map as MapIcon, MapPin, Sparkles } from "lucide-react";
import { AccuracyBadge, ScorePill } from "@/components/stores/StoreBits";
import { LinkButton, Spinner } from "@/components/ui/Button";
import { ErrorState, Notice } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import type { StoreDTO } from "@/lib/api/schemas";
import { recordView, useRecommendations } from "@/lib/client/recommendations";
import { RECOMMENDED_MIN_SCORE } from "@/lib/recommendation/engine";
import { STORE_CATEGORIES, type StoreCategory } from "@/lib/stores/types";
import { KakaoMap } from "./KakaoMap";
import { SchematicMap } from "./SchematicMap";
import { SelectedStorePanel } from "./SelectedStorePanel";
import type { MapStoreView, ResolvedLocation } from "./types";

const SCORE_FILTERS = [
  { value: 0, label: "전체" },
  { value: 55, label: "55+" },
  { value: 70, label: "70+" },
  { value: 85, label: "85+" },
];

export function MarketMapClient({
  stores,
  kakaoJsKey,
  geocodingMode,
  initialStoreId,
}: {
  stores: StoreDTO[];
  kakaoJsKey: string | null;
  geocodingMode: "kakao" | "mock";
  initialStoreId: string | null;
}) {
  const { hydrated, profile, recommendations, interactions, loading, error, retry } = useRecommendations();
  const hasProfile = Boolean(profile);

  const [category, setCategory] = useState<StoreCategory | "all">("all");
  const [minScore, setMinScore] = useState(0);
  const [hideDismissed, setHideDismissed] = useState(true);
  const [selection, setSelection] = useState<{ ids: string[]; active: string } | null>(() =>
    initialStoreId && stores.some((s) => s.id === initialStoreId) ? { ids: [initialStoreId], active: initialStoreId } : null,
  );
  const [browserLocations, setBrowserLocations] = useState<Record<string, ResolvedLocation>>({});
  const [mapError, setMapError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"map" | "list">("map");

  const recById = useMemo(() => new Map((recommendations?.items ?? []).map((r) => [r.storeId, r])), [recommendations]);
  const order = useMemo(() => new Map((recommendations?.items ?? []).map((r, i) => [r.storeId, i])), [recommendations]);

  const allViews: MapStoreView[] = useMemo(() => {
    let rank = 0;
    const views = stores.map((store) => {
      const rec = recById.get(store.id) ?? null;
      const serverLoc: ResolvedLocation | null =
        store.location.lat !== null && store.location.lng !== null
          ? { lat: store.location.lat, lng: store.location.lng, accuracy: store.location.accuracy, note: store.location.note, source: "server" }
          : null;
      return { store, rec, location: serverLoc ?? browserLocations[store.id] ?? null, rank: null as number | null };
    });
    // 목록은 점수 순(추천 대상 → 관심 없음 → 안내 창구), 동점이면 다양화된 추천 순서
    const bucket = (v: MapStoreView) => (!v.store.recommendable ? 2 : v.rec?.dismissed ? 1 : 0);
    views.sort(
      (a, b) =>
        bucket(a) - bucket(b) ||
        (b.rec?.score ?? -1) - (a.rec?.score ?? -1) ||
        (order.get(a.store.id) ?? 999) - (order.get(b.store.id) ?? 999) ||
        a.store.id.localeCompare(b.store.id),
    );
    for (const v of views) if (hasProfile && v.store.recommendable && v.rec && !v.rec.dismissed) v.rank = ++rank;
    return views;
  }, [stores, recById, order, browserLocations, hasProfile]);

  const categories = useMemo(() => STORE_CATEGORIES.filter((c) => stores.some((s) => s.categories.includes(c))), [stores]);

  const filtered = useMemo(
    () =>
      allViews.filter((v) => {
        if (category !== "all" && !v.store.categories.includes(category)) return false;
        if (hasProfile && hideDismissed && interactions.dismissed.includes(v.store.id)) return false;
        if (hasProfile && minScore > 0 && (!v.store.recommendable || (v.rec?.score ?? 0) < minScore)) return false;
        return true;
      }),
    [allViews, category, hasProfile, hideDismissed, interactions.dismissed, minScore],
  );

  const located = filtered.filter((v) => v.location);
  const unlocated = filtered.filter((v) => !v.location);
  // 강조 기준: 70점 이상이거나 다양화된 추천 상위 3곳 (취향과 맞는 점포가 적은 경우에도 출발점을 제공)
  const highlightIds = useMemo(() => {
    if (!hasProfile || !recommendations) return new Set<string>();
    const picks = recommendations.items.filter((i) => i.recommendable && !i.dismissed);
    return new Set([...picks.slice(0, 3), ...picks.filter((i) => i.score >= RECOMMENDED_MIN_SCORE)].map((i) => i.storeId));
  }, [hasProfile, recommendations]);
  const recommendedCount = filtered.filter((v) => highlightIds.has(v.store.id)).length;

  const select = useCallback((ids: string[]) => {
    setSelection({ ids, active: ids[0]! });
    recordView(ids[0]!);
  }, []);
  const onBrowserGeocoded = useCallback((locs: Record<string, ResolvedLocation>) => setBrowserLocations((prev) => ({ ...prev, ...locs })), []);
  const onMapError = useCallback((msg: string) => setMapError(msg), []);

  const selectedViews = selection ? allViews.filter((v) => selection.ids.includes(v.store.id)) : [];
  const useKakao = Boolean(kakaoJsKey) && !mapError;

  return (
    <div className="container-page max-w-7xl pt-4 sm:pt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-sign-700">STEP 5</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">AI 시장 지도</h1>
          <p className="mt-1 text-sm text-ink-600">
            {hasProfile
              ? `나와 잘 맞는 점포(${RECOMMENDED_MIN_SCORE}점 이상 또는 추천 상위 3곳)를 초록색으로 강조했어요.`
              : "취향 분석 전이에요. 점포 위치를 먼저 둘러볼 수 있어요."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-paper px-3 py-1 text-xs font-bold text-ink-700 ring-1 ring-ink-200">
            <MapIcon className="size-3.5" aria-hidden /> {useKakao ? "Kakao Map" : "데모 안내도"}
          </span>
          <div className="grid grid-cols-2 rounded-xl border border-ink-200 bg-paper p-0.5 lg:hidden" role="group" aria-label="보기 전환">
            {(["map", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={mobileView === v}
                onClick={() => setMobileView(v)}
                className={cn("flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold", mobileView === v ? "bg-market-700 text-white" : "text-ink-600")}
              >
                {v === "map" ? <MapIcon className="size-3.5" aria-hidden /> : <List className="size-3.5" aria-hidden />}
                {v === "map" ? "지도" : "목록"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {hydrated && !hasProfile ? (
        <Notice className="mb-3" icon={<Sparkles className="size-4" aria-hidden />}>
          취향 분석을 하면 점포마다 추천 점수와 이유가 표시돼요.{" "}
          <LinkButton href="/onboarding" size="sm" variant="sign" className="ml-1 h-7 px-2.5 align-middle">
            분석 시작
          </LinkButton>
        </Notice>
      ) : null}
      {error ? <ErrorState className="mb-3" message={error} action={<button className="text-sm font-bold underline" onClick={retry}>다시 시도</button>} /> : null}

      {/* 필터: 한 줄, 지도와 목록 모두에 적용 */}
      <div className="mb-3 space-y-2">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="카테고리 필터">
          {(["all", ...categories] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
                category === c ? "border-market-700 bg-market-700 text-white" : "border-ink-200 bg-paper text-ink-700 hover:border-ink-300",
              )}
            >
              {c === "all" ? "전체" : c}
            </button>
          ))}
        </div>
        {hasProfile ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1" role="group" aria-label="추천 점수 필터">
              <span className="mr-1 text-xs font-semibold text-ink-500">추천 점수</span>
              {SCORE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={minScore === f.value}
                  onClick={() => setMinScore(f.value)}
                  className={cn(
                    "tabular rounded-lg px-2.5 py-1 text-xs font-bold",
                    minScore === f.value ? "bg-sign-400 text-ink-900" : "bg-paper text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-600">
              <input type="checkbox" className="size-4 accent-market-700" checked={hideDismissed} onChange={(e) => setHideDismissed(e.target.checked)} />
              관심 없음 숨기기
            </label>
            <span className="text-xs text-ink-500" aria-live="polite">
              {filtered.length}곳 표시 · 추천 {recommendedCount}곳
            </span>
          </div>
        ) : null}
      </div>

      {mapError ? <ErrorState className="mb-3" title="Kakao 지도를 불러오지 못해 데모 안내도로 전환했어요" message={mapError} /> : null}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* 목록 */}
        <section aria-label="점포 목록" className={cn("order-2 lg:order-1", mobileView === "map" && "hidden lg:block")}>
          <div className="rounded-3xl border border-ink-200/70 bg-paper/95 shadow-card lg:max-h-[calc(100dvh-17rem)] lg:overflow-y-auto">
            {loading && hasProfile && !recommendations ? (
              <p className="flex items-center gap-2 p-4 text-sm text-ink-600">
                <Spinner /> 추천 점수 계산 중…
              </p>
            ) : null}
            <ul className="divide-y divide-ink-100">
              {located.concat(unlocated).map((v) => (
                <li key={v.store.id}>
                  <button
                    type="button"
                    onClick={() => {
                      select([v.store.id]);
                      setMobileView("map");
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cream",
                      selection?.active === v.store.id && "bg-sign-50",
                    )}
                  >
                    <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-ink-100 text-xs font-bold text-ink-600">
                      {v.rank ?? "·"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-ink-900">{v.store.name}</span>
                        {interactions.liked.includes(v.store.id) ? <Heart className="size-3.5 shrink-0 fill-brick-500 text-brick-500" aria-label="좋아요" /> : null}
                        {interactions.bookmarked.includes(v.store.id) ? <Bookmark className="size-3.5 shrink-0 fill-market-600 text-market-600" aria-label="찜" /> : null}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                        <span className="truncate">{v.store.storeType}</span>
                        {!v.location ? (
                          <span className="inline-flex shrink-0 items-center gap-0.5 text-ink-400">
                            <MapPin className="size-3" aria-hidden />
                            위치 미확인
                          </span>
                        ) : v.location.accuracy === "approximate" ? (
                          <span className="shrink-0 text-sign-700">대략적 위치</span>
                        ) : null}
                      </span>
                    </span>
                    {hasProfile && v.rec && v.store.recommendable ? <ScorePill score={v.rec.score} /> : null}
                    {!v.store.recommendable ? <span className="shrink-0 rounded-lg bg-sign-100 px-2 py-1 text-[11px] font-bold text-sign-800">안내</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            {filtered.length === 0 ? <p className="p-6 text-center text-sm text-ink-500">조건에 맞는 점포가 없어요. 필터를 바꿔보세요.</p> : null}
          </div>
        </section>

        {/* 지도 */}
        <section aria-label="지도" className={cn("order-1 lg:order-2", mobileView === "list" && "hidden lg:block")}>
          <div className="relative h-[62dvh] min-h-[380px] overflow-hidden rounded-3xl border border-ink-200/70 bg-ink-100 shadow-card lg:h-[calc(100dvh-17rem)]">
            {useKakao ? (
              <KakaoMap
                appKey={kakaoJsKey!}
                views={filtered}
                allStores={stores}
                selectedStoreId={selection?.active ?? null}
                hasProfile={hasProfile}
                highlightIds={highlightIds}
                onSelectGroup={select}
                onBrowserGeocoded={onBrowserGeocoded}
                onError={onMapError}
              />
            ) : (
              <SchematicMap
                views={filtered}
                selectedStoreId={selection?.active ?? null}
                hasProfile={hasProfile}
                highlightIds={highlightIds}
                reason={kakaoJsKey ? "load-failed" : "no-key"}
                onSelect={(id) => select([id])}
              />
            )}

            <p className="sr-only" aria-live="polite">
              {selectedViews.length ? `${selectedViews.find((v) => v.store.id === selection?.active)?.store.name ?? ""} 정보를 열었어요.` : ""}
            </p>
            {selectedViews.length ? (
              <div className="fixed inset-x-2 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-50 max-h-[70dvh] overflow-y-auto rounded-3xl md:absolute md:inset-x-auto md:bottom-3 md:right-3 md:z-20 md:w-[380px] md:max-h-[calc(100%-1.5rem)]">
                <SelectedStorePanel
                  views={selectedViews}
                  selectedId={selection!.active}
                  hasProfile={hasProfile}
                  mapMode={useKakao ? "kakao" : "schematic"}
                  onSelect={(id) => {
                    setSelection((s) => (s ? { ...s, active: id } : s));
                    recordView(id);
                  }}
                  onClose={() => setSelection(null)}
                />
              </div>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-600" role="group" aria-label="지도 범례">
            {hasProfile ? (
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-4 w-7 rounded-full border-2 border-paper bg-market-700" /> 추천 ({RECOMMENDED_MIN_SCORE}점+ · 상위 3곳)
              </span>
            ) : null}
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-4 w-7 rounded-full border-2 border-ink-300 bg-paper" /> 일반 점포
            </span>
            {useKakao ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-4 w-7 rounded-full border-2 border-dashed border-ink-400 bg-paper" /> 대략적 위치
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="mf-pin__count !min-w-5">n</span> 같은 위치 묶음
                </span>
                {unlocated.length ? <span>위치 미확인 {unlocated.length}곳은 지도에 표시하지 않고 목록에만 보여줘요</span> : null}
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-4 w-7 rounded-md border-2 border-dashed border-sign-500 bg-paper" /> 상인회 등재 구역(세부 위치 미확인)
                </span>
                <span>안내도는 주소별 묶음이며 실제 배치와 달라요</span>
              </>
            )}
          </div>

          {useKakao && geocodingMode === "mock" && Object.keys(browserLocations).length > 0 ? (
            <p className="mt-2 text-xs text-ink-500">REST API 키가 없어 브라우저에서 주소를 좌표로 변환했어요. 관리자 화면에서 REST 키를 등록하면 서버에 저장돼요.</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {(["exact", "approximate", "unknown"] as const).map((acc) => (
              <span key={acc} className="flex items-center gap-1">
                <AccuracyBadge accuracy={acc} />
                <span className="tabular text-ink-500">
                  {acc === "unknown" ? unlocated.length : located.filter((v) => v.location!.accuracy === acc).length}
                </span>
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
