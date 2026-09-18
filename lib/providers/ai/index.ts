import "server-only";
import { sanitizePromo } from "@/lib/merchant/promo";
import { BuiltinChatProvider } from "./BuiltinChatProvider";
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

export type { AIProvider, InterviewInput, MerchantPromoInput, PreferenceInput, StoreDescriptionInput } from "./types";
export { BuiltinChatProvider } from "./BuiltinChatProvider";

/**
 * 이 서비스의 AI는 **내장 챗봇 엔진 하나**입니다.
 * 외부 AI API(Gemini 등)를 호출하지 않으므로 API 키·요금·장애·네트워크 대기 시간이 없고,
 * 같은 입력이면 항상 같은 결과가 나옵니다(데모·발표에서 재현 가능).
 */
export const AI_ENGINE = {
  id: "builtin",
  label: "MarketFit 챗봇 엔진",
  detail: "서비스 안에서 도는 규칙·사전 기반 자연어 해석 (외부 AI API 호출 없음)",
} as const;

let engine: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  engine ??= new BuiltinChatProvider();
  return engine;
}

export function interviewTurn(input: InterviewInput): Promise<InterviewDraft> {
  return getAIProvider().interviewTurn(input);
}

export function analyzePreferences(input: PreferenceInput): Promise<PreferenceDraft> {
  return getAIProvider().analyzePreferences(input);
}

export function describeStores(stores: StoreDescriptionInput[]): Promise<Record<string, string>> {
  return getAIProvider().describeStores(stores);
}

/** 홍보 아이디어 — 원본 품목에 없는 내용은 '아이디어'로 표시되도록 한 번 더 걸러 냅니다. */
export async function generateMerchantPromo(input: MerchantPromoInput): Promise<MerchantPromoDraft> {
  const draft = await getAIProvider().generateMerchantPromo(input);
  return sanitizePromo(draft, input.store?.confirmedItems ?? []);
}
