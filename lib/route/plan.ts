/**
 * 동선 계획 — 추천 점포 중 몇 곳을, 몇 시간 동안 돌지 정하면 걷는 순서와 시간표를 만듭니다.
 *
 * 원칙
 * - 추천 기준(80점, 없으면 75점)을 넘은 점포만 후보로 씁니다. 점수를 새로 매기지 않습니다.
 * - 좌표가 확인된 점포만 동선에 넣습니다 (없는 좌표를 만들어 내지 않음).
 * - 거리는 좌표 사이 직선거리에 골목 우회 계수를 곱한 **추정치**입니다 (실제 도보 경로와 다를 수 있음).
 */
import { distanceMeters } from "@/lib/map/grouping";
import type { LocationAccuracy } from "@/lib/stores/types";

/** 도보 속도 (m/분) — 시장 안 보행 약 4km/h */
export const WALK_SPEED = 67;
/** 직선거리 → 실제 골목 이동 보정 계수 */
export const DETOUR_FACTOR = 1.3;
/** 한 점포에 머무는 시간(분) 범위 */
export const MIN_STAY = 8;
export const MAX_STAY = 30;
export const MIN_STOPS = 2;
export const MAX_STOPS = 8;
/** 총 시간 선택 범위(분) */
export const MIN_MINUTES = 30;
export const MAX_MINUTES = 300;

export interface RouteCandidate {
  storeId: string;
  name: string;
  rank: number;
  score: number;
  mainCategory: string;
  subCategory: string;
  storeType: string;
  lat: number | null;
  lng: number | null;
  accuracy: LocationAccuracy;
  /** 좌표 근거 설명 */
  locationNote: string;
}

export interface RouteStart {
  lat: number;
  lng: number;
  label: string;
  /** first-stop: 첫 점포에서 시작 / browser: 현재 위치에서 출발 */
  kind: "first-stop" | "browser";
}

export interface RoutePlanOptions {
  /** 희망 방문 점포 수 */
  stopCount: number;
  /** 총 소요 시간(분) */
  minutes: number;
  /** 출발 시각 "HH:MM" */
  startTime: string;
  /** 출발 지점 (없으면 첫 점포에서 시작) */
  start?: RouteStart | null;
  /** 반드시 넣을 점포 (저장·좋아요한 곳) */
  mustInclude?: string[];
  /** 같은 조건에서 다른 조합을 뽑고 싶을 때 0, 1, 2… */
  variant?: number;
}

export interface RouteStop {
  order: number;
  storeId: string;
  name: string;
  rank: number;
  score: number;
  category: string;
  storeType: string;
  lat: number;
  lng: number;
  accuracy: LocationAccuracy;
  locationNote: string;
  /** 직전 지점에서 걸어온 거리·시간 (출발지가 없으면 첫 지점은 0) */
  walkMeters: number;
  walkMinutes: number;
  arrival: string;
  departure: string;
  stayMinutes: number;
  pinned: boolean;
}

export interface RoutePlan {
  stops: RouteStop[];
  startLabel: string;
  startTime: string;
  endTime: string;
  totalMinutes: number;
  walkMinutes: number;
  stayMinutes: number;
  walkMeters: number;
  stayPerStop: number;
  requestedStops: number;
  /** 시간이 모자라 뺀 점포 수 */
  droppedForTime: number;
  /** 좌표가 없어 동선에서 뺀 추천 점포 수 */
  unlocatedExcluded: number;
  notes: string[];
}

export interface LocatedCandidate extends RouteCandidate {
  lat: number;
  lng: number;
}

export function isLocated(c: RouteCandidate): c is LocatedCandidate {
  return typeof c.lat === "number" && typeof c.lng === "number";
}

// ---------- 시간 ----------

export function parseTime(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return 10 * 60;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return h * 60 + min;
}

