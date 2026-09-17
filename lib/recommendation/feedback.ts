/**
 * 사용자 행동(view/like/bookmark/dismiss/visit) → 추천 피드백 & 취향 weight update
 * MVP에서는 단순한 규칙 기반 업데이트 구조만 둡니다.
 */
import { clamp01, round3, TASTE_KEYS, type TasteVector } from "./dimensions";

export type InteractionKind = "view" | "like" | "bookmark" | "dismiss" | "visit";

export interface InteractionEvent {
  storeId: string;
  type: InteractionKind;
  active: boolean;
  createdAt: string;
}

export const INTERACTION_WEIGHTS: Record<InteractionKind, number> = {
  view: 0.05,
  like: 0.5,
  bookmark: 0.7,
  visit: 1,
  dismiss: -1,
};

export const INTERACTION_LABELS: Record<InteractionKind, string> = {
  view: "조회",
  like: "좋아요",
  bookmark: "찜",
  dismiss: "관심 없음",
  visit: "방문",
};

/** (점포, 유형)별 마지막 이벤트 기준의 현재 상태 */
export function currentState(events: InteractionEvent[]): Map<string, Set<InteractionKind>> {
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const state = new Map<string, Set<InteractionKind>>();
  for (const e of sorted) {
    if (e.type === "view") continue;
    const set = state.get(e.storeId) ?? new Set<InteractionKind>();
    if (e.active) set.add(e.type);
    else set.delete(e.type);
    state.set(e.storeId, set);
  }
  return state;
}

export function feedbackByStore(events: InteractionEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [storeId, types] of currentState(events)) {
    let sum = 0;
    for (const t of types) sum += INTERACTION_WEIGHTS[t];
    out[storeId] = sum;
  }
  const views: Record<string, number> = {};
  for (const e of events) if (e.type === "view") views[e.storeId] = (views[e.storeId] ?? 0) + 1;
  for (const [storeId, count] of Object.entries(views)) {
    out[storeId] = (out[storeId] ?? 0) + Math.min(0.15, count * INTERACTION_WEIGHTS.view);
  }
  for (const k of Object.keys(out)) out[k] = round3(Math.max(-1, Math.min(1, out[k]!)));
  return out;
}

export function dismissedStores(events: InteractionEvent[]): string[] {
  return [...currentState(events)].filter(([, types]) => types.has("dismiss")).map(([id]) => id);
}

/**
 * 간단한 취향 weight update.
 * - 긍정 행동: 점포가 강하게 가진 성향 쪽으로 사용자 취향을 조금 이동
 * - 관심 없음: 해당 점포의 강한 성향을 조금 낮춤
 */
export function updateTasteVector(taste: TasteVector, storeTaste: TasteVector, type: InteractionKind, learningRate = 0.08): TasteVector {
  if (type === "view") return taste;
  const weight = INTERACTION_WEIGHTS[type];
  const next = { ...taste };
  for (const k of TASTE_KEYS) {
    const s = storeTaste[k];
    if (s < 0.3) continue;
    if (weight > 0) {
      next[k] = clamp01(taste[k] + learningRate * weight * s * (1 - taste[k]));
    } else {
      next[k] = clamp01(taste[k] - learningRate * Math.abs(weight) * s * taste[k] * 0.5);
    }
    next[k] = round3(next[k]);
  }
  return next;
}
