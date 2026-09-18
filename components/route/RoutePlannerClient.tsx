"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Clock, Copy, Crosshair, Footprints, MapPinned, RefreshCw, Route, Shuffle, Sparkles, Store as StoreIcon } from "lucide-react";
import { RankBadge, ScorePill } from "@/components/stores/StoreBits";
import { Button, LinkButton, Spinner } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, Notice } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import type { StoreDTO } from "@/lib/api/schemas";
import { useRecommendations } from "@/lib/client/recommendations";
import { loadKakaoMaps } from "@/lib/map/kakaoLoader";
import {
  formatDuration,
  formatTime,
  MAX_STOPS,
  MIN_STOPS,
  planRoute,
  planToText,
  type RouteCandidate,
  type RouteStart,
} from "@/lib/route/plan";
import { displayCategory } from "@/lib/stores/parse";
import { RouteMap } from "./RouteMap";

const STOP_CHOICES = [2, 3, 4, 5, 6, 7, 8] as const;
const TIME_CHOICES = [60, 90, 120, 180, 240] as const;

/** 지금 시각을 10분 단위로 올림 */
function defaultStartTime(): string {
  const now = new Date();
  return formatTime(now.getHours() * 60 + Math.ceil(now.getMinutes() / 10) * 10);
}

/**
 * 동선 계획 화면
 * - 추천 기준을 넘은 점포(80점, 없으면 75점) 중에서 원하는 곳 수와 시간에 맞춰 순서를 짭니다.
 * - 순서·시간 계산은 브라우저에서 바로 하므로 버튼을 누르면 즉시 바뀝니다.
 */
