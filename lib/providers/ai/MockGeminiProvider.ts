import { TASTE_META, topTastes, type TasteKey } from "@/lib/recommendation/dimensions";
import { matchKeyword, vectorFromKeywords } from "@/lib/recommendation/keywords";
import { templateStoreDescription } from "@/lib/stores/description";
import type { AIProvider, ProfileAnalysis, ProfileAnalysisInput, ReasonInput, StoreDescriptionInput } from "./types";

const PERSONA_NAMES: Partial<Record<TasteKey, string>> = {
  camping: "감성 캠퍼형",
  coffee: "커피 탐험가형",
  dessert: "디저트 헌터형",
  food: "시장 미식가형",
  traditional: "전통 로컬형",
  local: "원도심 탐방형",
  gift: "선물 큐레이터형",
  accessory: "소품 수집가형",
  fashion: "시장 패셔니스타형",
  family: "알뜰 살림형",
  kitchen: "홈쿡 살림형",
  living: "공간 꾸미기형",
  vintage: "빈티지 감성형",
  craft: "핸드메이드 메이커형",
  travel: "여행 기록가형",
  date: "나들이 데이트형",
  practical: "실속 쇼핑형",
};

/**
 * Gemini 없이 동작하는 규칙 기반 분석기 (데모/장애 대비 fallback)
 * 키워드 사전(lib/recommendation/keywords.ts)으로 취향 vector를 만듭니다.
 */
export class MockGeminiProvider implements AIProvider {
  readonly name = "mock" as const;
  readonly model = null;

  async analyzeProfile(input: ProfileAnalysisInput): Promise<ProfileAnalysis> {
    const igItems = input.instagram?.interests ?? [];
    const directItems = input.items.map((keyword) => ({ keyword, score: 0.85 }));
    const { vector: tasteVector } = vectorFromKeywords([...igItems, ...directItems]);
    const recentVector = directItems.length ? vectorFromKeywords(directItems).vector : { ...tasteVector };

    const top = topTastes(tasteVector, 6, 0.3);
    const evidenceFor = (key: TasteKey) => {
      const sources = [...igItems.map((i) => i.keyword), ...input.items].filter((k) => (matchKeyword(k).weights[key] ?? 0) >= 0.5);
      return sources.length ? `입력 키워드: ${sources.slice(0, 3).join(", ")}` : "";
    };
    const first = top[0]?.key;
    const labels = top.slice(0, 3).map((t) => TASTE_META[t.key].label);

    return {
      personaLabel: (first && PERSONA_NAMES[first]) || "시장 탐색형",
      summary: labels.length
        ? `${labels.join("·")}에 관심이 많아요. 이 취향에 맞는 중앙시장 점포를 찾아볼게요.`
        : "아직 뚜렷한 취향 신호가 적어요. 중앙시장을 폭넓게 둘러보는 추천을 준비할게요.",
      tasteVector,
      recentVector,
      topCategories: top.map((t) => ({ ...t, evidence: evidenceFor(t.key) })),
      itemInsights: input.items.map((item) => {
        const m = matchKeyword(item);
        const keys = (Object.entries(m.weights) as [TasteKey, number][])
          .filter(([, w]) => w >= 0.5)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k]) => k);
        return {
          input: item,
          keys,
          note: m.mapped
            ? `${keys.map((k) => TASTE_META[k].label).join("·")} 관심으로 해석했어요.`
            : "사전에 없는 상품이라 실용·시장 탐색 관심으로 약하게 반영했어요.",
        };
      }),
    };
  }

  async generateReasons(_input: ReasonInput): Promise<Record<string, string>> {
    // Mock 모드에서는 서버가 템플릿 이유를 사용합니다.
    return {};
  }

  async describeStores(stores: StoreDescriptionInput[]): Promise<Record<string, string>> {
    return Object.fromEntries(stores.map((s) => [s.id, templateStoreDescription(s)]));
  }
}
