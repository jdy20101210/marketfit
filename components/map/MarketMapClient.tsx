"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, Heart, List, Map as MapIcon, MapPin, RefreshCw, Route, Search, Sparkles } from "lucide-react";
import { AccuracyBadge, CategoryText, MatchedTasteChips, RankBadge, ScorePill } from "@/components/stores/StoreBits";
import { StoreActions } from "@/components/stores/StoreActions";
import { Button, LinkButton, Spinner } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, Notice } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import type { StoreDTO } from "@/lib/api/schemas";
import { currentInput, runAnalysis, useAnalysisRun } from "@/lib/client/analysis";
import { recordView, useRecommendations } from "@/lib/client/recommendations";
import { displayCategory } from "@/lib/stores/parse";
import { MAIN_CATEGORIES } from "@/lib/stores/types";
import { KakaoMap } from "./KakaoMap";
import { SchematicMap } from "./SchematicMap";
import { SelectedStorePanel } from "./SelectedStorePanel";
import type { MapStoreView, ResolvedLocation } from "./types";

const PAGE_SIZE = 20;

/**
 * AI 추천 지도 — 추천 기준(80점, 없으면 75점)을 넘은 점포만 순위와 함께 표시합니다.
 * 지도와 목록은 같은 순위를 사용하고, 좌표가 없는 점포는 목록에만 표시합니다.
 */
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
  const { hydrated, analysis, recommendations, loading, error, retry } = useRecommendations();
  const run = useAnalysisRun();
  const [category, setCategory] = useState<string | "all">("all");
  const [selection, setSelection] = useState<{ ids: string[]; active: string } | null>(initialStoreId ? { ids: [initialStoreId], active: initialStoreId } : null);
  const [browserLocations, setBrowserLocations] = useState<Record<string, ResolvedLocation>>({});
  const [mapError, setMapError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [query, setQuery] = useState("");

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const threshold = recommendations?.threshold ?? null;

  const rankedViews: MapStoreView[] = useMemo(() => {
    const views: MapStoreView[] = [];
    for (const rec of recommendations?.items ?? []) {
      const store = rec.rank === null ? null : storeById.get(rec.storeId);
      if (!store) continue;
      const serverLoc: ResolvedLocation | null =
        store.location.lat !== null && store.location.lng !== null
          ? { lat: store.location.lat, lng: store.location.lng, accuracy: store.location.accuracy, note: store.location.note, source: "server" }
          : null;
      views.push({ store, rec, rank: rec.rank!, location: serverLoc ?? browserLocations[store.id] ?? null });
    }
    return views.sort((a, b) => a.rank - b.rank);
  }, [recommendations, storeById, browserLocations]);

  const categories = useMemo(() => MAIN_CATEGORIES.filter((c) => rankedViews.some((v) => v.store.mainCategory === c)), [rankedViews]);
  const filtered = useMemo(() => (category === "all" ? rankedViews : rankedViews.filter((v) => v.store.mainCategory === category)), [rankedViews, category]);
  const located = filtered.filter((v) => v.location);
  const unlocated = filtered.filter((v) => !v.location);

  const select = useCallback((ids: string[]) => {
    setSelection({ ids, active: ids[0]! });
    recordView(ids[0]!);
  }, []);
  const onBrowserGeocoded = useCallback((locs: Record<string, ResolvedLocation>) => setBrowserLocations((prev) => ({ ...prev, ...locs })), []);
  const onMapError = useCallback((msg: string) => setMapError(msg), []);

  // ?store=<id>로 들어온 점포는 한 번만 조회 기록을 남깁니다.
  useEffect(() => {
    if (initialStoreId && storeById.has(initialStoreId)) recordView(initialStoreId);
  }, [initialStoreId, storeById]);

  const selectedViews = selection ? rankedViews.filter((v) => selection.ids.includes(v.store.id)) : [];
  const useKakao = Boolean(kakaoJsKey) && !mapError;
  const directory = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return stores
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.storeType.toLowerCase().includes(q) ||
          displayCategory(s.subCategory).includes(q) ||
          s.raw.items.some((i) => i.toLowerCase().includes(q)),
      )
      .slice(0, 30);
  }, [stores, query]);

  const reanalyze = async () => {
    const input = currentInput(analysis?.inputMode);
    if (!input) return;
    await runAnalysis(input);
  };

  return (
    <div className="container-page max-w-7xl pt-4 sm:pt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-sign-700">STEP 3</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">AI 추천 시장 지도</h1>
          <p className="mt-1 text-sm text-ink-600">
            {!hydrated
              ? "불러오는 중…"
              : !analysis
                ? "취향 분석을 하면 나와 맞는 점포만 순위로 표시해요."
                : threshold?.applied
                  ? `추천 점수 ${threshold.applied}점 이상 ${rankedViews.length}곳을 순위로 표시했어요.`
                  : "기준을 넘는 점포가 없어요."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LinkButton href="/plan" size="sm" variant="sign" icon={<Route className="size-4" aria-hidden />}>
            동선 계획
          </LinkButton>
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
                className={cn(
                  "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold",
                  mobileView === v ? "bg-market-700 text-white" : "text-ink-600",
                )}
              >
                {v === "map" ? <MapIcon className="size-3.5" aria-hidden /> : <List className="size-3.5" aria-hidden />}
                {v === "map" ? "지도" : "목록"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {hydrated && !analysis ? (
        <Notice className="mb-3" icon={<Sparkles className="size-4" aria-hidden />}>
          취향 분석을 하면 <strong>추천 점수 {threshold?.primary ?? 80}점 이상</strong> 점포만 순위와 함께 지도에 표시해요.{" "}
          <LinkButton href="/discover" size="sm" variant="sign" className="ml-1 h-7 px-2.5 align-middle">
            분석 시작
          </LinkButton>
        </Notice>
      ) : null}
      {threshold?.usedFallback ? (
        <Notice className="mb-3">
          {threshold.primary}점 이상인 점포가 없어 기준을 <strong>{threshold.fallback}점</strong>으로 한 단계 낮춰 보여드려요. 점수를 올려 표시하지는 않아요.
        </Notice>
      ) : null}
      {error ? (
        <ErrorState
          className="mb-3"
          message={error}
          action={
            <Button size="sm" onClick={retry}>
              다시 시도
            </Button>
          }
        />
      ) : null}

      {analysis && threshold && threshold.applied === null && !loading ? (
        <Card className="mb-3 p-5">
          <EmptyState
            icon={<Sparkles className="size-6" aria-hidden />}
            title="현재 취향과 높은 수준으로 일치하는 점포가 없습니다."
            description={`가장 높은 점수는 ${recommendations?.bestScore ?? 0}점이에요(기준 ${threshold.primary}점, 보조 기준 ${threshold.fallback}점). 관심사를 조금 더 알려주고 다시 분석해 보세요.`}
            action={
              <>
                <Button onClick={() => void reanalyze()} loading={run.status === "analyzing"} icon={<RefreshCw className="size-4" aria-hidden />}>
                  같은 입력으로 다시 분석
                </Button>
                <LinkButton href="/discover" variant="secondary">
                  입력 수정하기
                </LinkButton>
              </>
            }
          />
        </Card>
      ) : null}

      {categories.length > 1 ? (
        <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="분류 필터">
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
              {c === "all" ? `전체 ${rankedViews.length}` : `${displayCategory(c)} ${rankedViews.filter((v) => v.store.mainCategory === c).length}`}
            </button>
          ))}
        </div>
      ) : null}

      {mapError ? <ErrorState className="mb-3" title="Kakao 지도를 불러오지 못해 데모 안내도로 전환했어요" message={mapError} /> : null}

      <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
        {/* 추천 순위 목록 */}
        <section aria-label="추천 점포 목록" className={cn("order-2 lg:order-1", mobileView === "map" && "hidden lg:block")}>
          <div className="rounded-3xl border border-ink-200/70 bg-paper/95 shadow-card lg:max-h-[calc(100dvh-17rem)] lg:overflow-y-auto">
            {loading && analysis ? (
              <p className="flex items-center gap-2 p-4 text-sm text-ink-600">
                <Spinner /> 추천 점수 계산 중…
              </p>
            ) : null}
            <ul className="divide-y divide-ink-100">
              {filtered.slice(0, limit).map((v) => (
                <li key={v.store.id} className={cn("px-4 py-3", selection?.active === v.store.id && "bg-sign-50")}>
                  <button
                    type="button"
                    onClick={() => {
                      select([v.store.id]);
                      setMobileView("map");
                    }}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <RankBadge rank={v.rank} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-ink-900">{v.store.name}</span>
                        {recommendations?.interactions.liked.includes(v.store.id) ? (
                          <Heart className="size-3.5 shrink-0 fill-brick-500 text-brick-500" aria-label="좋아요한 점포" />
                        ) : null}
                        {recommendations?.interactions.bookmarked.includes(v.store.id) ? (
                          <Bookmark className="size-3.5 shrink-0 fill-market-600 text-market-600" aria-label="저장한 점포" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-500">
                        <CategoryText main={v.store.mainCategory} sub={v.store.subCategory} /> · {v.store.storeType}
                      </span>
                      <span className="mt-1.5 block text-sm leading-relaxed text-ink-700">{v.rec.reason}</span>
                    </span>
                    <ScorePill score={v.rec.score} />
                  </button>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pl-12">
                    <MatchedTasteChips rec={v.rec} />
                    <div className="flex items-center gap-2">
                      {!v.location ? (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-400">
                          <MapPin className="size-3" aria-hidden /> 위치 미확인
                        </span>
                      ) : null}
                      <StoreActions storeId={v.store.id} storeName={v.store.name} compact include={["like", "bookmark"]} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {filtered.length > limit ? (
              <div className="p-3">
                <Button variant="secondary" size="sm" className="w-full" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                  더 보기 ({filtered.length - limit}곳)
                </Button>
              </div>
            ) : null}
            {analysis && filtered.length === 0 && !loading ? (
              <p className="p-6 text-center text-sm text-ink-500">
                {rankedViews.length === 0 ? "추천 기준을 넘는 점포가 없어요." : "이 분류에는 추천 점포가 없어요."}
              </p>
            ) : null}

            {/* 전체 점포 찾기 (추천과 별개로 원본 데이터 탐색) */}
            <div className="border-t border-ink-100 p-4">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-600" htmlFor="store-search">
                <Search className="size-3.5" aria-hidden /> 전체 점포 찾기 ({stores.length}곳)
              </label>
              <input
                id="store-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="점포명·품목·분류 검색"
                className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm outline-none focus:border-market-600 focus:ring-4 focus:ring-market-400/40"
              />
              {directory.length ? (
                <ul className="mt-2 space-y-1">
                  {directory.map((s) => (
                    <li key={s.id}>
                      <Link href={`/store/${s.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-cream">
                        <span className="min-w-0">
                          <span className="font-semibold text-ink-900">{s.name}</span>{" "}
                          <span className="text-xs text-ink-500">{s.storeType}</span>
                        </span>
                        {recommendations?.scores[s.id] !== undefined ? (
                          <span className="tabular shrink-0 text-xs text-ink-500">{recommendations.scores[s.id]}점</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : query.trim() ? (
                <p className="mt-2 text-xs text-ink-500">검색 결과가 없어요.</p>
              ) : null}
            </div>
          </div>
        </section>

        {/* 지도 */}
        <section aria-label="지도" className={cn("order-1 lg:order-2", mobileView === "list" && "hidden lg:block")}>
          <div className="relative h-[62dvh] min-h-[380px] overflow-hidden rounded-3xl border border-ink-200/70 bg-ink-100 shadow-card lg:h-[calc(100dvh-17rem)]">
            {useKakao ? (
              <KakaoMap
                appKey={kakaoJsKey!}
                views={filtered}
                selectedStoreId={selection?.active ?? null}
                onSelectGroup={select}
                onBrowserGeocoded={onBrowserGeocoded}
                onError={onMapError}
              />
            ) : (
              <SchematicMap views={filtered} selectedStoreId={selection?.active ?? null} reason={kakaoJsKey ? "load-failed" : "no-key"} onSelect={(id) => select([id])} />
            )}

            <p className="sr-only" aria-live="polite">
              {selectedViews.length ? `${selectedViews.find((v) => v.store.id === selection?.active)?.store.name ?? ""} 정보를 열었어요.` : ""}
            </p>
            {selectedViews.length ? (
              <div className="fixed inset-x-2 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-50 max-h-[70dvh] overflow-y-auto rounded-3xl md:absolute md:inset-x-auto md:bottom-3 md:right-3 md:z-20 md:max-h-[calc(100%-1.5rem)] md:w-[380px]">
                <SelectedStorePanel
                  views={selectedViews}
                  selectedId={selection!.active}
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
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-4 w-7 rounded-full border-2 border-paper bg-market-700" /> 추천 1~3위
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-4 w-7 rounded-full border-2 border-ink-300 bg-paper" /> 그 외 추천 점포
            </span>
            {useKakao ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-4 w-7 rounded-full border-2 border-dashed border-ink-400 bg-paper" /> 대략적 위치
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="mf-pin__count !min-w-5">
                    n
                  </span>{" "}
                  같은 위치 묶음
                </span>
              </>
            ) : (
              <span>안내도는 주소별 묶음이며 실제 배치와 달라요</span>
            )}
            {unlocated.length ? <span>위치 미확인 {unlocated.length}곳은 목록에만 표시해요</span> : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {(["exact", "approximate", "unknown"] as const).map((acc) => (
              <span key={acc} className="flex items-center gap-1">
                <AccuracyBadge accuracy={acc} />
                <span className="tabular text-ink-500">{acc === "unknown" ? unlocated.length : located.filter((v) => v.location!.accuracy === acc).length}</span>
              </span>
            ))}
            {useKakao && geocodingMode === "mock" && Object.keys(browserLocations).length > 0 ? (
              <span className="text-ink-500">REST 키가 없어 브라우저에서 주소를 좌표로 변환했어요(저장하지 않음).</span>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
