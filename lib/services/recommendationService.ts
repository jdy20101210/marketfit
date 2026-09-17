import "server-only";
import type { InteractionState, RecommendationItem, RecommendationsResponse } from "@/lib/api/schemas";
import { getRepository } from "@/lib/db";
import { topTastes, type TasteVector } from "@/lib/recommendation/dimensions";
import {
  exposureBoostFromCounts,
  rankStores,
  RECOMMEND_FALLBACK_SCORE,
  RECOMMEND_MIN_SCORE,
  selectRecommended,
  type ProfileVectors,
  type ScoredStore,
} from "@/lib/recommendation/engine";
import { currentState, INTERACTION_WEIGHTS, type InteractionEvent } from "@/lib/recommendation/feedback";
import { templateReason } from "@/lib/recommendation/reasons";
import { generateReasonsWithFallback } from "@/lib/providers/ai";
import { categoryPath } from "@/lib/stores/description";
import { ENTITY_KIND_LABEL } from "@/lib/stores/parse";
import { getStores } from "@/lib/stores/catalog";
import type { Store } from "@/lib/stores/types";

const LIST_BY_KIND = { like: "liked", bookmark: "bookmarked", visit: "visited", dismiss: "dismissed" } as const;

/**
 * 브라우저가 보낸 현재 상태와 서버에 기록된 행동 이력을 합칩니다.
 * 토글할 때마다 서버에도 기록되므로, 브라우저 저장소가 비워져도 서버 이력으로 복원됩니다.
 */
export function mergeInteractionState(state: InteractionState | undefined, events: InteractionEvent[]): InteractionState {
  const lists = {
    liked: new Set(state?.liked ?? []),
    bookmarked: new Set(state?.bookmarked ?? []),
    visited: new Set(state?.visited ?? []),
    dismissed: new Set(state?.dismissed ?? []),
  };
  for (const [storeId, kinds] of currentState(events)) {
    for (const kind of kinds) if (kind !== "view") lists[LIST_BY_KIND[kind]].add(storeId);
  }
  return {
    liked: [...lists.liked].slice(0, 200),
    bookmarked: [...lists.bookmarked].slice(0, 200),
    visited: [...lists.visited].slice(0, 200),
    dismissed: [...lists.dismissed].slice(0, 200),
  };
}

/** 좋아요·저장·방문·관심 없음(명시적 행동) + 조회수(최대 +0.15) → 점포별 interaction feedback (-1~1) */
export function feedbackFromState(state: InteractionState | undefined, events: InteractionEvent[] = []): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (ids: string[], w: number) => {
    for (const id of ids) out[id] = (out[id] ?? 0) + w;
  };
  if (state) {
    add(state.liked, INTERACTION_WEIGHTS.like);
    add(state.bookmarked, INTERACTION_WEIGHTS.bookmark);
    add(state.visited, INTERACTION_WEIGHTS.visit);
    add(state.dismissed, INTERACTION_WEIGHTS.dismiss);
  }
  const views: Record<string, number> = {};
  for (const e of events) if (e.type === "view") views[e.storeId] = (views[e.storeId] ?? 0) + 1;
  for (const [id, count] of Object.entries(views)) out[id] = (out[id] ?? 0) + Math.min(0.15, count * INTERACTION_WEIGHTS.view);
  for (const id of Object.keys(out)) out[id] = Math.max(-1, Math.min(1, out[id]!));
  return out;
}

export function toItem(store: Store, scored: ScoredStore, rank: number | null, reason?: string): RecommendationItem {
  return {
    storeId: store.id,
    rank,
    score: scored.score,
    raw: scored.raw,
    components: scored.components,
    matchedTastes: scored.matchedTastes,
    matchedProducts: scored.matchedProducts,
    facet: scored.facet,
    reason:
      reason ??
      templateReason({
        storeType: store.storeType,
        entityNoun: ENTITY_KIND_LABEL[store.entityKind],
        matchedTastes: scored.matchedTastes,
        matchedProducts: scored.matchedProducts,
        productHints: store.features.productHints,
        score: scored.score,
      }),
    reasonProvider: reason ? "gemini" : "template",
    recommendable: scored.recommendable,
    dismissed: scored.dismissed,
  };
}

