import "server-only";
import { getGeminiConfig } from "@/lib/config/integrations";
import { sanitizePromo } from "@/lib/merchant/promo";
import { GeminiProvider } from "./GeminiProvider";
import { MockGeminiProvider } from "./MockGeminiProvider";
import {
  AIProviderError,
  type AIProvider,
  type InterviewDraft,
  type InterviewInput,
  type MerchantPromoDraft,
  type MerchantPromoInput,
  type PreferenceDraft,
  type PreferenceInput,
  type ReasonInput,
  type StoreDescriptionInput,
} from "./types";

export type { AIProvider, InterviewInput, MerchantPromoInput, PreferenceInput, ReasonInput, StoreDescriptionInput } from "./types";
export { MockGeminiProvider } from "./MockGeminiProvider";
export { GeminiProvider, listGeminiModels } from "./GeminiProvider";

/** 우선순위: Gemini(키 설정 시) → Mock */
export async function getAIProvider(): Promise<AIProvider> {
  const config = await getGeminiConfig();
  return config ? new GeminiProvider(config.apiKey, config.model) : new MockGeminiProvider();
}

export interface WithFallback<T> {
  result: T;
  provider: "gemini" | "mock";
  model: string | null;
  fallbackReason: string | null;
}

export function describeError(err: unknown): string {
  if (err instanceof AIProviderError) return err.message;
  if (err instanceof Error) return err.message;
  return "알 수 없는 오류";
}

/** Gemini 호출이 실패하면 MockGeminiProvider 결과로 대체합니다(서비스가 멈추지 않도록). */
async function withFallback<T>(task: string, run: (p: AIProvider) => Promise<T>): Promise<WithFallback<T>> {
  const provider = await getAIProvider();
  if (provider.name === "gemini") {
    try {
      const result = await run(provider);
      return { result, provider: "gemini", model: provider.model, fallbackReason: null };
    } catch (err) {
      const reason = describeError(err);
      console.warn(`[ai] Gemini ${task} 실패 → Mock 사용:`, reason);
      return { result: await run(new MockGeminiProvider()), provider: "mock", model: null, fallbackReason: reason };
    }
  }
  return { result: await run(provider), provider: "mock", model: null, fallbackReason: null };
}

export function interviewWithFallback(input: InterviewInput): Promise<WithFallback<InterviewDraft>> {
  return withFallback("인터뷰", (p) => p.interviewTurn(input));
}

export function analyzePreferencesWithFallback(input: PreferenceInput): Promise<WithFallback<PreferenceDraft>> {
  return withFallback("취향 분석", (p) => p.analyzePreferences(input));
}

export async function generateMerchantPromoWithFallback(input: MerchantPromoInput): Promise<WithFallback<MerchantPromoDraft>> {
  const res = await withFallback("홍보 아이디어 생성", (p) => p.generateMerchantPromo(input));
  return { ...res, result: sanitizePromo(res.result, input.store?.confirmedItems ?? []) };
}

export async function generateReasonsWithFallback(input: ReasonInput): Promise<WithFallback<Record<string, string>>> {
  const provider = await getAIProvider();
  if (provider.name !== "gemini") return { result: {}, provider: "mock", model: null, fallbackReason: null };
  try {
    const result = await provider.generateReasons(input);
    return { result, provider: "gemini", model: provider.model, fallbackReason: null };
  } catch (err) {
    console.warn("[ai] Gemini 추천 이유 생성 실패 → 템플릿 사용:", describeError(err));
    return { result: {}, provider: "mock", model: null, fallbackReason: describeError(err) };
  }
}

/** 점포 소개: Gemini가 쓴 문장을 우선 쓰고, 빠진 점포·실패 시 원본 데이터 기반 템플릿으로 채웁니다. */
export async function describeStoresWithFallback(
  stores: StoreDescriptionInput[],
): Promise<WithFallback<Record<string, { text: string; provider: "gemini" | "template" }>>> {
  const template = await new MockGeminiProvider().describeStores(stores);
  const provider = await getAIProvider();
  let generated: Record<string, string> = {};
  let fallbackReason: string | null = null;
  if (provider.name === "gemini") {
    try {
      generated = await provider.describeStores(stores);
    } catch (err) {
      fallbackReason = describeError(err);
      console.warn("[ai] Gemini 점포 소개 생성 실패 → 템플릿 사용:", fallbackReason);
    }
  }
  const result = Object.fromEntries(
    stores.map((s) => [
      s.id,
      generated[s.id] ? { text: generated[s.id]!, provider: "gemini" as const } : { text: template[s.id]!, provider: "template" as const },
    ]),
  );
  const usedGemini = Object.keys(generated).length > 0;
  return { result, provider: usedGemini ? "gemini" : "mock", model: usedGemini ? provider.model : null, fallbackReason };
}
