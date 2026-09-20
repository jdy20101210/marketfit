import "server-only";
import { getRepository } from "@/lib/db";
import type { InteractionType } from "@/lib/db/types";
import { MARKET_INTEREST_META, recentInterestShares, risingInterests, type InterestShare } from "@/lib/mock/marketInterest";
import { TASTE_META, topTastes, type TasteKey, type TasteVector } from "@/lib/recommendation/dimensions";
import { COSINE_EXCLUDED_KEYS } from "@/lib/recommendation/engine";
import { getStores, MOCK_ACTIVITY_META } from "@/lib/stores/catalog";
import { categoryPath } from "@/lib/stores/description";
import { ENTITY_KIND_LABEL } from "@/lib/stores/parse";
import type { Store } from "@/lib/stores/types";

/**
 * 상인·시장 인사이트 (집계 전용)
 * - 개인 식별 정보(이름·세션 id·대화 원문)는 어떤 경로로도 반환하지 않습니다.
 * - 실제 이용자 수가 MIN_USERS_FOR_INSIGHTS 미만이면 실제 취향 분포 대신 프로토타입 가상 집계만 보여줍니다.
 */
export const MIN_USERS_FOR_INSIGHTS = 5;
export const INSIGHT_DAYS = 7;

export interface InterestRow {
  key: TasteKey;
  label: string;
  emoji: string;
  /** 0~100 (%) */
  share: number;
  /** 직전 같은 기간 대비 증감률 (0.12 = +12%) */
  change: number | null;
}

export interface StoreMetrics {
  storeId: string;
  name: string;
  category: string;
  entityLabel: string;
  /** 관심 사용자 수 (가상 집계 + 실제 기록) */
  interestUsers: number;
  visits: number;
  likes: number;
  saves: number;
  /** 실제 기록에서 더해진 수치 (0이면 전부 가상 집계) */
  real: { view: number; like: number; bookmark: number; visit: number };
}

export interface MerchantInsights {
  scope: "market" | "store";
  storeId: string | null;
  period: string;
  /** 실제 이용자 취향 분포가 아니라 프로토타입 가상 집계인지 */
  isMock: boolean;
  distinctUsers: number | null;
  minUsers: number;
  notice: string;
  /** 최근 7일 관심 분포 (상위) */
  interest: InterestRow[];
  rising: InterestRow[];
  /** 관심 대비 방문이 낮은 분야 */
  lowConversion: { key: TasteKey; label: string; interestShare: number; visitShare: number }[];
  metrics: StoreMetrics | null;
  /** 점포 화면 전용 — 시장 관심도를 이 점포의 성향으로 재가중한 값 (홍보 아이디어의 근거) */
  storeInterest: InterestRow[];
  /** 이 점포가 실제로 가진 취향 성향 (상위 4개) */
  storeTasteKeys: TasteKey[];
  /** 시장 전체 화면용 — 점포별 관심/방문 차이 상위 */
  storeGaps: { storeId: string; name: string; category: string; interestUsers: number; visits: number; ratio: number }[];
  generatedAt: string;
}

function toRow(s: InterestShare): InterestRow {
  return { key: s.key, label: s.label, emoji: s.emoji, share: Math.round(s.share * 1000) / 10, change: s.change };
}

/** 실제 이용자 취향 vector들의 분포 (상위 취향 기준 가중 합계) */
function shareFromVectors(vectors: TasteVector[]): InterestRow[] {
  const acc = new Map<TasteKey, number>();
  for (const v of vectors) for (const t of topTastes(v, 3, 0.3)) acc.set(t.key, (acc.get(t.key) ?? 0) + t.score);
  const rows = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = rows.reduce((s, [, w]) => s + w, 0) || 1;
  return rows.map(([key, w]) => ({ key, label: TASTE_META[key].label, emoji: TASTE_META[key].emoji, share: Math.round((w / total) * 1000) / 10, change: null }));
}

/** 점포 취향 성향을 방문 수로 가중해 만든 '방문 분포' — 관심 대비 방문이 낮은 분야를 찾는 데 씁니다. */
function visitShares(stores: Store[], counts: Record<string, Partial<Record<InteractionType, number>>>): Map<TasteKey, number> {
  const acc = new Map<TasteKey, number>();
  let total = 0;
  for (const store of stores) {
    const real = counts[store.id] ?? {};
    const visits = store.activity.visitCount + (real.visit ?? 0) + (real.view ?? 0) * 0.2;
    if (visits <= 0) continue;
    for (const t of topTastes(store.features.taste, 3, 0.3)) {
      acc.set(t.key, (acc.get(t.key) ?? 0) + visits * t.score);
      total += visits * t.score;
    }
  }
  if (total > 0) for (const [k, v] of acc) acc.set(k, v / total);
  return acc;
}

/**
 * 시장 전체 관심 분포를 '이 점포와 관련 있는 정도'로 다시 가중합니다.
 * 귀금속 점포에 먹거리 관심이 1순위로 뜨는 문제를 막고, 홍보 아이디어가
 * 그 점포가 실제로 파는 것 안에서만 나오게 하기 위한 값입니다.
 */