function scoringInputs(stores: Store[]) {
  return stores.map((s) => ({
    id: s.id,
    taste: s.features.taste,
    market: s.features.market,
    exposure: s.features.exposure,
    recommendable: s.features.recommendable,
    productHints: s.features.productHints,
  }));
}

/**
 * 추천 계산 (알고리즘만 사용 — AI는 순위에 관여하지 않음)
 * - 80점 이상 점포에 점수 내림차순으로 순위를 매기고, 없으면 75점 이상을 보여줍니다.
 * - 지도와 목록은 이 순위를 그대로 사용합니다.
 */
export async function computeRecommendations(
  profile: ProfileVectors,
  interactions?: InteractionState,
  options: { userId?: string | null; include?: string[]; analysisVersion?: number | null } = {},
): Promise<RecommendationsResponse> {
  const repo = getRepository();
  const stores = await getStores();
  let exposureBoost: Record<string, number> = {};
  let events: InteractionEvent[] = [];
  try {
    exposureBoost = exposureBoostFromCounts(await repo.countInteractionsByStore());
  } catch (err) {
    console.warn("[recommendations] 조회수 집계를 불러오지 못했습니다:", err);
  }
  if (options.userId) {
    try {
      events = await repo.listInteractions(options.userId);
    } catch (err) {
      console.warn("[recommendations] 행동 이력을 불러오지 못했습니다:", err);
    }
  }
  const merged = mergeInteractionState(interactions, events);
  const ranked = rankStores(profile, scoringInputs(stores), {
    feedbackByStore: feedbackFromState(merged, events),
    exposureBoostByStore: exposureBoost,
    dismissedStoreIds: merged.dismissed,
  });
  const selection = selectRecommended(ranked);
  const byId = new Map(stores.map((s) => [s.id, s]));
  const rankedIds = new Set(selection.ranked.map((r) => r.storeId));
  const extra = (options.include ?? []).filter((id) => byId.has(id) && !rankedIds.has(id));
  const scoredById = new Map(ranked.map((r) => [r.storeId, r]));

  const items = [
    ...selection.ranked.map((r) => toItem(byId.get(r.storeId)!, r, r.rank)),
    ...extra.map((id) => toItem(byId.get(id)!, scoredById.get(id)!, null)),
  ];
  return {
    items,
    threshold: {
      primary: RECOMMEND_MIN_SCORE,
      fallback: RECOMMEND_FALLBACK_SCORE,
      applied: selection.threshold,
      usedFallback: selection.usedFallback,
    },
    counts: { ...selection.counts, dismissed: ranked.filter((r) => r.dismissed).length },
    bestScore: selection.bestScore,
    scores: Object.fromEntries(ranked.map((r) => [r.storeId, r.score])),
    interactions: merged,
    analysisVersion: options.analysisVersion ?? null,
    generatedAt: new Date().toISOString(),
  };
}

/** 상위 점포의 추천 이유를 Gemini로 생성 (실패/미설정 시 빈 결과 → 템플릿 유지) */
export async function generateReasons(args: {
  personaLabel: string | null;
  summary?: string | null;
  intentLabel?: string | null;
  taste: TasteVector;
  recent: TasteVector | null;
  storeIds: string[];
}) {
  const stores = await getStores();
  const wanted = new Set(args.storeIds);
  const targets = stores.filter((s) => wanted.has(s.id));
  const ranked = rankStores({ taste: args.taste, recent: args.recent }, scoringInputs(targets));
  const byId = new Map(targets.map((s) => [s.id, s]));
  return generateReasonsWithFallback({
    personaLabel: args.personaLabel,
    summary: args.summary ?? null,
    intentLabel: args.intentLabel ?? null,
    userTop: topTastes(args.taste, 5, 0.3),
    stores: ranked
      .filter((r) => r.recommendable)
      .map((r) => {
        const s = byId.get(r.storeId)!;
        return {
          id: s.id,
          name: s.name,
          storeType: s.storeType,
          entityLabel: ENTITY_KIND_LABEL[s.entityKind],
          category: categoryPath(s.mainCategory, s.subCategory),
          confirmedItems: s.features.productHints,
          matchedTastes: r.matchedTastes.map((m) => m.key),
          locationNote: s.addressDetail ?? s.zone ?? s.addressRaw,
        };
      }),
  });
}
