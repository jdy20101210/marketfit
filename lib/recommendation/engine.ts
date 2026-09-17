/**
 * 개인화 추천 점수 계산 (순수 함수, 서버/클라이언트 공용)
 *
 * score = 0.60·preference_fit + 0.15·recent_interest_fit + 0.10·market_experience_fit
 *       + 0.10·discovery_bonus + 0.05·interaction_feedback
 *
 * - preference_fit: 사용자 취향 vector ↔ 점포 feature vector cosine similarity (가장 중요한 값)
 *   · 가중 cosine: 상품 분야 차원(커피·캠핑·선물 등) 1.0, 상황·스타일 차원(로컬·발견·가성비·가족 등) 0.5
 *     (상황·스타일 차원은 사용자가 그 성향을 드러낸 경우(0.2 이상)에만 계산에 넣습니다)
 *   · 관심사가 여러 개면 "관심 분야 묶음(facet)"별 cosine도 계산해 가장 잘 맞는 값을 씁니다(0.95배 할인).
 *     → 커피·캠핑·빈티지를 모두 좋아하는 사용자에게 커피 전문점도 제대로 된 점수가 나옵니다.
 *   · 관심 분야를 점포가 실제로 얼마나 강하게 갖고 있는지(0.75~1.0배)를 곱해, 성향이 옅은 점포가
 *     vector 모양만 비슷해서 높은 점수를 받는 일을 줄입니다.
 * - recent_interest_fit: 지금 찾는 것(대화의 목적·입력 키워드) vector ↔ 점포 cosine similarity
 * - market_experience_fit: 중앙시장 고유 특성(보조 역할) × 사용자의 로컬·전통·여행 관심
 * - discovery_bonus: 덜 알려진 점포 가산점. 취향이 어느 정도 맞는 점포에만 적용(인기순 추천 방지),
 *   사용자의 '새로운 발견' 선호가 높을수록 커집니다.
 * - interaction_feedback: 좋아요/저장/방문(+), 관심 없음(−). 행동 데이터가 없으면 0
 *
 * 추천 순위는 이 점수로만 정합니다(AI는 순위에 관여하지 않음).
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
  recent_interest_fit: { label: "지금 찾는 것", hint: "대화에서 말한 목적·입력 키워드와의 유사도" },
  market_experience_fit: { label: "시장 경험", hint: "중앙시장 고유 특성 × 로컬·전통·여행 관심" },
  discovery_bonus: { label: "새로운 발견", hint: "덜 알려졌지만 취향에 맞는 점포 가산점" },
  interaction_feedback: { label: "나의 반응", hint: "좋아요·저장·방문(+), 관심 없음(−)" },
};

/** 상황·스타일 차원 (가중 cosine에서 0.5배, 사용자 값이 0.2 미만이면 제외) — 나머지는 상품 분야 차원 */
export const CONTEXT_KEYS = ["travel", "family", "date", "practical", "local", "discovery", "price_sensitive"] as const satisfies readonly TasteKey[];
export const PRODUCT_KEYS: TasteKey[] = TASTE_KEYS.filter((k) => !(CONTEXT_KEYS as readonly string[]).includes(k));
export const CONTEXT_WEIGHT = 0.5;
export const CONTEXT_MIN = 0.2;
/**
 * cosine 유사도에서 빼는 차원.
 * '새로운 발견'은 점포의 성질이 아니라 사용자의 태도(덜 알려진 곳을 좋아하는지)여서,
 * 별도 항목(discovery_bonus, 가중치 0.10)으로만 반영합니다.
 * cosine에 함께 넣으면 이 값이 높은 사용자에게 거의 모든 점포가 불리해집니다.
 */
