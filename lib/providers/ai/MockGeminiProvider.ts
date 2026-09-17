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
  ReasonInput,
  StoreDescriptionInput,
} from "./types";

/**
 * Gemini 없이 동작하는 규칙 기반 AI (데모·장애 대비 fallback)
 * - 인터뷰: 아직 답하지 않은 항목을 순서대로 짧게 질문
 * - 취향 분석: 키워드 사전·상황 정보 규칙으로 UserPreferenceProfile 생성
 * - 홍보 도우미: 집계 데이터와 원본 품목만 쓰는 템플릿
 */
export class MockGeminiProvider implements AIProvider {
  readonly name = "mock" as const;
  readonly model = null;

  async interviewTurn(input: InterviewInput): Promise<InterviewDraft> {
    const turn = ruleInterviewTurn(input.messages);
    return { reply: turn.reply, slot: turn.slot, done: turn.done, suggestions: turn.suggestions, extracted: {} };
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

  async generateReasons(_input: ReasonInput): Promise<Record<string, string>> {
    // Mock 모드에서는 서버가 템플릿 이유를 사용합니다.
    return {};
  }

  async describeStores(stores: StoreDescriptionInput[]): Promise<Record<string, string>> {
    return Object.fromEntries(stores.map((s) => [s.id, templateStoreDescription(s)]));
  }

  async generateMerchantPromo(input: MerchantPromoInput): Promise<MerchantPromoDraft> {
    return templatePromo(input);
  }
}
