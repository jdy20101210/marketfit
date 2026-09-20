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