export const COSINE_EXCLUDED_KEYS = ["discovery"] as const satisfies readonly TasteKey[];
/** 관심 분야 묶음(facet)으로 볼 최소 점수와 최대 개수, 할인율 */
export const FACET_MIN = 0.5;
export const FACET_LIMIT = 4;
export const FACET_DISCOUNT = 0.95;
export const FACET_PEER_RATIO = 0.8;
/** 관심 분야 보유 강도: COVERAGE_BASE + (1 − COVERAGE_BASE) × 점포의 해당 차원 값 */
export const COVERAGE_BASE = 0.75;
/**
 * 묶음(facet) 비교는 그 분야만 보기 때문에 방향만 비슷해도 값이 커집니다.
 * 그래서 "점포가 그 분야를 실제로 얼마나 강하게 갖고 있는지"를 더 크게 반영합니다.
 */
export const FACET_COVERAGE_BASE = 0.3;

const DIM_WEIGHT: Record<TasteKey, number> = Object.fromEntries(
  TASTE_KEYS.map((k) => [
    k,
    (COSINE_EXCLUDED_KEYS as readonly string[]).includes(k) ? 0 : (CONTEXT_KEYS as readonly string[]).includes(k) ? CONTEXT_WEIGHT : 1,
  ]),
) as Record<TasteKey, number>;

export interface ProfileVectors {
  taste: TasteVector;
  /** 지금 찾는 것(목적) vector. 없으면 taste를 사용 */
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
  /** 가장 잘 맞은 관심 분야 묶음 (전체 취향 기준이면 null) */
  facet: TasteKey | null;
  recommendable: boolean;
  dismissed: boolean;
}

/** 일반 cosine similarity (0~1) */
export function cosineSimilarity(a: TasteVector, b: TasteVector): number {
  return weightedCosine(a, b, null);
}

/** 차원 가중 cosine similarity (0~1). weights가 null이면 일반 cosine */
export function weightedCosine(a: TasteVector, b: TasteVector, weights: Record<TasteKey, number> | null = DIM_WEIGHT): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of TASTE_KEYS) {
    const w = weights ? weights[k] : 1;
    if (w === 0) continue;
    dot += w * a[k] * b[k];
    na += w * a[k] * a[k];
    nb += w * b[k] * b[k];
  }
  if (na === 0 || nb === 0) return 0;
  return clamp01(dot / (Math.sqrt(na) * Math.sqrt(nb)));
}

/**
 * 사용자 기준 차원 가중치: 상품 분야는 항상 1.0, 상황·스타일 차원은 사용자가 그 성향을 드러낸 경우(0.2 이상)에만 0.5.
 * 사용자가 말하지 않은 상황(가족·가성비 등)을 점포가 갖고 있다는 이유로 점수가 깎이지 않게 합니다.
 */
export function userDimWeights(user: TasteVector): Record<TasteKey, number> {
  const out = { ...DIM_WEIGHT };
  for (const k of CONTEXT_KEYS) if (user[k] < CONTEXT_MIN) out[k] = 0;
  return out;
}

/** 사용자의 관심 분야 묶음: 점수가 높은 상품 분야 차원 (최대 4개) */
export function userFacets(user: TasteVector): TasteKey[] {
  return PRODUCT_KEYS.filter((k) => user[k] >= FACET_MIN)
    .sort((a, b) => user[b] - user[a] || TASTE_KEYS.indexOf(a) - TASTE_KEYS.indexOf(b))
    .slice(0, FACET_LIMIT);
}

/**
 * 취향 유사도 = max(전체 취향 가중 cosine, 0.95 × 관심 분야 묶음별 가중 cosine)
 * 묶음 vector는 해당 상품 분야 1개 + 상황·스타일 차원만 남긴 사용자 vector입니다.
 */
