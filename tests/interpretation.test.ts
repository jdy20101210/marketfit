import { describe, expect, it } from "vitest";
import { buildRuleProfile } from "@/lib/preferences/profile";
import { questionFor, ruleInterviewTurn, shortLookingFor, slotOrderFor, extractSlots } from "@/lib/preferences/extract";
import { INTERVIEW_GREETING, type ChatMessage } from "@/lib/preferences/types";
import { matchKeyword, matchSentence } from "@/lib/recommendation/keywords";
import { itemMatchScore, storeItemTerms, userItemTerms } from "@/lib/recommendation/itemMatch";
import { rankStores } from "@/lib/recommendation/engine";
import { getStores } from "@/lib/stores/catalog";

const top = (v: Record<string, number>, n = 3) =>
  Object.entries(v).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

describe("품목 직접 일치", () => {
  it("원본 품목·업종과 소분류를 나눠 읽는다", () => {
    const terms = storeItemTerms({ items: ["귀금속", "시계"], storeType: "귀금속·시계", subCategory: "귀금속•시계" });
    expect(terms.items).toContain("시계");
    expect(terms.category).toContain("귀금속시계");
  });

  it("입력 문장에서 품목 단어를 뽑는다 (조사 제거)", () => {
    expect(userItemTerms(["운동화를", "시계"])).toEqual(expect.arrayContaining(["운동화", "시계"]));
  });

  it("품목이 그대로 있으면 1점, 상위 품목이면 부분 점수", () => {
    const shoe = storeItemTerms({ items: ["운동화", "구두"], storeType: "신발", subCategory: "신발" });
    expect(itemMatchScore(["운동화"], shoe).score).toBe(1);
    const generic = storeItemTerms({ items: ["신발"], storeType: "신발", subCategory: "신발" });
    expect(itemMatchScore(["운동화"], generic).score).toBeGreaterThan(0);
    expect(itemMatchScore(["운동화"], generic).score).toBeLessThan(1);
    expect(itemMatchScore(["운동화"], storeItemTerms({ items: ["여성복"], storeType: "여성복", subCategory: "여성복" })).score).toBe(0);
  });

  it("소분류만 같은 점포는 품목이 같은 점포보다 낮게 잡힌다", () => {
    const real = storeItemTerms({ items: ["건어물", "반찬"], storeType: "건어물·반찬", subCategory: "건어물•반찬" });
    const sameAisle = storeItemTerms({ items: ["이바지음식", "부침개"], storeType: "이바지음식·부침개", subCategory: "건어물•반찬" });
    expect(itemMatchScore(["건어물"], real).score).toBeGreaterThan(itemMatchScore(["건어물"], sameAisle).score);
  });

  it("부정된 품목은 itemTerms에도 남지 않는다 ('여성복 싫고 남성복')", async () => {
    const messages: ChatMessage[] = [INTERVIEW_GREETING, { role: "user", text: "여성복 싫고 남성복 살 거예요" }];
    const p = buildRuleProfile({ mode: "chat", messages, keywords: [] });
    expect(p.profile.itemTerms).toContain("남성복");
    expect(p.profile.itemTerms).not.toContain("여성복");
  });

  it("'여성복 싫고 남성복' → 남성복 가게가 1위가 된다 (품목 일치가 부정을 따라간다)", async () => {
    const stores = await getStores();
    const inputs = stores.map((s) => ({
      id: s.id, taste: s.features.taste, market: s.features.market, exposure: s.features.exposure,
      recommendable: s.features.recommendable, productHints: s.features.productHints, itemTerms: storeItemTerms(s),
    }));
    const byId = new Map(stores.map((s) => [s.id, s]));
    const messages: ChatMessage[] = [INTERVIEW_GREETING, { role: "user", text: "여성복 싫고 남성복 살 거예요" }];
    const p = buildRuleProfile({ mode: "chat", messages, keywords: [] });
    const best = rankStores({ taste: p.profile.categories, recent: p.focus, itemTerms: p.profile.itemTerms }, inputs)[0]!;
    expect(byId.get(best.storeId)!.subCategory).toMatch(/남성복/);
  });

  it("'운동화'를 입력하면 옷 가게가 아니라 신발 가게가 1위가 된다", async () => {
    const stores = await getStores();
    const inputs = stores.map((s) => ({
      id: s.id, taste: s.features.taste, market: s.features.market, exposure: s.features.exposure,
      recommendable: s.features.recommendable, productHints: s.features.productHints, itemTerms: storeItemTerms(s),
    }));
    const profile = buildRuleProfile({ mode: "keywords", messages: [], keywords: ["운동화"] });
    const best = rankStores({ taste: profile.profile.categories, recent: profile.focus, itemTerms: profile.profile.itemTerms }, inputs)[0]!;
    const store = stores.find((s) => s.id === best.storeId)!;
    expect(`${store.storeType} ${store.items.join(" ")}`).toMatch(/신발|운동화|제화/);
  });
});

