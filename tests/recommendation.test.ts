import { describe, expect, it } from "vitest";
import seed from "@/data/stores/stores.seed.json";
import features from "@/data/stores/store-features.json";
import { emptyVector, TASTE_KEYS, toVector } from "@/lib/recommendation/dimensions";
import { cosineSimilarity, diversifyOrder, rankStores, scoreStore, SCORE_WEIGHTS, toDisplayScore } from "@/lib/recommendation/engine";
import { currentState, feedbackByStore, updateTasteVector } from "@/lib/recommendation/feedback";
import { matchKeyword, vectorFromKeywords } from "@/lib/recommendation/keywords";
import { josa, templateReason } from "@/lib/recommendation/reasons";
import type { StoreFeatures } from "@/lib/stores/types";

const storeInputs = (features.features as unknown as StoreFeatures[]).map((f) => ({
  id: f.storeId,
  taste: toVector(f.taste),
  market: f.market,
  exposure: f.exposure,
  recommendable: f.recommendable,
  productHints: f.productHints,
}));

describe("가중치와 점수 범위", () => {
  it("가중치 합은 1이고 취향 적합도가 가장 크다", () => {
    const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(SCORE_WEIGHTS.preference_fit).toBe(Math.max(...Object.values(SCORE_WEIGHTS)));
  });

  it("cosine similarity는 0~1이며 같은 벡터는 1", () => {
    const v = toVector({ coffee: 0.9, camping: 0.5 });
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
    expect(cosineSimilarity(v, emptyVector())).toBe(0);
    expect(cosineSimilarity(toVector({ food: 1 }), toVector({ fashion: 1 }))).toBe(0);
  });

  it("표시 점수는 0~100 정수이고 단조 증가한다", () => {
    let prev = -1;
    for (let raw = -0.1; raw <= 1.2; raw += 0.05) {
      const s = toDisplayScore(raw);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it("행동 데이터가 없으면 interaction_feedback은 0", () => {
    const profile = { taste: toVector({ kitchen: 0.9, family: 0.8 }), recent: null };
    const scored = scoreStore(profile, storeInputs[12]!);
    expect(scored.components.interaction_feedback).toBe(0);
    expect(scored.score).toBeGreaterThan(0);
  });
});

describe("추천 순위", () => {
  it("주방 취향 사용자에게 주방용품 점포가 상위에 온다", () => {
    const profile = { taste: toVector({ kitchen: 0.95, family: 0.8, practical: 0.7 }), recent: null };
    const ranked = rankStores(profile, storeInputs);
    const topTypes = ranked.slice(0, 5).map((r) => seed.stores.find((s) => s.id === r.storeId)!.storeType);
    expect(topTypes.some((t) => t.includes("주방") || t.includes("식기"))).toBe(true);
  });

  it("상인회(시장 안내)는 추천 대상이 아니며 맨 뒤로 간다", () => {
    const profile = { taste: toVector({ local: 1, travel: 1 }), recent: null };
    const ranked = rankStores(profile, storeInputs);
    const association = ranked.find((r) => !r.recommendable)!;
    expect(association.score).toBe(0);
    expect(ranked.at(-1)!.recommendable).toBe(false);
  });

  it("관심 없음 점포는 추천 가능한 점포 중 뒤쪽으로 밀린다", () => {
    const profile = { taste: toVector({ food: 1, local: 0.9 }), recent: null };
    const first = rankStores(profile, storeInputs)[0]!;
    const ranked = rankStores(profile, storeInputs, { dismissedStoreIds: [first.storeId], feedbackByStore: { [first.storeId]: -1 } });
    const idx = ranked.findIndex((r) => r.storeId === first.storeId);
    expect(ranked[idx]!.dismissed).toBe(true);
    expect(ranked.slice(idx + 1).every((r) => r.dismissed || !r.recommendable)).toBe(true);
  });

  it("다양화는 점수를 바꾸지 않고 같은 유형 연속을 줄인다", () => {
    const profile = { taste: toVector({ kitchen: 1, family: 0.9, living: 0.8 }), recent: null };
    const ranked = rankStores(profile, storeInputs);
    const typeOf = (id: string) => ({ type: seed.stores.find((s) => s.id === id)!.storeType, category: "x" });
    const ordered = diversifyOrder(ranked, typeOf);
    expect(ordered).toHaveLength(ranked.length);
    expect(new Set(ordered.map((o) => o.score))).toEqual(new Set(ranked.map((o) => o.score)));
    const firstFour = ordered.slice(0, 4).map((o) => typeOf(o.storeId).type);
    expect(new Set(firstFour).size).toBeGreaterThan(1);
  });

  it("덜 알려진 점포는 취향이 맞을 때만 discovery bonus를 받는다", () => {
    const profile = { taste: toVector({ fashion: 1, practical: 0.6 }), recent: null };
    const vendor = storeInputs.find((s) => s.id === "jm-008")!; // 의류 노점 (노출도 낮음)
    const scored = scoreStore(profile, vendor);
    expect(scored.components.discovery_bonus).toBeGreaterThan(0.3);
    const unrelated = scoreStore({ taste: toVector({ food: 1 }), recent: null }, vendor);
    expect(unrelated.components.discovery_bonus).toBeLessThan(0.05);
  });
});

describe("키워드 → 취향", () => {
  it("직접 입력 예시를 올바른 차원으로 해석한다", () => {
    expect(matchKeyword("드립커피").weights.coffee).toBe(1);
    expect(matchKeyword("캠핑 의자").weights.camping).toBe(1);
    expect(matchKeyword("빈티지 소품").weights.vintage).toBe(1);
    expect(matchKeyword("한과").weights.traditional).toBeGreaterThan(0.8);
    expect(matchKeyword("여행 기념품").weights.gift).toBeGreaterThan(0.8);
  });

  it("긴 단어를 먼저 매칭해 부분 문자열로 오해석하지 않는다", () => {
    const chicken = matchKeyword("닭강정");
    expect(chicken.matchedWords).toEqual(["닭강정"]);
    expect(chicken.weights.traditional).toBe(0);
    expect(chicken.weights.food).toBeGreaterThan(0.8);
    const tteok = matchKeyword("떡볶이");
    expect(tteok.matchedWords).toEqual(["떡볶이"]);
    expect(tteok.weights.traditional).toBe(0);
    expect(matchKeyword("약과 선물").matchedWords.sort()).toEqual(["선물", "약과"]);
    expect(matchKeyword("전통시장").weights.local).toBe(1);
  });

  it("사전에 없는 상품은 약하게만 반영한다", () => {
    const m = matchKeyword("양자컴퓨터");
    expect(m.mapped).toBe(false);
    expect(Math.max(...TASTE_KEYS.map((k) => m.weights[k]))).toBeLessThanOrEqual(0.25);
  });

  it("여러 신호를 합쳐도 0~1을 유지한다", () => {
    const { vector } = vectorFromKeywords([
      { keyword: "커피", score: 1 },
      { keyword: "드립커피", score: 1 },
      { keyword: "카페", score: 1 },
    ]);
    expect(vector.coffee).toBeLessThanOrEqual(1);
    expect(vector.coffee).toBeGreaterThan(0.9);
  });
});

describe("행동 피드백", () => {
  const events = [
    { storeId: "a", type: "like" as const, active: true, createdAt: "2026-01-01T00:00:00Z" },
    { storeId: "a", type: "like" as const, active: false, createdAt: "2026-01-02T00:00:00Z" },
    { storeId: "b", type: "bookmark" as const, active: true, createdAt: "2026-01-01T00:00:00Z" },
    { storeId: "c", type: "dismiss" as const, active: true, createdAt: "2026-01-01T00:00:00Z" },
  ];

  it("마지막 이벤트 기준으로 상태를 계산한다", () => {
    const state = currentState(events);
    expect(state.get("a")?.has("like")).toBe(false);
    expect(state.get("b")?.has("bookmark")).toBe(true);
  });

  it("피드백 값은 -1~1이다", () => {
    const fb = feedbackByStore(events);
    expect(fb.b).toBeGreaterThan(0);
    expect(fb.c).toBe(-1);
    expect(fb.a ?? 0).toBe(0);
  });

  it("긍정 행동은 점포의 강한 성향 쪽으로 취향을 조금 이동시킨다", () => {
    const taste = toVector({ kitchen: 0.2 });
    const store = toVector({ kitchen: 0.9 });
    const up = updateTasteVector(taste, store, "visit");
    expect(up.kitchen).toBeGreaterThan(taste.kitchen);
    const down = updateTasteVector(toVector({ kitchen: 0.8 }), store, "dismiss");
    expect(down.kitchen).toBeLessThan(0.8);
    expect(updateTasteVector(taste, store, "view")).toBe(taste);
  });
});

describe("템플릿 추천 이유", () => {
  it("원본 품목이 일치하면 품목을 언급한다", () => {
    const text = templateReason({
      storeType: "가방·지갑·벨트",
      entityNoun: "상권",
      matchedTastes: [{ key: "accessory", user: 0.9, store: 0.95, contribution: 0.85 }],
      matchedProducts: ["가방", "지갑"],
      productHints: ["가방", "지갑", "벨트"],
    });
    expect(text).toContain("가방·지갑");
    expect(text).not.toMatch(/\d/);
  });

  it("점수가 낮으면 '잘 맞아요'라고 단정하지 않는다", () => {
    const base = {
      storeType: "여성의류",
      entityNoun: "점포",
      matchedTastes: [{ key: "fashion" as const, user: 0.5, store: 0.9, contribution: 0.3 }],
      matchedProducts: [],
      productHints: ["여성의류"],
    };
    expect(templateReason({ ...base, score: 82 })).toContain("잘 맞아요");
    expect(templateReason({ ...base, score: 60 })).toContain("어느 정도 맞아요");
    const low = templateReason({ ...base, score: 37 });
    expect(low).not.toContain("잘 맞아요");
    expect(low).toContain("일부 겹쳐 가볍게 둘러보기 좋은 '여성의류' 점포예요.");
  });

  it("조사를 받침에 맞게 고른다", () => {
    expect(josa("상권", "이라서", "라서")).toBe("상권이라서");
    expect(josa("상가", "이라서", "라서")).toBe("상가라서");
    expect(josa("'의류 노점'", "이라서", "라서")).toBe("'의류 노점'이라서");
    expect(josa("시몬사1", "은", "는")).toBe("시몬사1은");
    expect(josa("상가2", "은", "는")).toBe("상가2는");
  });
});