export function preferenceSimilarity(user: TasteVector, store: TasteVector): { value: number; facet: TasteKey | null } {
  const weights = userDimWeights(user);
  const facets = userFacets(user);
  if (facets.length === 0) return { value: weightedCosine(user, store, weights), facet: null };
  // 관심 분야를 점포가 실제로 얼마나 강하게 갖고 있는지(0.75~1.0) 반영: 성향이 옅은 점포가 모양만 비슷해 높은 점수를 받지 않게 합니다.
  const coverage = (key: TasteKey) => COVERAGE_BASE + (1 - COVERAGE_BASE) * store[key];
  const facetCoverage = (key: TasteKey) => FACET_COVERAGE_BASE + (1 - FACET_COVERAGE_BASE) * store[key];
  let value = weightedCosine(user, store, weights) * Math.max(...facets.map(coverage));
  let facet: TasteKey | null = null;
  const strongest = user[facets[0]!];
  for (const key of facets) {
    // 이 묶음에서는 해당 상품 분야와 사용자가 말한 상황 차원만 비교합니다.
    // (점포가 가진 다른 분야는 양쪽에서 빼서, 여러 품목을 함께 파는 점포가 불리해지지 않게 합니다)
    const focusedWeights = { ...weights };
    for (const other of PRODUCT_KEYS) if (other !== key) focusedWeights[other] = 0;
    // 약한 관심 분야가 강한 관심을 앞지르지 않도록, 가장 강한 관심의 80%에 못 미치면 그 비율만큼 낮춥니다.
    const strength = Math.min(1, user[key] / strongest / FACET_PEER_RATIO);
    const v = FACET_DISCOUNT * strength * weightedCosine(user, store, focusedWeights) * facetCoverage(key);
    if (v > value + 1e-9) {
      value = v;
      facet = key;
    }
  }
  return { value: clamp01(value), facet };
}

function smoothstep(x: number, edge0: number, edge1: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * 표시용 0~100 점수 보정 (단조 증가 변환 — 순위는 바뀌지 않음)
 * - raw 값의 실제 상한은 약 0.85입니다(발견 가산점·반응이 동시에 최대가 되기 어려움).
 * - 0~0.85 구간을 0~1로 늘린 뒤 감마(0.65) 보정으로 중간 구간을 읽기 쉽게 폅니다.
 * - 사용자·결과에 따라 기준을 바꾸지 않는 고정 변환입니다(점수를 끌어올리지 않음).
 * - 원본 데이터만으로 '완전히 일치'한다고 단정할 수 없으므로 최대 99점으로 표시합니다.
 */
export const DISPLAY_CEILING = 0.85;
export const DISPLAY_GAMMA = 0.65;
export const DISPLAY_MAX = 99;
export function toDisplayScore(raw: number): number {
  return Math.min(DISPLAY_MAX, Math.round(100 * Math.pow(clamp01(raw / DISPLAY_CEILING), DISPLAY_GAMMA)));
}

/** 추천(지도 표시) 기준: 80점 이상. 80점 이상이 한 곳도 없을 때만 75점 이상으로 한 단계 낮춥니다. */
export const RECOMMEND_MIN_SCORE = 80;
export const RECOMMEND_FALLBACK_SCORE = 75;

export function scoreLabel(score: number): string {
  if (score >= 90) return "아주 잘 맞아요";
  if (score >= RECOMMEND_MIN_SCORE) return "잘 맞아요";
  if (score >= RECOMMEND_FALLBACK_SCORE) return "꽤 맞아요";
  if (score >= 60) return "일부 맞아요";
  return "관심사와 거리가 있어요";
}

export function matchHeadline(score: number): string {
  return score >= RECOMMEND_FALLBACK_SCORE ? `당신과 ${score}% 잘 맞아요` : `취향 일치도 ${score}%`;
}

export function scoreStore(
  profile: ProfileVectors,
  store: StoreScoringInput,
  options: { feedback?: number; exposureBoost?: number; dismissed?: boolean } = {},
): ScoredStore {
  const pref = preferenceSimilarity(profile.taste, store.taste);
  const preferenceFit = pref.value;
  const recentFit = profile.recent ? preferenceSimilarity(profile.recent, store.taste).value : preferenceFit;

  const marketValues = Object.values(store.market);
  const marketMean = marketValues.length ? marketValues.reduce((s, v) => s + v, 0) / marketValues.length : 0;
  const localAffinity = Math.max(profile.taste.local, profile.taste.traditional, profile.taste.travel);
  const marketFit = clamp01(marketMean * (0.5 + 0.5 * localAffinity));

  const exposure = clamp01(store.exposure + (options.exposureBoost ?? 0));
  const discoveryAppetite = 0.5 + 0.5 * profile.taste.discovery;
  const discovery = clamp01((1 - exposure) * smoothstep(preferenceFit, 0.35, 0.7) * discoveryAppetite);

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
    contribution: round3(DIM_WEIGHT[key] * profile.taste[key] * store.taste[key]),
  }))
    .filter((m) => m.user >= 0.3 && m.store >= 0.3)
    .sort((a, b) => (b.key === pref.facet ? 1 : 0) - (a.key === pref.facet ? 1 : 0) || b.contribution - a.contribution)
    .slice(0, 3);

  const userStrong = new Set(TASTE_KEYS.filter((k) => profile.taste[k] >= 0.45));
  const matchedProducts = store.productHints.filter((hint) => {
    const m = matchKeyword(hint);
    return m.mapped && PRODUCT_KEYS.some((k) => userStrong.has(k) && m.weights[k] >= 0.5);
  });

  return {
    storeId: store.id,
    score: store.recommendable ? toDisplayScore(raw) : 0,
    raw: round3(raw),
    components,
    matchedTastes,
    matchedProducts,
    facet: pref.facet,
    recommendable: store.recommendable,
    dismissed: Boolean(options.dismissed),
  };
}