export function formatTime(totalMinutes: number): string {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}시간 ${rest}분` : `${h}시간`;
}

/** 두 지점 사이 걷는 거리(m) — 직선거리 × 골목 우회 계수 */
export function walkMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.round(distanceMeters(a, b) * DETOUR_FACTOR);
}

export function walkMinutes(meters: number): number {
  if (meters <= 0) return 0;
  return Math.max(1, Math.round(meters / WALK_SPEED));
}

// ---------- 점포 고르기 ----------

/**
 * 추천 상위권에서 방문할 점포를 고릅니다.
 * - 고정(mustInclude) 점포가 먼저
 * - 같은 소분류가 몰리지 않도록 분류당 1곳 → 2곳 순으로 채우고, 모자라면 순위대로 더 넣습니다.
 * - variant를 올리면 같은 조건에서 그다음 후보 조합을 뽑습니다.
 */
export function selectStops(candidates: LocatedCandidate[], count: number, mustInclude: string[] = [], variant = 0): LocatedCandidate[] {
  const wanted = Math.max(1, Math.min(count, candidates.length));
  const byRank = [...candidates].sort((a, b) => a.rank - b.rank);
  const pinnedIds = new Set(mustInclude);
  const picked: LocatedCandidate[] = byRank.filter((c) => pinnedIds.has(c.storeId)).slice(0, wanted);
  const pool = byRank.filter((c) => !picked.some((p) => p.storeId === c.storeId));

  // variant: 고정되지 않은 후보 목록을 회전시켜 다른 조합을 만듭니다.
  const shift = pool.length ? (variant * Math.max(1, wanted)) % pool.length : 0;
  const rotated = shift > 0 ? [...pool.slice(shift), ...pool.slice(0, shift)] : pool;

  const perCategory = new Map<string, number>();
  for (const p of picked) perCategory.set(p.subCategory, (perCategory.get(p.subCategory) ?? 0) + 1);

  for (const cap of [1, 2, Number.POSITIVE_INFINITY]) {
    for (const c of rotated) {
      if (picked.length >= wanted) break;
      if (picked.some((p) => p.storeId === c.storeId)) continue;
      if ((perCategory.get(c.subCategory) ?? 0) >= cap) continue;
      picked.push(c);
      perCategory.set(c.subCategory, (perCategory.get(c.subCategory) ?? 0) + 1);
    }
    if (picked.length >= wanted) break;
  }
  return picked;
}

// ---------- 순서 정하기 ----------

function pathLength(points: { lat: number; lng: number }[], start: { lat: number; lng: number } | null): number {
  let total = 0;
  let prev = start;
  for (const p of points) {
    if (prev) total += walkMeters(prev, p);
    prev = p;
  }
  return total;
}

/** 가까운 곳부터 잇고(nearest neighbour), 2-opt로 교차를 풀어 전체 도보 거리를 줄입니다. */
export function orderStops<T extends { lat: number; lng: number }>(stops: T[], start: { lat: number; lng: number } | null): T[] {
  if (stops.length <= 2) return [...stops];
  const remaining = [...stops];
  const ordered: T[] = [];
  let cursor: { lat: number; lng: number };
  if (start) {
    cursor = start;
  } else {
    ordered.push(remaining.shift()!);
    cursor = ordered[0]!;
  }
  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((c, i) => {
      const d = walkMeters(cursor, c);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    });
    const next = remaining.splice(bestIndex, 1)[0]!;
    ordered.push(next);
    cursor = next;
  }

  // 2-opt (구간 뒤집기) — 더 짧아지지 않을 때까지 반복
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 0; i < ordered.length - 1; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const next = [...ordered.slice(0, i), ...ordered.slice(i, j + 1).reverse(), ...ordered.slice(j + 1)];
        if (pathLength(next, start) < pathLength(ordered, start) - 1) {
          ordered.splice(0, ordered.length, ...next);
          improved = true;
        }
      }
    }
  }
  return ordered;
}

// ---------- 계획 만들기 ----------

function buildSchedule(
  chosen: LocatedCandidate[],
  options: { minutes: number; startTime: string; start: RouteStart | null; mustInclude: string[] },
): { stops: RouteStop[]; walkTotal: number; walkDistance: number; stay: number } {
  const ordered = orderStops(chosen, options.start);
  const startPoint = options.start;
  let walkTotal = 0;
  let walkDistance = 0;
  const legs = ordered.map((stop, i) => {
    const prev = i === 0 ? startPoint : ordered[i - 1]!;
    const meters = prev ? walkMeters(prev, stop) : 0;
    const minutes = walkMinutes(meters);
    walkTotal += minutes;
    walkDistance += meters;
    return { meters, minutes };
  });

  const usable = options.minutes - walkTotal;
  const stay = Math.max(MIN_STAY, Math.min(MAX_STAY, Math.floor(usable / Math.max(1, ordered.length))));
  const pinned = new Set(options.mustInclude);

  let clock = parseTime(options.startTime);
  const stops: RouteStop[] = ordered.map((stop, i) => {
    clock += legs[i]!.minutes;
    const arrival = clock;
    clock += stay;
    return {
      order: i + 1,
      storeId: stop.storeId,
      name: stop.name,
      rank: stop.rank,
      score: stop.score,
      category: stop.subCategory,
      storeType: stop.storeType,
      lat: stop.lat,
      lng: stop.lng,
      accuracy: stop.accuracy,
      locationNote: stop.locationNote,
      walkMeters: legs[i]!.meters,
      walkMinutes: legs[i]!.minutes,
      arrival: formatTime(arrival),
      departure: formatTime(clock),
      stayMinutes: stay,
      pinned: pinned.has(stop.storeId),
    };
  });
  return { stops, walkTotal, walkDistance, stay };
}

const emptyPlan = (options: RoutePlanOptions, requested: number, unlocatedExcluded: number, note: string): RoutePlan => ({
  stops: [],
  startLabel: options.start?.label ?? "-",
  startTime: options.startTime,
  endTime: options.startTime,
  totalMinutes: 0,
  walkMinutes: 0,
  stayMinutes: 0,
  walkMeters: 0,
  stayPerStop: 0,
  requestedStops: requested,
  droppedForTime: 0,
  unlocatedExcluded,
  notes: [note],
});

/**
 * 동선 계획: 후보 → 점포 선택 → 순서 최적화 → 시간표
 * 시간이 모자라면 점수가 가장 낮은 점포부터 빼고 다시 계산합니다 (체류 시간을 8분 밑으로 줄이지 않음).
 */
export function planRoute(candidates: RouteCandidate[], options: RoutePlanOptions): RoutePlan {
  const located = candidates.filter(isLocated);
  const unlocatedExcluded = candidates.length - located.length;
  const requested = Math.max(MIN_STOPS, Math.min(MAX_STOPS, Math.round(options.stopCount)));
  const minutes = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(options.minutes)));
  const start = options.start ?? null;
  const mustInclude = (options.mustInclude ?? []).filter((id) => located.some((c) => c.storeId === id));
  const notes: string[] = [];

  if (located.length === 0) {
    return emptyPlan(
      options,
      requested,
      unlocatedExcluded,
      unlocatedExcluded > 0
        ? "추천 점포의 좌표가 아직 확인되지 않아 동선을 만들 수 없어요. 관리자 화면에서 [좌표 채우기]를 실행하거나 Kakao 키를 연결해 주세요."
        : "동선에 넣을 추천 점포가 없어요. 먼저 취향 분석을 해주세요.",
    );
  }

  const target = Math.min(requested, located.length);
  if (target < requested) notes.push(`좌표가 확인된 추천 점포가 ${located.length}곳이라 ${located.length}곳으로 계획했어요.`);

  let chosen = selectStops(located, target, mustInclude, options.variant ?? 0);
  let schedule = buildSchedule(chosen, { minutes, startTime: options.startTime, start, mustInclude });
  let dropped = 0;

  // 걷는 시간 + 최소 체류 시간이 총 시간을 넘으면 점수가 낮은 점포부터 뺍니다.
  while (schedule.walkTotal + chosen.length * MIN_STAY > minutes && chosen.length > MIN_STOPS) {
    const unpinned = chosen.filter((c) => !mustInclude.includes(c.storeId));
    const removable = [...(unpinned.length ? unpinned : chosen)].sort((a, b) => a.score - b.score)[0]!;
    chosen = chosen.filter((c) => c.storeId !== removable.storeId);
    dropped += 1;
    schedule = buildSchedule(chosen, { minutes, startTime: options.startTime, start, mustInclude });
  }

  const totalMinutes = schedule.walkTotal + schedule.stay * schedule.stops.length;
  if (dropped > 0) notes.push(`주어진 시간 안에 걷고 둘러보기 어려워 ${dropped}곳을 빼고 ${schedule.stops.length}곳으로 계획했어요.`);
  if (totalMinutes > minutes) notes.push(`가장 짧게 잡아도 약 ${formatDuration(totalMinutes)}이 필요해요. 시간을 늘리거나 점포 수를 줄여 보세요.`);
  else if (minutes - totalMinutes >= 15) notes.push(`계획보다 약 ${formatDuration(minutes - totalMinutes)} 여유가 있어요. 점포를 더 넣거나 천천히 둘러봐도 좋아요.`);
  if (schedule.stops.some((s) => s.accuracy !== "exact")) notes.push("일부 점포는 건물·구역 기준의 대략적 위치예요. 도착해서 간판을 확인해 주세요.");
  if (unlocatedExcluded > 0) notes.push(`좌표가 확인되지 않은 추천 점포 ${unlocatedExcluded}곳은 동선에서 제외했어요.`);

  return {
    stops: schedule.stops,
    startLabel: start?.label ?? `${schedule.stops[0]?.name ?? ""}에서 출발`,
    startTime: options.startTime,
    endTime: schedule.stops.at(-1)?.departure ?? options.startTime,
    totalMinutes,
    walkMinutes: schedule.walkTotal,
    stayMinutes: schedule.stay * schedule.stops.length,
    walkMeters: schedule.walkDistance,
    stayPerStop: schedule.stay,
    requestedStops: requested,
    droppedForTime: dropped,
    unlocatedExcluded,
    notes,
  };
}

/** 공유·저장용 텍스트 (복사 버튼) */
export function planToText(plan: RoutePlan): string {
  const lines = [
    `[MarketFit] 대전 중앙시장 동선 · ${plan.startTime}~${plan.endTime} (${formatDuration(plan.totalMinutes)})`,
    `출발: ${plan.startLabel} · 도보 약 ${plan.walkMeters}m (${formatDuration(plan.walkMinutes)}) · 점포당 ${plan.stayPerStop}분`,
    "",
  ];
  for (const s of plan.stops) {
    lines.push(`${String(s.order).padStart(2, "0")}. ${s.arrival}~${s.departure} ${s.name} (추천 ${s.rank}위 · ${s.score}점)`);
    lines.push(`    ${s.storeType}${s.walkMeters ? ` · 이동 ${s.walkMeters}m ${s.walkMinutes}분` : ""}`);
  }
  return lines.join("\n");
}
