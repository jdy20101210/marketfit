import "server-only";
import { getGeminiConfig } from "@/lib/config/integrations";
import { GeminiProvider } from "./GeminiProvider";
import { MockGeminiProvider } from "./MockGeminiProvider";
import { AIProviderError, type AIProvider, type ProfileAnalysis, type ProfileAnalysisInput, type ReasonInput, type StoreDescriptionInput } from "./types";

export type { AIProvider, ProfileAnalysis, ProfileAnalysisInput, ReasonInput, StoreDescriptionInput } from "./types";
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

function describe(err: unknown): string {
  if (err instanceof AIProviderError) return err.message;
  if (err instanceof Error) return err.message;
  return "알 수 없는 오류";
}

/** Gemini 호출 실패 시 Mock 결과로 대체합니다(데모가 멈추지 않도록). */
export async function analyzeProfileWithFallback(input: ProfileAnalysisInput): Promise<WithFallback<ProfileAnalysis>> {
  const provider = await getAIProvider();
  if (provider.name === "gemini") {
    try {
      const result = await provider.analyzeProfile(input);
      return { result, provider: "gemini", model: provider.model, fallbackReason: null };
    } catch (err) {
      console.warn("[ai] Gemini 취향 분석 실패 → Mock 사용:", describe(err));
      const result = await new MockGeminiProvider().analyzeProfile(input);
      return { result, provider: "mock", model: null, fallbackReason: describe(err) };
    }
  }
  const result = await provider.analyzeProfile(input);
  return { result, provider: "mock", model: null, fallbackReason: null };
}

export async function generateReasonsWithFallback(input: ReasonInput): Promise<WithFallback<Record<string, string>>> {
  const provider = await getAIProvider();
  if (provider.name !== "gemini") return { result: {}, provider: "mock", model: null, fallbackReason: null };
  try {
    const result = await provider.generateReasons(input);
    return { result, provider: "gemini", model: provider.model, fallbackReason: null };
  } catch (err) {
    console.warn("[ai] Gemini 추천 이유 생성 실패 → 템플릿 사용:", describe(err));
    return { result: {}, provider: "mock", model: null, fallbackReason: describe(err) };
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
      fallbackReason = describe(err);
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