/** 점수 내림차순 정렬 (추천 대상 → 관심 없음 → 추천 제외). 같은 점수면 raw, 그다음 id 순 */
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
      return b.score - a.score || b.raw - a.raw || a.storeId.localeCompare(b.storeId, "en", { numeric: true });
    });
}

export interface RankedSelection<T> {
  /** 순위가 매겨진 추천 점포 (지도·목록 공통, 1위부터) */
  ranked: (T & { rank: number })[];
  /** 적용된 기준 점수. 기준을 넘는 점포가 없으면 null */
  threshold: number | null;
  /** 80점 기준을 넘는 점포가 없어 75점 기준을 적용했는지 */
  usedFallback: boolean;
  counts: { atPrimary: number; atFallback: number; scored: number };
  bestScore: number;
}

/**
 * 추천 기준 적용: 80점 이상만 순위를 매깁니다.
 * 80점 이상이 없으면 75점 이상으로 한 번만 낮추고, 그래도 없으면 빈 목록(“일치하는 점포 없음”)을 돌려줍니다.
 * 점수는 그대로 두며 기준 미만 점포를 끌어올리지 않습니다.
 */
export function selectRecommended<T extends { score: number; raw: number; recommendable: boolean; dismissed: boolean }>(
  sorted: T[],
  options: { primary?: number; fallback?: number } = {},
): RankedSelection<T> {
  const primary = options.primary ?? RECOMMEND_MIN_SCORE;
  const fallback = options.fallback ?? RECOMMEND_FALLBACK_SCORE;
  const eligible = sorted.filter((s) => s.recommendable && !s.dismissed);
  const atPrimary = eligible.filter((s) => s.score >= primary);
  const atFallback = eligible.filter((s) => s.score >= fallback);
  const threshold = atPrimary.length > 0 ? primary : atFallback.length > 0 ? fallback : null;
  const picked = threshold === null ? [] : threshold === primary ? atPrimary : atFallback;
  return {
    ranked: picked.map((s, i) => ({ ...s, rank: i + 1 })),
    threshold,
    usedFallback: threshold === fallback && fallback !== primary,
    counts: { atPrimary: atPrimary.length, atFallback: atFallback.length, scored: eligible.length },
    bestScore: eligible[0]?.score ?? 0,
  };
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
