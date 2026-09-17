import "server-only";
import { DEFAULT_GEMINI_MODEL } from "@/lib/config/integrations";
import { parseAmounts } from "@/lib/preferences/extract";
import { applySouvenirExpansion, buildRuleProfile } from "@/lib/preferences/profile";
import {
  buildInterviewPrompt,
  buildMerchantPromoPrompt,
  buildPreferencePrompt,
  buildReasonsPrompt,
  buildStoreDescriptionPrompt,
  INTERVIEW_SYSTEM_PROMPT,
  MERCHANT_PROMO_SYSTEM_PROMPT,
  PREFERENCE_SYSTEM_PROMPT,
  REASONS_SYSTEM_PROMPT,
  STORE_DESCRIPTION_SYSTEM_PROMPT,
} from "./prompts";
import {
  blendVectors,
  INTERVIEW_RESPONSE_SCHEMA,
  InvalidAIResponseError,
  MERCHANT_PROMO_RESPONSE_SCHEMA,
  parseInterviewResponse,
  parsePreferenceResponse,
  parsePromoResponse,
  parseReasonsResponse,
  parseStoreDescriptionsResponse,
  PREFERENCE_RESPONSE_SCHEMA,
  REASONS_RESPONSE_SCHEMA,
  STORE_DESCRIPTIONS_RESPONSE_SCHEMA,
} from "./schemas";
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

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const FALLBACK_MODELS = [DEFAULT_GEMINI_MODEL, "gemini-2.5-flash"];

type GenerateResult = { json: unknown; model: string };

/**
 * Gemini API (generateContent + 구조화 JSON 출력)
 * - API 키는 서버에서만 사용하며 x-goog-api-key 헤더로 전달합니다.
 * - Gemini는 취향 해석·질문·설명 문장만 담당하고, 추천 점수와 순위는 계산하지 않습니다.
 * - 모든 응답은 schemas.ts의 Zod 스키마로 검증합니다.
 */
