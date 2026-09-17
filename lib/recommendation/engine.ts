/**
 * 개인화 추천 점수 계산 (순수 함수, 서버/클라이언트 공용)
 *
 * score = 0.60·preference_fit + 0.15·recent_interest_fit + 0.10·market_experience_fit
 *       + 0.10·discovery_bonus + 0.05·interaction_feedback
 *
 * - preference_fit: 사용자 취향 vector ↔ 점포 feature vector cosine similarity (가장 중요한 값)
 * - recent_interest_fit: 최근 관심(직접 입력 상품) vector ↔ 점포 cosine similarity
 * - market_experience_fit: 중앙시장 고유 특성(보조 역할) × 사용자의 로컬·전통·여행 관심
 * - discovery_bonus: 덜 알려진 점포 가산점. 취향이 어느 정도 맞는 점포에만 적용(인기순 추천 방지)
 * - interaction_feedback: 좋아요/찜/방문(+), 관심 없음(−). 행동 데이터가 없으면 0
 */
import { clamp01, round3, TASTE_KEYS, type TasteKey, type TasteVector } from "./dimensions";
import { matchKeyword } from "./keywords";

export const SCORE_WEIGHTS = {
  preference_fit: 0.6,
  recent_interest_fit: 0.15,
  market_experience_fit: 0.1,
  discovery_bonus: 0.1,
  interaction_feedback: 0.05,
} as const;

export type ScoreComponentKey = keyof typeof SCORE_WEIGHTS;
export type ScoreComponents = Record<ScoreComponentKey, number>;

export const SCORE_COMPONENT_META: Record<ScoreComponentKey, { label: string; hint: string }> = {
  preference_fit: { label: "취향 적합도", hint: "나의 취향 vector와 점포 성향의 cosine 유사도" },
  recent_interest_fit: { label: "최근 관심 적합도", hint: "직접 입력한 관심 상품과의 유사도" },
  market_experience_fit: { label: "시장 경험", hint: "중앙시장 고유 특성 × 로컬·전통·여행 관심" },
  discovery_bonus: { label: "새로운 발견", hint: "덜 알려졌지만 취향에 맞는 점포 가산점" },
  interaction_feedback: { label: "나의 반응", hint: "좋아요·찜·방문(+), 관심 없음(−)" },
};

export interface ProfileVectors {
  taste: TasteVector;
  recent: TasteVector | null;
}

export interface StoreScoringInput {
  id: string;
  taste: TasteVector;
  market: Record<string, number>;
  exposure: number;
  recommendable: boolean;
  productHints: string[];
}

export interface MatchedTaste {
  key: TasteKey;
  user: number;
  store: number;
  contribution: number;
}

export interface ScoredStore {
  storeId: string;
  score: number;
  raw: number;
  components: ScoreComponents;
  matchedTastes: MatchedTaste[];
  matchedProducts: string[];
  recommendable: boolean;
  dismissed: boolean;
}

export function cosineSimilarity(a: TasteVector, b: TasteVector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of TASTE_KEYS) {
    dot += a[k] * b[k];
    na += a[k] * a[k];
    nb += b[k] * b[k];
  }
  if (na === 0 || nb === 0) return 0;
  return clamp01(dot / (Math.sqrt(na) * Math.sqrt(nb)));
}

