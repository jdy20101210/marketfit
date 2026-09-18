import { templatePromo } from "@/lib/merchant/promo";
import { ruleInterviewTurn } from "@/lib/preferences/extract";
import { buildRuleProfile } from "@/lib/preferences/profile";
import { templateStoreDescription } from "@/lib/stores/description";
import type {
  AIProvider,
  InterviewDraft,
  InterviewInput,
  MerchantPromoDraft,
  MerchantPromoInput,
  PreferenceDraft,
  PreferenceInput,
  StoreDescriptionInput,
} from "./types";

/**
 * MarketFit 내장 챗봇 엔진 — 외부 AI API(Gemini 등)를 호출하지 않고 서비스 안에서 동작합니다.
 * - 인터뷰: 아직 듣지 못한 항목만 골라 짧게 질문하고, 충분히 들으면 스스로 마칩니다.
 * - 취향 분석: 키워드 사전·문장 규칙으로 UserPreferenceProfile(19차원 vector + 상황 정보)을 만듭니다.
 * - 홍보 도우미: 집계 데이터와 엑셀 원본 품목만 사용하는 템플릿 (없는 상품을 지어내지 않음)
 *
 * 네트워크 호출이 없으므로 키 설정·요금·장애와 무관하게 항상 같은 결과를 냅니다.
 */
export class BuiltinChatProvider implements AIProvider {
  readonly name = "builtin" as const;

  async interviewTurn(input: InterviewInput): Promise<InterviewDraft> {
    const turn = ruleInterviewTurn(input.messages);
    return { reply: turn.reply, slot: turn.slot, done: turn.done, suggestions: turn.suggestions };
  }

  async analyzePreferences(input: PreferenceInput): Promise<PreferenceDraft> {
    const rule = buildRuleProfile({ mode: input.mode, messages: input.messages, keywords: input.keywords });
    return {
      profile: rule.profile,
      focus: rule.focus,
      personaLabel: rule.personaLabel,
      topCategories: rule.topCategories,
      keywordInsights: rule.keywordInsights,
    };
  }

  async describeStores(stores: StoreDescriptionInput[]): Promise<Record<string, string>> {
    return Object.fromEntries(stores.map((s) => [s.id, templateStoreDescription(s)]));
  }

  async generateMerchantPromo(input: MerchantPromoInput): Promise<MerchantPromoDraft> {
    return templatePromo(input);
  }
}