export function RoutePlannerClient({ stores, kakaoJsKey }: { stores: StoreDTO[]; kakaoJsKey: string | null }) {
  const { hydrated, analysis, recommendations, loading, error, retry } = useRecommendations();
  const [stopCount, setStopCount] = useState(4);
  const [minutes, setMinutes] = useState(120);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [useMyLocation, setUseMyLocation] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [keepSaved, setKeepSaved] = useState(true);
  const [variant, setVariant] = useState(0);
  const [copied, setCopied] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [browserCoords, setBrowserCoords] = useState<Record<string, { lat: number; lng: number }>>({});
  const geocoded = useRef(new Set<string>());

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  /** 추천 기준을 넘은 점포 = 동선 후보 */
  const candidates: RouteCandidate[] = useMemo(() => {
    const out: RouteCandidate[] = [];
    for (const rec of recommendations?.items ?? []) {
      if (rec.rank === null) continue;
      const store = storeById.get(rec.storeId);
      if (!store) continue;
      const fallback = browserCoords[store.id] ?? null;
      out.push({
        storeId: store.id,
        name: store.name,
        rank: rec.rank,
        score: rec.score,
        mainCategory: store.mainCategory,
        subCategory: store.subCategory,
        storeType: store.storeType,
        lat: store.location.lat ?? fallback?.lat ?? null,
        lng: store.location.lng ?? fallback?.lng ?? null,
        accuracy: store.location.lat !== null ? store.location.accuracy : fallback ? "approximate" : "unknown",
        locationNote: store.location.note,
      });
    }
    return out.sort((a, b) => a.rank - b.rank);
  }, [recommendations, storeById, browserCoords]);

  // 서버 좌표가 없으면(REST 키 미설정) 브라우저 SDK로 상위 후보 주소만 좌표로 바꿔 씁니다(저장하지 않음).
  useEffect(() => {
    if (!kakaoJsKey || mapError) return;
    const missing = candidates
      .filter((c) => c.lat === null)
      .map((c) => storeById.get(c.storeId))
      .filter((s): s is StoreDTO => Boolean(s?.geocodeQuery) && !geocoded.current.has(s!.geocodeQuery!))
      .slice(0, 30);
    if (missing.length === 0) return;
    for (const s of missing) geocoded.current.add(s.geocodeQuery!);
    let cancelled = false;
    loadKakaoMaps(kakaoJsKey)
      .then((k) => {
        const geocoder = new k.maps.services.Geocoder();
        return Promise.all(
          missing.map(
            (s) =>
              new Promise<[string, { lat: number; lng: number } | null]>((resolve) => {
                geocoder.addressSearch(s.geocodeQuery!, (result, status) =>
                  resolve([s.id, status === k.maps.services.Status.OK && result[0] ? { lat: Number(result[0].y), lng: Number(result[0].x) } : null]),
                );
              }),
          ),
        );
      })
      .then((pairs) => {
        if (cancelled) return;
        const next: Record<string, { lat: number; lng: number }> = {};
        for (const [id, coords] of pairs) if (coords) next[id] = coords;
        if (Object.keys(next).length) setBrowserCoords((prev) => ({ ...prev, ...next }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [kakaoJsKey, candidates, storeById, mapError]);

  const start: RouteStart | null = useMemo(
    () => (useMyLocation && myLocation ? { ...myLocation, label: "현재 내 위치", kind: "browser" as const } : null),
    [useMyLocation, myLocation],
  );
  const mustInclude = useMemo(() => {
    if (!keepSaved || !recommendations) return [];
    const ids = new Set([...recommendations.interactions.bookmarked, ...recommendations.interactions.liked]);
    return candidates.filter((c) => ids.has(c.storeId)).map((c) => c.storeId);
  }, [keepSaved, recommendations, candidates]);

  const plan = useMemo(
    () => planRoute(candidates, { stopCount, minutes, startTime, start, mustInclude, variant }),
    [candidates, stopCount, minutes, startTime, start, mustInclude, variant],
  );

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocationError("이 브라우저에서는 현재 위치를 쓸 수 없어요.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setUseMyLocation(true);
        setLocating(false);
      },
      (err) => {
        setLocationError(err.code === err.PERMISSION_DENIED ? "위치 권한이 거부되어 첫 점포에서 출발하는 동선으로 계획해요." : "현재 위치를 가져오지 못했어요.");
        setUseMyLocation(false);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const copyPlan = async () => {
    try {
      await navigator.clipboard.writeText(planToText(plan));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const useKakao = Boolean(kakaoJsKey) && !mapError && plan.stops.length > 0;
  const threshold = recommendations?.threshold ?? null;

  return (
    <div className="container-page max-w-6xl pt-4 sm:pt-6">
      <div className="mb-3">
        <p className="text-xs font-bold text-sign-700">STEP 4</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">시장 동선 계획</h1>
        <p className="mt-1 text-sm text-ink-600">
          추천받은 점포 중 <strong>몇 곳을, 몇 시간</strong> 동안 돌지 정하면 걷는 순서와 시간표를 만들어 드려요.
        </p>
      </div>

      {hydrated && !analysis ? (
        <Notice className="mb-3" icon={<Sparkles className="size-4" aria-hidden />}>
          먼저 취향 분석을 하면 추천 {threshold?.primary ?? 80}점 이상 점포로 동선을 짤 수 있어요.{" "}
          <LinkButton href="/discover" size="sm" variant="sign" className="ml-1 h-7 px-2.5 align-middle">
            분석 시작
          </LinkButton>
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

      {/* 조건 입력 */}
      <Card className="mb-4 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink-900">
              <StoreIcon className="size-4 text-market-700" aria-hidden /> 몇 군데 들를까요?
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="방문할 점포 수">
              {STOP_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={stopCount === n}
                  onClick={() => setStopCount(n)}
                  className={cn(
                    "tabular h-10 w-11 rounded-xl border text-sm font-bold transition-colors",
                    stopCount === n ? "border-market-700 bg-market-700 text-white" : "border-ink-200 bg-paper text-ink-700 hover:border-ink-300",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-500">
              추천 점포 {candidates.length}곳 중 {MIN_STOPS}~{MAX_STOPS}곳
            </p>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink-900">
              <Clock className="size-4 text-market-700" aria-hidden /> 얼마나 둘러볼까요?
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="총 소요 시간">
              {TIME_CHOICES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={minutes === m}
                  onClick={() => setMinutes(m)}
                  className={cn(
                    "h-10 rounded-xl border px-3 text-sm font-bold transition-colors",
                    minutes === m ? "border-market-700 bg-market-700 text-white" : "border-ink-200 bg-paper text-ink-700 hover:border-ink-300",
                  )}
                >
                  {formatDuration(m)}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label htmlFor="start-time" className="text-xs font-semibold text-ink-600">
                출발 시각
              </label>
              <input
                id="start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-9 rounded-xl border border-ink-200 bg-white px-2.5 text-sm outline-none focus:border-market-600 focus:ring-4 focus:ring-market-400/40"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          <Button
            size="sm"
            variant={useMyLocation && myLocation ? "primary" : "secondary"}
            loading={locating}
            icon={<Crosshair className="size-4" aria-hidden />}
            onClick={() => (useMyLocation ? setUseMyLocation(false) : locate())}
          >
            {useMyLocation && myLocation ? "현재 위치에서 출발 중" : "현재 위치에서 출발"}
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink-200 bg-paper px-3 py-2 text-sm font-semibold text-ink-700">
            <input type="checkbox" checked={keepSaved} onChange={(e) => setKeepSaved(e.target.checked)} className="size-4 accent-market-700" />
            저장·좋아요한 점포 먼저 넣기
          </label>
          <Button size="sm" variant="secondary" icon={<Shuffle className="size-4" aria-hidden />} onClick={() => setVariant((v) => v + 1)}>
            다른 조합으로
          </Button>
          {variant > 0 ? (
            <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" aria-hidden />} onClick={() => setVariant(0)}>
              추천 순위대로
            </Button>
          ) : null}
        </div>
        {locationError ? <p className="mt-2 text-xs text-brick-600">{locationError}</p> : null}
      </Card>

      {loading && analysis ? (
        <p className="mb-3 flex items-center gap-2 text-sm text-ink-600">
          <Spinner /> 추천 점수 계산 중…
        </p>
      ) : null}

      {analysis && plan.stops.length === 0 && !loading ? (
        <Card className="p-5">
          <EmptyState
            icon={<Route className="size-6" aria-hidden />}
            title="동선을 만들 점포가 없어요"
            description={plan.notes[0] ?? "추천 기준을 넘는 점포가 없어요. 취향을 다시 분석해 보세요."}
            action={
              <>
                <LinkButton href="/market-map" variant="secondary">
                  추천 지도 보기
                </LinkButton>
                <LinkButton href="/discover">다시 분석하기</LinkButton>
              </>
            }
          />
        </Card>
      ) : null}

      {plan.stops.length > 0 ? (
        <>
          {/* 요약 */}
          <Card className="mb-4 overflow-hidden">
            <div aria-hidden className="awning h-1.5" />
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <Summary label="일정" value={`${plan.startTime} → ${plan.endTime}`} sub={formatDuration(plan.totalMinutes)} />
                <Summary label="방문" value={`${plan.stops.length}곳`} sub={`점포당 약 ${plan.stayPerStop}분`} />
                <Summary label="도보" value={`약 ${plan.walkMeters.toLocaleString()}m`} sub={formatDuration(plan.walkMinutes)} />
                <Summary label="출발" value={plan.startLabel} sub={start ? "현재 위치 기준" : "첫 점포 기준"} />
              </div>
              <Button size="sm" variant="secondary" icon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} onClick={() => void copyPlan()}>
                {copied ? "복사했어요" : "일정 복사"}
              </Button>
            </div>
          </Card>

          {plan.notes.length ? (
            <ul className="mb-4 space-y-2">
              {plan.notes.map((note) => (
                <li key={note}>
                  <Notice>{note}</Notice>
                </li>
              ))}
            </ul>
          ) : null}

          {mapError ? <ErrorState className="mb-3" title="Kakao 지도를 불러오지 못했어요" message={mapError} /> : null}

          <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
            {/* 지도 */}
            <section aria-label="동선 지도" className="order-1">
              <div className="relative h-[46dvh] min-h-[320px] overflow-hidden rounded-3xl border border-ink-200/70 bg-ink-100 shadow-card lg:h-[calc(100dvh-24rem)] lg:min-h-[420px]">
                {useKakao ? (
                  <RouteMap plan={plan} start={start} appKey={kakaoJsKey!} onError={setMapError} />
                ) : (
                  <div className="grid h-full place-items-center p-6 text-center">
                    <div>
                      <MapPinned className="mx-auto mb-2 size-8 text-ink-400" aria-hidden />
                      <p className="text-sm font-semibold text-ink-700">지도는 Kakao 키가 연결되면 표시돼요</p>
                      <p className="mt-1 text-xs text-ink-500">오른쪽(모바일은 아래) 시간표만으로도 순서대로 돌아볼 수 있어요.</p>
                    </div>
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-ink-500">
                지도의 선은 방문 순서를 잇는 안내선이에요. 실제 골목 경로와는 다를 수 있고, 거리는 직선거리에 시장 골목 보정(×1.3)을 적용한 추정값이에요.
              </p>
            </section>

            {/* 시간표 */}
            <section aria-label="동선 시간표" className="order-2">
              <ol className="space-y-2">
                {plan.stops.map((stop) => (
                  <li key={stop.storeId}>
                    <Card className="p-3.5">
                      {stop.walkMeters > 0 ? (
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-500">
                          <Footprints className="size-3.5" aria-hidden />
                          도보 {stop.walkMeters}m · 약 {stop.walkMinutes}분
                        </p>
                      ) : null}
                      <div className="flex items-start gap-3">
                        <span className="tabular grid size-8 shrink-0 place-items-center rounded-xl bg-market-700 text-sm font-extrabold text-white">{stop.order}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link href={`/store/${stop.storeId}`} className="truncate font-bold text-ink-900 hover:underline">
                              {stop.name}
                            </Link>
                            {stop.pinned ? <Badge tone="sign">저장한 곳</Badge> : null}
                          </div>
                          <p className="tabular mt-0.5 text-sm font-semibold text-market-700">
                            {stop.arrival} ~ {stop.departure} <span className="font-normal text-ink-500">({stop.stayMinutes}분)</span>
                          </p>
                          <p className="mt-0.5 truncate text-xs text-ink-500">
                            {displayCategory(stop.category)} · {stop.storeType}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <RankBadge rank={stop.rank} />
                            <ScorePill score={stop.score} />
                            <a
                              href={`https://map.kakao.com/link/to/${encodeURIComponent(stop.name)},${stop.lat},${stop.lng}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-xs font-semibold text-market-700 underline"
                            >
                              카카오맵 길찾기
                            </a>
                          </div>
                          {stop.accuracy !== "exact" ? <p className="mt-1.5 text-[11px] text-sign-800">{stop.locationNote}</p> : null}
                        </div>
                      </div>
                    </Card>
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex flex-wrap gap-2">
                <LinkButton href="/market-map" variant="secondary" size="sm" icon={<MapPinned className="size-4" aria-hidden />}>
                  추천 지도로 돌아가기
                </LinkButton>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-500">{label}</p>
      <p className="tabular text-base font-extrabold text-ink-900">{value}</p>
      <p className="text-xs text-ink-500">{sub}</p>
    </div>
  );
}