function storeRelevantInterest(store: Store, interest: InterestRow[]): InterestRow[] {
  const taste = store.features.taste;
  const rows = interest
    .map((row) => ({ row, weight: row.share * taste[row.key] }))
    .filter((r) => r.weight > 0 && taste[r.row.key] >= 0.25);
  if (rows.length === 0) return [];
  const total = rows.reduce((s, r) => s + r.weight, 0) || 1;
  return rows
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map(({ row, weight }) => ({ ...row, share: Math.round((weight / total) * 1000) / 10 }));
}

function metricsFor(store: Store, real: Partial<Record<InteractionType, number>>): StoreMetrics {
  const counts = { view: real.view ?? 0, like: real.like ?? 0, bookmark: real.bookmark ?? 0, visit: real.visit ?? 0 };
  return {
    storeId: store.id,
    name: store.name,
    category: categoryPath(store.mainCategory, store.subCategory),
    entityLabel: ENTITY_KIND_LABEL[store.entityKind],
    interestUsers: store.activity.interestUsers + counts.view + counts.like + counts.bookmark,
    visits: store.activity.visitCount + counts.visit,
    likes: store.activity.likeCount + counts.like,
    saves: store.activity.saveCount + counts.bookmark,
    real: counts,
  };
}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * 집계 인사이트 계산
 * 1) 관심 분포: 실제 취향 기록이 MIN_USERS_FOR_INSIGHTS명 이상이면 실제 분포, 아니면 가상 집계
 * 2) 점포 지표: 가상 집계 + 실제 상호작용 수를 더해서 보여줍니다(어느 쪽인지 화면에 함께 표시)
 */
export async function getMerchantInsights(storeId: string | null): Promise<MerchantInsights> {
  const repo = getRepository();
  const stores = await getStores();
  const store = storeId ? (stores.find((s) => s.id === storeId) ?? null) : null;
  if (storeId && !store) throw new Error("존재하지 않는 점포입니다.");

  const since = sinceIso(INSIGHT_DAYS);
  let counts: Record<string, Partial<Record<InteractionType, number>>> = {};
  let realVectors: TasteVector[] = [];
  try {
    counts = await repo.countInteractionsByStore(since);
  } catch (err) {
    console.warn("[insights] 상호작용 집계를 불러오지 못했습니다:", err);
  }
  try {
    // 같은 사람이 여러 번 분석해도 1명으로 셉니다 (최소 인원 기준이 사람 수를 뜻하도록).
    const recent = await repo.listRecentPreferences(since, 500);
    const perUser = new Map<string, TasteVector>();
    for (const r of recent) perUser.set(r.userKey, r.tasteVector);
    realVectors = [...perUser.values()];
  } catch (err) {
    console.warn("[insights] 최근 취향 기록을 불러오지 못했습니다:", err);
  }

  const useReal = realVectors.length >= MIN_USERS_FOR_INSIGHTS;
  const mockShares = recentInterestShares(INSIGHT_DAYS);
  const interest = useReal ? shareFromVectors(realVectors) : mockShares.slice(0, 6).map(toRow);
  const rising = risingInterests(INSIGHT_DAYS, 4).map(toRow);

  const visits = visitShares(store ? [store] : stores, counts);
  const lowConversion = interest
    // '새로운 발견'은 점포가 가질 수 있는 성질이 아니라 손님의 태도여서 방문 비중과 비교하지 않습니다.
    .filter((row) => !(COSINE_EXCLUDED_KEYS as readonly string[]).includes(row.key))
    .map((row) => ({ key: row.key, label: row.label, interestShare: row.share, visitShare: Math.round((visits.get(row.key) ?? 0) * 1000) / 10 }))
    .filter((r) => r.interestShare - r.visitShare >= 3)
    .sort((a, b) => b.interestShare - b.visitShare - (a.interestShare - a.visitShare))
    .slice(0, 3);

  const storeGaps = stores
    .map((s) => {
      const m = metricsFor(s, counts[s.id] ?? {});
      return { storeId: s.id, name: s.name, category: m.category, interestUsers: m.interestUsers, visits: m.visits, ratio: m.visits > 0 ? m.interestUsers / m.visits : 0 };
    })
    .filter((g) => g.interestUsers >= 20)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 8);

  return {
    scope: store ? "store" : "market",
    storeId: store?.id ?? null,
    period: `최근 ${INSIGHT_DAYS}일`,
    isMock: !useReal,
    distinctUsers: useReal ? realVectors.length : null,
    minUsers: MIN_USERS_FOR_INSIGHTS,
    notice: useReal
      ? `실제 이용자 ${realVectors.length}명의 취향 분포입니다. 개인을 식별할 수 있는 정보는 포함하지 않습니다.`
      : `${MARKET_INTEREST_META.notice} 실제 이용자가 ${MIN_USERS_FOR_INSIGHTS}명 이상 모이면 실제 분포로 바뀝니다.`,
    interest,
    rising,
    lowConversion,
    metrics: store ? metricsFor(store, counts[store.id] ?? {}) : null,
    storeInterest: store ? storeRelevantInterest(store, interest) : [],
    storeTasteKeys: store ? topTastes(store.features.taste, 4, 0.3).map((t) => t.key) : [],
    storeGaps,
    generatedAt: new Date().toISOString(),
  };
}

export const ACTIVITY_NOTICE = MOCK_ACTIVITY_META.notice;