describe("부정 표현", () => {
  it("부정한 항목만 빼고 나머지는 남긴다", () => {
    const m = matchSentence("캠핑은 별로고 커피가 좋아요");
    expect(m.matchedWords).toContain("커피");
    expect(m.matchedWords).not.toContain("캠핑");
  });

  it("'안 좋아해요'·'빼고'·'말고'를 모두 처리한다", () => {
    expect(matchSentence("전통적인 건 안 좋아해요, 캠핑용품 보고 있어요").matchedWords).not.toContain("전통");
    expect(matchKeyword("캠핑 빼고").matchedWords).not.toContain("캠핑");
    const m = matchKeyword("전통 말고 커피");
    expect(m.matchedWords).toContain("커피");
    expect(m.matchedWords).not.toContain("전통");
  });

  it("부정한 취향은 프로필 상위에 올라오지 않는다", () => {
    const messages: ChatMessage[] = [INTERVIEW_GREETING, { role: "user", text: "캠핑은 별로고 커피가 좋아요" }];
    const p = buildRuleProfile({ mode: "chat", messages, keywords: [] });
    expect(top(p.profile.categories)).toContain("coffee");
    expect(p.profile.categories.camping).toBeLessThan(0.3);
  });
});

describe("유동적인 인터뷰 질문", () => {
  it("목적에 따라 질문 순서가 달라진다", () => {
    const gift = slotOrderFor(extractSlots([INTERVIEW_GREETING, { role: "user", text: "친구 생일 선물 찾고 있어요" }]));
    const food = slotOrderFor(extractSlots([INTERVIEW_GREETING, { role: "user", text: "시장 먹거리 구경하려고요" }]));
    expect(gift).not.toEqual(food);
    expect(food.indexOf("taste")).toBeLessThan(food.indexOf("budget"));
  });

  it("답변 문장을 짧은 명사구로 다듬어 질문에 넣는다", () => {
    expect(shortLookingFor("운동화 하나 사려고요")).toBe("운동화");
    expect(shortLookingFor("친구 생일 선물 찾고 있어요")).toBe("친구 생일 선물");
    const slots = extractSlots([INTERVIEW_GREETING, { role: "user", text: "운동화 하나 사려고요" }]);
    expect(questionFor("budget", slots, 0).text).toContain("운동화");
  });

  it("같은 대화에서는 같은 질문이, 다른 대화에서는 다른 표현이 나올 수 있다", () => {
    const msgs: ChatMessage[] = [INTERVIEW_GREETING, { role: "user", text: "이불 보려고요" }];
    expect(ruleInterviewTurn(msgs).reply).toBe(ruleInterviewTurn(msgs).reply);
    const variants = new Set(
      ["이불", "그릇", "커피", "빈티지 소품", "캠핑 의자"].map(
        (t) => ruleInterviewTurn([INTERVIEW_GREETING, { role: "user", text: `${t} 보려고요` }]).reply,
      ),
    );
    expect(variants.size).toBeGreaterThan(1);
  });
});