export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  private resolvedModel: string;

  constructor(
    private readonly apiKey: string,
    model: string,
    private readonly timeoutMs = 25_000,
  ) {
    this.resolvedModel = model;
  }

  get model() {
    return this.resolvedModel;
  }

  async interviewTurn(input: InterviewInput): Promise<InterviewDraft> {
    const { json } = await this.generate({
      system: INTERVIEW_SYSTEM_PROMPT,
      prompt: buildInterviewPrompt(input),
      schema: INTERVIEW_RESPONSE_SCHEMA,
      temperature: 0.4,
      timeoutMs: 15_000,
    });
    return parseInterviewResponse(json);
  }

  async analyzePreferences(input: PreferenceInput): Promise<PreferenceDraft> {
    const { json } = await this.generate({
      system: PREFERENCE_SYSTEM_PROMPT,
      prompt: buildPreferencePrompt(input),
      schema: PREFERENCE_RESPONSE_SCHEMA,
      temperature: 0.3,
    });
    const userText = input.mode === "keywords" ? "" : input.messages.filter((m) => m.role === "user").map((m) => m.text).join(" ");
    const draft = parsePreferenceResponse(json, input.mode === "chat" ? [] : input.keywords, {
      hasBudgetMention: parseAmounts(userText).length > 0,
    });

    // 규칙 기반 결과를 25% 섞어 과도한 추정을 완화하고, 사용자가 적은 숫자(예산)는 규칙 파싱 값을 우선합니다.
    const rule = buildRuleProfile({ mode: input.mode, messages: input.messages, keywords: input.keywords });
    const known = rule.slots;
    return {
      ...draft,
      profile: {
        ...draft.profile,
        // 규칙으로 해석할 신호가 없던 입력은 Gemini 결과만 사용합니다.
        categories: applySouvenirExpansion(rule.empty ? draft.profile.categories : blendVectors(draft.profile.categories, rule.profile.categories)),
        budget: known.budget ?? draft.profile.budget,
        lookingFor: draft.profile.lookingFor ?? known.lookingFor,
        intent: draft.profile.intent ?? known.intent,
        intentLabel: draft.profile.intentLabel ?? known.intentLabel,
        companion: draft.profile.companion ?? known.companion,
        occasion: draft.profile.occasion ?? known.occasion,
        preferredStyle: draft.profile.preferredStyle.length ? draft.profile.preferredStyle : known.preferredStyle,
        discoveryPreference: draft.profile.discoveryPreference ?? known.discoveryPreference,
      },
      focus: rule.empty ? draft.focus : blendVectors(draft.focus, rule.focus),
      keywordInsights: draft.keywordInsights.length ? draft.keywordInsights : rule.keywordInsights,
    };
  }

  async generateReasons(input: ReasonInput): Promise<Record<string, string>> {
    if (input.stores.length === 0) return {};
    const { json } = await this.generate({
      system: REASONS_SYSTEM_PROMPT,
      prompt: buildReasonsPrompt(input),
      schema: REASONS_RESPONSE_SCHEMA,
      temperature: 0.5,
    });
    return parseReasonsResponse(
      json,
      input.stores.map((s) => s.id),
    );
  }

  /** 점포 소개 (20곳씩 나눠 요청) */
  async describeStores(stores: StoreDescriptionInput[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (let i = 0; i < stores.length; i += 20) {
      const batch = stores.slice(i, i + 20);
      const { json } = await this.generate({
        system: STORE_DESCRIPTION_SYSTEM_PROMPT,
        prompt: buildStoreDescriptionPrompt(batch),
        schema: STORE_DESCRIPTIONS_RESPONSE_SCHEMA,
        temperature: 0.4,
      });
      Object.assign(
        out,
        parseStoreDescriptionsResponse(
          json,
          batch.map((s) => s.id),
        ),
      );
    }
    return out;
  }

  async generateMerchantPromo(input: MerchantPromoInput): Promise<MerchantPromoDraft> {
    const { json } = await this.generate({
      system: MERCHANT_PROMO_SYSTEM_PROMPT,
      prompt: buildMerchantPromoPrompt(input),
      schema: MERCHANT_PROMO_RESPONSE_SCHEMA,
      temperature: 0.7,
    });
    return parsePromoResponse(json);
  }

  private async generate(args: { system: string; prompt: string; schema: object; temperature: number; timeoutMs?: number }): Promise<GenerateResult> {
    const candidates = [...new Set([this.resolvedModel, ...FALLBACK_MODELS])];
    let lastError: unknown = null;
    for (const model of candidates) {
      try {
        const json = await this.callModel(model, args);
        this.resolvedModel = model;
        return { json, model };
      } catch (err) {
        lastError = err;
        // 모델이 없을 때만 다음 후보 모델로 재시도합니다.
        if (err instanceof AIProviderError && err.kind === "not_found") continue;
        throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new AIProviderError("사용 가능한 Gemini 모델이 없습니다.", "not_found");
  }

  private async callModel(
    model: string,
    args: { system: string; prompt: string; schema: object; temperature: number; timeoutMs?: number },
  ): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: args.system }] },
          contents: [{ role: "user", parts: [{ text: args.prompt }] }],
          generationConfig: {
            temperature: args.temperature,
            responseMimeType: "application/json",
            responseSchema: args.schema,
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(args.timeoutMs ?? this.timeoutMs),
      });
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new AIProviderError(isTimeout ? "Gemini 응답 시간이 초과되었습니다." : "Gemini API에 연결할 수 없습니다.", isTimeout ? "timeout" : "upstream");
    }

    if (!res.ok) throw await toProviderError(res);

    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    if (body.promptFeedback?.blockReason) {
      throw new AIProviderError(`요청이 차단되었습니다 (${body.promptFeedback.blockReason}).`, "invalid_response");
    }
    const text = body.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) throw new AIProviderError("Gemini 응답이 비어 있습니다.", "invalid_response");
    try {
      return JSON.parse(stripCodeFence(text));
    } catch {
      throw new InvalidAIResponseError("Gemini 응답이 JSON이 아닙니다.");
    }
  }
}

function stripCodeFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
}

export async function toProviderError(res: Response): Promise<AIProviderError> {
  let message = `Gemini API 오류 (HTTP ${res.status})`;
  let reason = "";
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string; details?: { reason?: string }[] } };
    reason = body.error?.details?.find((d) => d.reason)?.reason ?? body.error?.status ?? "";
    if (body.error?.message) message = body.error.message;
  } catch {
    // ignore
  }
  if (res.status === 404) return new AIProviderError(`모델을 찾을 수 없습니다: ${message}`, "not_found", 404);
  if (res.status === 429) return new AIProviderError("Gemini 사용량 한도를 초과했습니다.", "quota", 429);
  if (res.status === 401 || res.status === 403 || reason === "API_KEY_INVALID") {
    return new AIProviderError("Gemini API 키가 유효하지 않거나 권한이 없습니다.", "auth", res.status);
  }
  if (res.status === 400 && /api key/i.test(message)) {
    return new AIProviderError("Gemini API 키가 유효하지 않습니다.", "auth", res.status);
  }
  return new AIProviderError(message, "upstream", res.status);
}

/** 관리자 연결 테스트: 모델 목록 조회 */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/models?pageSize=200`, {
    headers: { "x-goog-api-key": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw await toProviderError(res);
  const body = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (body.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((name) => name.includes("flash") || name.includes("pro"))
    .sort();
}
