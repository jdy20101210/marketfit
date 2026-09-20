import { describe, expect, it } from "vitest";
import seed from "@/data/stores/stores.seed.json";
import features from "@/data/stores/store-features.json";
import { emptyVector, TASTE_KEYS, toVector } from "@/lib/recommendation/dimensions";
import {
  cosineSimilarity,
  preferenceSimilarity,
  rankStores,
  RECOMMEND_FALLBACK_SCORE,
  RECOMMEND_MIN_SCORE,
  scoreStore,
  SCORE_WEIGHTS,
  selectRecommended,
  toDisplayScore,
  weightedCosine,
} from "@/lib/recommendation/engine";
import { currentState, feedbackByStore, updateTasteVector } from "@/lib/recommendation/feedback";
import { matchKeyword, matchSentence, splitKeywords, vectorFromKeywords } from "@/lib/recommendation/keywords";
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
  it("기본 가중치 합은 1이고 취향 적합도가 가장 크다", () => {
    // item_match는 다른 항목의 비중을 빼지 않고 위에 더하는 가산점이라 합계에서 제외합니다.
    const { item_match, ...base } = SCORE_WEIGHTS;
    const sum = Object.values(base).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(SCORE_WEIGHTS.preference_fit).toBe(Math.max(...Object.values(base)));
    expect(item_match).toBeGreaterThan(0);
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

const storeById = new Map(seed.stores.map((s) => [s.id, s]));
const kw = (words: string[]) => vectorFromKeywords(words.map((keyword) => ({ keyword, score: 0.9 }))).vector;

describe("취향 유사도 (가중 cosine + 관심 분야 묶음)", () => {
  it("상황·스타일 차원은 절반 가중치로 계산한다", () => {
    const user = toVector({ coffee: 1, local: 1 });
    const store = toVector({ coffee: 1 });
    expect(weightedCosine(user, store)).toBeGreaterThan(cosineSimilarity(user, store));
  });

  it("관심사가 여러 개여도 한 분야에 잘 맞는 점포를 놓치지 않는다", () => {
    const user = kw(["커피", "캠핑", "선물", "빈티지", "전통시장"]);
    const coffeeShop = toVector({ coffee: 0.95, dessert: 0.6, local: 0.7 });
    const pref = preferenceSimilarity(user, coffeeShop);
    expect(pref.facet).toBe("coffee");
    expect(pref.value).toBeGreaterThan(cosineSimilarity(user, coffeeShop));
  });

  it("약한 관심 분야는 강한 관심보다 앞서지 않는다", () => {
    const user = toVector({ coffee: 0.9, kitchen: 0.8, living: 0.5 });
    const curtain = toVector({ living: 0.95, practical: 0.45 });
    const kitchen = toVector({ kitchen: 0.95, practical: 0.75, living: 0.45, coffee: 0.25 });
    expect(preferenceSimilarity(user, kitchen).value).toBeGreaterThan(preferenceSimilarity(user, curtain).value);
  });
});

describe("추천 순위", () => {
  it("주방 취향 사용자에게 주방용품 점포가 상위에 온다", () => {
    const profile = { taste: toVector({ kitchen: 0.95, family: 0.8, practical: 0.7 }), recent: null };
    const ranked = rankStores(profile, storeInputs);
    expect(ranked.slice(0, 5).every((r) => storeById.get(r.storeId)!.subCategory === "그릇•주방용품" || r.score < ranked[0]!.score)).toBe(true);
    expect(storeById.get(ranked[0]!.storeId)!.subCategory).toBe("그릇•주방용품");
  });

  it("점수 내림차순이며 추천 제외 점포는 0점으로 맨 뒤에 둔다", () => {
    const profile = { taste: toVector({ food: 1, local: 0.9 }), recent: null };
    const extra = { ...storeInputs[0]!, id: "zz-info", recommendable: false };
    const ranked = rankStores(profile, [...storeInputs, extra]);
    expect(ranked.at(-1)!.storeId).toBe("zz-info");
    expect(ranked.at(-1)!.score).toBe(0);
    const scores = ranked.filter((r) => r.recommendable).map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("관심 없음 점포는 추천 가능한 점포 중 뒤쪽으로 밀린다", () => {
    const profile = { taste: toVector({ food: 1, local: 0.9 }), recent: null };
    const first = rankStores(profile, storeInputs)[0]!;
    const ranked = rankStores(profile, storeInputs, { dismissedStoreIds: [first.storeId], feedbackByStore: { [first.storeId]: -1 } });
    const idx = ranked.findIndex((r) => r.storeId === first.storeId);
    expect(ranked[idx]!.dismissed).toBe(true);
    expect(ranked.slice(idx + 1).every((r) => r.dismissed || !r.recommendable)).toBe(true);
  });

  it("덜 알려진 점포는 취향이 맞을 때만 discovery bonus를 받는다", () => {
    const vendorId = seed.stores.find((s) => s.name === "옷(노점)")!.id;
    const vendor = storeInputs.find((s) => s.id === vendorId)!;
    const scored = scoreStore({ taste: toVector({ fashion: 1, practical: 0.6, discovery: 0.8 }), recent: null }, { ...vendor, exposure: 0.2 });
    expect(scored.components.discovery_bonus).toBeGreaterThan(0.3);
    const unrelated = scoreStore({ taste: toVector({ camping: 1 }), recent: null }, { ...vendor, exposure: 0.2 });
    expect(unrelated.components.discovery_bonus).toBeLessThan(0.05);
  });
});

describe("추천 기준 (80점, 없으면 75점)", () => {
  const item = (id: string, score: number, extra: Partial<{ recommendable: boolean; dismissed: boolean }> = {}) => ({
    storeId: id,
    score,
    raw: score / 100,
    recommendable: true,
    dismissed: false,
    ...extra,
  });

  it("80점 이상만 점수순으로 순위를 매긴다", () => {
    const sel = selectRecommended([item("a", 93), item("b", 91), item("c", 87), item("d", 79), item("e", 60)]);
    expect(sel.threshold).toBe(RECOMMEND_MIN_SCORE);
    expect(sel.usedFallback).toBe(false);
    expect(sel.ranked.map((r) => [r.rank, r.storeId, r.score])).toEqual([
      [1, "a", 93],
      [2, "b", 91],
      [3, "c", 87],
    ]);
  });

  it("80점 이상이 없으면 75점 이상을 보여주고 점수는 바꾸지 않는다", () => {
    const sel = selectRecommended([item("a", 78), item("b", 75), item("c", 74)]);
    expect(sel.threshold).toBe(RECOMMEND_FALLBACK_SCORE);
    expect(sel.usedFallback).toBe(true);
    expect(sel.ranked.map((r) => r.score)).toEqual([78, 75]);
  });

  it("75점 이상도 없으면 빈 목록을 돌려준다", () => {
    const sel = selectRecommended([item("a", 74), item("b", 60)]);
    expect(sel.threshold).toBeNull();
    expect(sel.ranked).toEqual([]);
    expect(sel.bestScore).toBe(74);
  });

  it("관심 없음·추천 제외 점포는 순위에서 뺀다", () => {
    const sel = selectRecommended([item("a", 95, { dismissed: true }), item("b", 90), item("c", 88, { recommendable: false })]);
    expect(sel.ranked.map((r) => r.storeId)).toEqual(["b"]);
    expect(sel.ranked[0]!.rank).toBe(1);
  });

  it("실제 데이터: 여러 관심 키워드를 입력해도 80점 이상 점포가 나온다", () => {
    const taste = kw(["커피", "캠핑", "선물", "빈티지", "전통시장"]);
    const sel = selectRecommended(rankStores({ taste, recent: taste }, storeInputs));
    expect(sel.threshold).toBe(RECOMMEND_MIN_SCORE);
    expect(sel.ranked.length).toBeGreaterThan(0);
    const subs = sel.ranked.map((r) => storeById.get(r.storeId)!.subCategory);
    expect(subs).toContain("스포츠•아웃도어");
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

  it("관련 차원을 약하게 함께 반영한다 (의미 확장)", () => {
    const coffee = matchKeyword("커피").weights;
    expect(coffee.coffee).toBe(1);
    expect(coffee.dessert).toBeGreaterThan(0);
    expect(coffee.dessert).toBeLessThan(0.5);
    expect(matchKeyword("대전만의").weights.discovery).toBeGreaterThan(0.5);
    expect(matchKeyword("가성비").weights.price_sensitive).toBe(1);
    expect(matchKeyword("독특한").weights.discovery).toBe(1);
  });

  it("대화 문장에서 부정 구절은 반영하지 않는다", () => {
    const m = matchSentence("친구 생일 선물을 찾는데, 캠핑은 관심 없어요.");
    // 사전 표기가 "생일선물"/"생일 선물" 두 가지라 띄어쓰기를 지우고 비교합니다.
    expect(m.matchedWords.map((w) => w.replace(/\s/g, ""))).toContain("생일선물");
    expect(m.weights.gift).toBe(1);
    expect(m.matchedWords).not.toContain("캠핑");
    expect(m.weights.camping).toBe(0);
  });

  it("키워드 입력을 여러 형식으로 나눈다", () => {
    expect(splitKeywords("커피, 캠핑, 선물, 빈티지, 전통시장")).toEqual(["커피", "캠핑", "선물", "빈티지", "전통시장"]);
    expect(splitKeywords("[커피] [캠핑]\n[선물]")).toEqual(["커피", "캠핑", "선물"]);
    expect(splitKeywords("#커피 #캠핑 #커피")).toEqual(["커피", "캠핑"]);
    expect(splitKeywords("커피 캠핑 선물")).toEqual(["커피", "캠핑", "선물"]);
    expect(splitKeywords("캠핑 의자")).toEqual(["캠핑 의자"]);
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