describe("일반화 확인 (특정 예시에만 맞춘 것이 아님)", () => {
  const NEG_CASES: [string, string, string][] = [
    ["여성복 싫고 남성복 살 거예요", "여성복", "남성복"],
    ["커피 말고 전통차 마시고 싶어요", "커피", "전통차"],
    ["이불은 필요 없고 커튼 보려고요", "이불", "커튼"],
    ["신발은 안 살 거고 가방 보려고요", "신발", "가방"],
    ["떡은 별로예요. 빵 사려고요", "떡", "빵"],
    ["정육점 빼고 건어물 가게요", "정육", "건어물"],
    ["한복은 관심 없어요, 캠핑용품 보여주세요", "한복", "캠핑"],
    ["시계는 안 보고 반지 볼래요", "시계", "반지"],
    ["주방용품 말고 침구 사려고요", "주방", "침구"],
  ];

  it.each(NEG_CASES)("부정된 품목은 빠지고 원하는 품목은 남는다: %s", (text, dropped, kept) => {
    const p = buildRuleProfile({ mode: "chat", messages: [INTERVIEW_GREETING, { role: "user", text }], keywords: [] });
    expect(p.profile.itemTerms.some((t) => t.includes(dropped))).toBe(false);
    expect(p.profile.itemTerms.some((t) => t.includes(kept))).toBe(true);
  });

  const PLAIN: string[] = ["안경 사려고요", "가방 안에 넣을 파우치요", "시장 안쪽 정육점 찾아요", "커피랑 빵 먹고 싶어요"];
  it.each(PLAIN)("부정이 없는 문장은 품목이 그대로 남는다: %s", (text) => {
    const p = buildRuleProfile({ mode: "chat", messages: [INTERVIEW_GREETING, { role: "user", text }], keywords: [] });
    expect(p.profile.itemTerms.length).toBeGreaterThan(0);
  });

  it("질문 순서가 목적에 따라 여러 갈래로 갈린다", () => {
    const inputs = [
      "친구 생일 선물 찾고 있어요", "시장 먹거리 구경하려고요", "운동화 하나 사려고요", "캠핑 용품 보러 왔어요",
      "이불이랑 커튼 사려고요", "한복 맞추려고요", "주방용품 보려고요", "그냥 구경하려고요", "부모님 드릴 거 찾아요",
    ];
    const orders = new Set(
      inputs.map((t) => slotOrderFor(extractSlots([INTERVIEW_GREETING, { role: "user", text: t }])).join(">")),
    );
    // 선물/먹거리 두 갈래에 그치지 않고 여러 목적별로 나뉘어야 합니다.
    expect(orders.size).toBeGreaterThanOrEqual(5);
  });

  it("첫 질문이 상황별로 달라진다", () => {
    const firsts = new Set(
      ["친구 생일 선물 찾고 있어요", "시장 먹거리 구경하려고요", "한복 맞추려고요", "그냥 구경하려고요", "주방용품 보려고요"].map(
        (t) => ruleInterviewTurn([INTERVIEW_GREETING, { role: "user", text: t }]).slot,
      ),
    );
    expect(firsts.size).toBeGreaterThanOrEqual(4);
  });
});

describe("세부 품목 추출 (데이터 전수 점검)", () => {
  const ITEMS = ["남성복", "여성복", "속옷", "양말", "내의", "잡화", "포목", "캐주얼", "천", "한복", "건어물", "정육", "운동화", "이불", "커튼", "시계", "반찬", "떡", "폐백", "옷감"];

  it.each(ITEMS)("'%s'라고 말하면 그 품목을 실제로 파는 점포가 1위가 된다", async (item) => {
    const stores = await getStores();
    const inputs = stores.map((s) => ({
      id: s.id, taste: s.features.taste, market: s.features.market, exposure: s.features.exposure,
      recommendable: s.features.recommendable, productHints: s.features.productHints, itemTerms: storeItemTerms(s),
    }));
    const byId = new Map(stores.map((s) => [s.id, s]));
    const messages: ChatMessage[] = [INTERVIEW_GREETING, { role: "user", text: `${item} 사려고요` }];
    const p = buildRuleProfile({ mode: "chat", messages, keywords: [] });
    const best = byId.get(rankStores({ taste: p.profile.categories, recent: p.focus, itemTerms: p.profile.itemTerms }, inputs)[0]!.storeId)!;
    expect(`${best.items.join(" ")} ${best.storeType} ${best.subCategory}`).toContain(item);
  });

  it("어미를 떼다가 품목명을 자르지 않는다", () => {
    const p = buildRuleProfile({ mode: "chat", messages: [INTERVIEW_GREETING, { role: "user", text: "내의랑 한과 사려고요" }], keywords: [] });
    expect(p.profile.itemTerms).toContain("내의");
    expect(p.profile.itemTerms).toContain("한과");
  });

  it("품목을 말하지 않으면 품목 가산점이 0이라 기존 추천이 유지된다", async () => {
    const stores = await getStores();
    const inputs = stores.map((s) => ({
      id: s.id, taste: s.features.taste, market: s.features.market, exposure: s.features.exposure,
      recommendable: s.features.recommendable, productHints: s.features.productHints, itemTerms: storeItemTerms(s),
    }));
    const p = buildRuleProfile({ mode: "keywords", messages: [], keywords: ["캠핑"] });
    const withTerms = rankStores({ taste: p.profile.categories, recent: p.focus, itemTerms: [] }, inputs).slice(0, 3);
    expect(withTerms.every((s) => s.components.item_match === 0)).toBe(true);
  });
});

