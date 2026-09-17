import "server-only";
import type { InteractionState, RecommendationItem } from "@/lib/api/schemas";
import { getRepository } from "@/lib/db";
import { topTastes, type TasteVector } from "@/lib/recommendation/dimensions";
import { exposureBoostFromCounts, rankStores, type ProfileVectors, type ScoredStore } from "@/lib/recommendation/engine";
import { currentState, INTERACTION_WEIGHTS, type InteractionEvent } from "@/lib/recommendation/feedback";
import { templateReason } from "@/lib/recommendation/reasons";
import { generateReasonsWithFallback } from "@/lib/providers/ai";
import { ENTITY_KIND_LABEL, type EntityKind } from "@/lib/stores/parse";
import { getStores } from "@/lib/stores/catalog";
import type { Store } from "@/lib/stores/types";

const ENTITY_NOUN: Record<EntityKind, string> = ENTITY_KIND_LABEL;

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
    liked: [...lists.liked].slice(0, 100),
    bookmarked: [...lists.bookmarked].slice(0, 100),
    visited: [...lists.visited].slice(0, 100),
    dismissed: [...lists.dismissed].slice(0, 100),
  };
}

/** 좋아요·찜·방문·관심 없음(명시적 행동) + 조회수(최대 +0.15) → 점포별 interaction feedback (-1~1) */
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

export function toItem(store: Store, scored: ScoredStore, reason?: string): RecommendationItem {
  return {
    storeId: store.id,
    score: scored.score,
    raw: scored.raw,
    components: scored.components,
    matchedTastes: scored.matchedTastes,
    matchedProducts: scored.matchedProducts,
    reason:
      reason ??
      templateReason({
        storeType: store.storeType,
        entityNoun: ENTITY_NOUN[store.entityKind],
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

export async function computeRecommendations(
  profile: ProfileVectors,
  interactions?: InteractionState,
  options: { userId?: string | null } = {},
): Promise<{ items: RecommendationItem[]; interactions: InteractionState }> {
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
  const ranked = rankStores(
    profile,
    stores.map((s) => ({
      id: s.id,
      taste: s.features.taste,
      market: s.features.market,
      exposure: s.features.exposure,
      recommendable: s.features.recommendable,
      productHints: s.features.productHints,
    })),
    {
      feedbackByStore: feedbackFromState(merged, events),
      exposureBoostByStore: exposureBoost,
      dismissedStoreIds: merged.dismissed,
    },
  );
  const byId = new Map(stores.map((s) => [s.id, s]));
  return { items: ranked.map((r) => toItem(byId.get(r.storeId)!, r)), interactions: merged };
}

/** 상위 점포의 추천 이유를 Gemini로 생성 (실패/미설정 시 빈 결과 → 템플릿 유지) */
export async function generateReasons(args: {
  personaLabel: string | null;
  taste: TasteVector;
  recent: TasteVector | null;
  storeIds: string[];
}) {
  const stores = await getStores();
  const ranked = rankStores(
    { taste: args.taste, recent: args.recent },
    stores
      .filter((s) => args.storeIds.includes(s.id))
      .map((s) => ({
        id: s.id,
        taste: s.features.taste,
        market: s.features.market,
        exposure: s.features.exposure,
        recommendable: s.features.recommendable,
        productHints: s.features.productHints,
      })),
  );
  const byId = new Map(stores.map((s) => [s.id, s]));
  return generateReasonsWithFallback({
    personaLabel: args.personaLabel,
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
          category: s.features.primaryCategory,
          confirmedItems: s.features.productHints,
          matchedTastes: r.matchedTastes.map((m) => m.key),
          locationNote: s.addressDetail ?? s.addressRaw,
        };
      }),
  });
}