function smoothstep(x: number, edge0: number, edge1: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * 표시용 0~100 점수 보정 (단조 증가 변환 — 순위는 바뀌지 않음)
 * - 취향 vector가 여러 차원에 퍼져 있어 raw 값의 실제 상한은 약 0.85입니다.
 * - 0~0.85 구간을 0~1로 늘린 뒤 감마(0.65) 보정으로 중간 구간을 읽기 쉽게 폅니다.
 */
export const DISPLAY_CEILING = 0.85;
export const DISPLAY_GAMMA = 0.65;
export function toDisplayScore(raw: number): number {
  return Math.round(100 * Math.pow(clamp01(raw / DISPLAY_CEILING), DISPLAY_GAMMA));
}

export function scoreLabel(score: number): string {
  if (score >= 85) return "아주 잘 맞아요";
  if (score >= 70) return "잘 맞아요";
  if (score >= 55) return "취향에 맞을 수 있어요";
  return "새로운 발견";
}

export function matchHeadline(score: number): string {
  return score >= 55 ? `당신과 ${score}% 잘 맞아요` : `취향 적합도 ${score}%`;
}

/** 지도에서 '추천 점포'로 강조하는 기준 */
export const RECOMMENDED_MIN_SCORE = 70;

export function scoreStore(
  profile: ProfileVectors,
  store: StoreScoringInput,
  options: { feedback?: number; exposureBoost?: number; dismissed?: boolean } = {},
): ScoredStore {
  const preferenceFit = cosineSimilarity(profile.taste, store.taste);
  const recentFit = profile.recent ? cosineSimilarity(profile.recent, store.taste) : preferenceFit;

  const marketValues = Object.values(store.market);
  const marketMean = marketValues.length ? marketValues.reduce((s, v) => s + v, 0) / marketValues.length : 0;
  const localAffinity = Math.max(profile.taste.local, profile.taste.traditional, profile.taste.travel);
  const marketFit = clamp01(marketMean * (0.5 + 0.5 * localAffinity));

  const exposure = clamp01(store.exposure + (options.exposureBoost ?? 0));
  const discovery = clamp01((1 - exposure) * smoothstep(preferenceFit, 0.35, 0.7));

  const feedback = Math.max(-1, Math.min(1, options.feedback ?? 0));

  const components: ScoreComponents = {
    preference_fit: round3(preferenceFit),
    recent_interest_fit: round3(recentFit),
    market_experience_fit: round3(marketFit),
    discovery_bonus: round3(discovery),
    interaction_feedback: round3(feedback),
  };
  const raw =
    SCORE_WEIGHTS.preference_fit * preferenceFit +
    SCORE_WEIGHTS.recent_interest_fit * recentFit +
    SCORE_WEIGHTS.market_experience_fit * marketFit +
    SCORE_WEIGHTS.discovery_bonus * discovery +
    SCORE_WEIGHTS.interaction_feedback * feedback;

  const matchedTastes: MatchedTaste[] = TASTE_KEYS.map((key) => ({
    key,
    user: profile.taste[key],
    store: store.taste[key],
    contribution: round3(profile.taste[key] * store.taste[key]),
  }))
    .filter((m) => m.user >= 0.3 && m.store >= 0.3)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  const userStrong = new Set(TASTE_KEYS.filter((k) => profile.taste[k] >= 0.45));
  const matchedProducts = store.productHints.filter((hint) => {
    const m = matchKeyword(hint);
    return m.mapped && TASTE_KEYS.some((k) => userStrong.has(k) && m.weights[k] >= 0.5);
  });

  return {
    storeId: store.id,
    score: store.recommendable ? toDisplayScore(raw) : 0,
    raw: round3(raw),
    components,
    matchedTastes,
    matchedProducts,
    recommendable: store.recommendable,
    dismissed: Boolean(options.dismissed),
  };
}

export function rankStores(
  profile: ProfileVectors,
  stores: StoreScoringInput[],
  context: {
    feedbackByStore?: Record<string, number>;
    exposureBoostByStore?: Record<string, number>;
    dismissedStoreIds?: Iterable<string>;
  } = {},
): ScoredStore[] {
  const dismissed = new Set(context.dismissedStoreIds ?? []);
  return stores
    .map((s) =>
      scoreStore(profile, s, {
        feedback: context.feedbackByStore?.[s.id],
        exposureBoost: context.exposureBoostByStore?.[s.id],
        dismissed: dismissed.has(s.id),
      }),
    )
    .sort((a, b) => {
      if (a.recommendable !== b.recommendable) return a.recommendable ? -1 : 1;
      if (a.dismissed !== b.dismissed) return a.dismissed ? 1 : -1;
      return b.raw - a.raw || a.storeId.localeCompare(b.storeId);
    });
}

/**
 * 추천 목록 다양화: 같은 유형·카테고리가 연달아 나오지 않도록 순서만 조정합니다(점수는 그대로).
 * 탐욕적으로 하나씩 고르며, 이미 고른 항목과 유형이 같으면 정렬용 값에 감점을 줍니다.
 */
export function diversifyOrder<T extends { storeId: string; raw: number; recommendable: boolean; dismissed: boolean }>(
  items: T[],
  groupOf: (storeId: string) => { type: string; category: string },
): T[] {
  const head = items.filter((i) => i.recommendable && !i.dismissed);
  const tail = items.filter((i) => !i.recommendable || i.dismissed);
  const picked: T[] = [];
  const typeCount = new Map<string, number>();
  const catCount = new Map<string, number>();
  const pool = [...head];
  while (pool.length) {
    let bestIdx = 0;
    let bestValue = -Infinity;
    pool.forEach((item, idx) => {
      const g = groupOf(item.storeId);
      const value = item.raw - 0.06 * (typeCount.get(g.type) ?? 0) - 0.03 * (catCount.get(g.category) ?? 0);
      if (value > bestValue) {
        bestValue = value;
        bestIdx = idx;
      }
    });
    const [chosen] = pool.splice(bestIdx, 1);
    const g = groupOf(chosen!.storeId);
    typeCount.set(g.type, (typeCount.get(g.type) ?? 0) + 1);
    catCount.set(g.category, (catCount.get(g.category) ?? 0) + 1);
    picked.push(chosen!);
  }
  return [...picked, ...tail];
}

/** 전체 조회수 등으로 '알려진 정도'를 보정합니다(많이 본 점포일수록 발견 가산점 감소). */
export function exposureBoostFromCounts(counts: Record<string, Partial<Record<string, number>>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [storeId, c] of Object.entries(counts)) {
    const views = c.view ?? 0;
    const positives = (c.like ?? 0) + (c.bookmark ?? 0) + (c.visit ?? 0);
    out[storeId] = round3(Math.min(0.3, Math.log1p(views) / 20 + Math.log1p(positives) / 12));
  }
  return out;
}