describe("옷: 남성/여성 질문", () => {
  const first = (text: string) => ruleInterviewTurn([INTERVIEW_GREETING, { role: "user", text }]);

  it.each(["옷 사려고요", "바지 하나 사려고요", "겨울 코트 찾아요", "셔츠 사려고요", "원피스 보려고요", "의류 보려고요", "엄마랑 옷 보러 왔어요"])(
    "옷을 찾는데 성별을 말하지 않으면 바로 물어본다: %s",
    (text) => expect(first(text).slot).toBe("apparel_for"),
  );

  it.each([
    ["남자 옷 사려고요", "men"],
    ["여성 옷 보려고요", "women"],
    ["남성복 볼래요", "men"],
    ["여성복 싫고 남성복이요", "men"],
    ["엄마 드릴 옷 찾아요", "women"],
    ["남편 생일 선물로 셔츠요", "men"],
    ["여자친구 선물로 원피스요", "women"],
  ] as const)("성별을 이미 말했으면 다시 묻지 않는다: %s", (text, expected) => {
    expect(first(text).slot).not.toBe("apparel_for");
    expect(extractSlots([INTERVIEW_GREETING, { role: "user", text }]).apparelFor).toBe(expected);
  });

  it.each(["운동화 사려고요", "시계 보려고요", "옷감 사려고요", "옷걸이 필요해요", "옷은 말고 가방 보려고요", "한복 맞추려고요"])(
    "옷이 아니면 묻지 않는다: %s",
    (text) => expect(first(text).slot).not.toBe("apparel_for"),
  );

  it.each([
    ["남성 옷", "men", "남성복"],
    ["여자꺼요", "women", "여성복"],
    ["아빠 거요", "men", "남성복"],
    ["딸 거예요", "women", "여성복"],
  ] as const)("답변(%s)을 해석해 해당 옷 가게가 1위가 된다", async (answer, expected, sub) => {
    const stores = await getStores();
    const inputs = stores.map((s) => ({
      id: s.id, taste: s.features.taste, market: s.features.market, exposure: s.features.exposure,
      recommendable: s.features.recommendable, productHints: s.features.productHints, itemTerms: storeItemTerms(s),
    }));
    const byId = new Map(stores.map((s) => [s.id, s]));
    const messages: ChatMessage[] = [INTERVIEW_GREETING, { role: "user", text: "옷 사려고요" }];
    const q = ruleInterviewTurn(messages);
    messages.push({ role: "assistant", text: q.reply, slot: q.slot }, { role: "user", text: answer });
    const p = buildRuleProfile({ mode: "chat", messages, keywords: [] });
    expect(p.profile.apparelFor).toBe(expected);
    const best = rankStores({ taste: p.profile.categories, recent: p.focus, itemTerms: p.profile.itemTerms }, inputs)[0]!;
    expect(byId.get(best.storeId)!.subCategory).toBe(sub);
    // 한 번 답했으면 같은 질문을 다시 하지 않습니다.
    expect(ruleInterviewTurn(messages).slot).not.toBe("apparel_for");
  });

  it("'둘 다'·'모르겠어요'는 남녀 옷을 모두 품목으로 넣는다", () => {
    for (const answer of ["둘 다 볼래요", "잘 모르겠어요"]) {
      const messages: ChatMessage[] = [INTERVIEW_GREETING, { role: "user", text: "옷 사려고요" }];
      const q = ruleInterviewTurn(messages);
      messages.push({ role: "assistant", text: q.reply, slot: q.slot }, { role: "user", text: answer });
      const p = buildRuleProfile({ mode: "chat", messages, keywords: [] });
      expect(p.profile.itemTerms).toEqual(expect.arrayContaining(["남성복", "여성복"]));
    }
  });
});
