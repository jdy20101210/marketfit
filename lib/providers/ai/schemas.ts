import { z } from "zod";
import { clamp01, emptyVector, isTasteKey, round3, TASTE_KEYS, TASTE_META, toVector, topTastes, type TasteKey } from "@/lib/recommendation/dimensions";
import type { ProfileAnalysis } from "./types";

/**
 * Gemini 구조화 출력용 JSON schema (Gemini API Schema: OpenAPI 부분집합)
 * 서버는 이 스키마로 응답을 요청하고, 응답은 아래 Zod 스키마로 다시 검증합니다.
 */
const tasteVectorJsonSchema = {
  type: "OBJECT",
  description: "각 취향 차원의 점수(0~1). 근거가 없으면 0에 가깝게.",
  properties: Object.fromEntries(
    TASTE_KEYS.map((k) => [k, { type: "NUMBER", description: `${TASTE_META[k].label} (${TASTE_META[k].hint}), 0~1` }]),
  ),
  required: [...TASTE_KEYS],
};

const tasteKeyEnum = { type: "STRING", format: "enum", enum: [...TASTE_KEYS] };

export const PROFILE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    persona_label: { type: "STRING", description: "10자 내외 한국어 취향 별칭" },
    summary: { type: "STRING", description: "1~2문장 한국어 요약(해요체)" },
    taste_vector: tasteVectorJsonSchema,
    recent_vector: tasteVectorJsonSchema,
    top_categories: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          key: tasteKeyEnum,
          score: { type: "NUMBER" },
          evidence: { type: "STRING", description: "입력 키워드를 인용한 근거" },
        },
        required: ["key", "score", "evidence"],
      },
    },
    item_insights: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          input: { type: "STRING" },
          keys: { type: "ARRAY", items: tasteKeyEnum },
          note: { type: "STRING" },
        },
        required: ["input", "keys", "note"],
      },
    },
  },
  required: ["persona_label", "summary", "taste_vector", "recent_vector", "top_categories", "item_insights"],
  propertyOrdering: ["persona_label", "summary", "taste_vector", "recent_vector", "top_categories", "item_insights"],
} as const;

export const REASONS_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reasons: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          store_id: { type: "STRING" },
          reason: { type: "STRING" },
        },
        required: ["store_id", "reason"],
      },
    },
  },
  required: ["reasons"],
} as const;

const looseNumber = z.union([z.number(), z.string()]).transform((v) => clamp01(Number(v)));

const GeminiProfileSchema = z.object({
  persona_label: z.string().trim().min(1).max(40),
  summary: z.string().trim().min(1).max(400),
  taste_vector: z.record(z.string(), looseNumber),
  recent_vector: z.record(z.string(), looseNumber).optional(),
  top_categories: z
    .array(z.object({ key: z.string(), score: looseNumber, evidence: z.string().max(300).optional().default("") }))
    .max(12)
    .optional()
    .default([]),
  item_insights: z
    .array(z.object({ input: z.string().max(100), keys: z.array(z.string()).max(8), note: z.string().max(300).optional().default("") }))
    .max(12)
    .optional()
    .default([]),
});

export class InvalidAIResponseError extends Error {}

/** Gemini 응답 → 검증·정규화된 ProfileAnalysis. 형식이 맞지 않으면 예외. */
export function parseProfileResponse(raw: unknown, items: string[]): ProfileAnalysis {
  const parsed = GeminiProfileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidAIResponseError(`취향 분석 응답 형식 오류: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }
  const data = parsed.data;
  const tasteVector = toVector(data.taste_vector);
  const total = TASTE_KEYS.reduce((s, k) => s + tasteVector[k], 0);
  const strong = TASTE_KEYS.filter((k) => tasteVector[k] >= 0.3).length;
  if (total < 0.3 || strong === 0) throw new InvalidAIResponseError("취향 vector가 비어 있습니다.");
  if (strong > 12) throw new InvalidAIResponseError("취향 vector가 과도하게 퍼져 있습니다.");

  const recentVector = items.length > 0 && data.recent_vector ? toVector(data.recent_vector) : { ...tasteVector };

  const topFromModel = data.top_categories
    .filter((c): c is typeof c & { key: TasteKey } => isTasteKey(c.key))
    .map((c) => ({ key: c.key, score: round3(tasteVector[c.key]), evidence: c.evidence.trim().slice(0, 120) }));
  const seen = new Set<TasteKey>();
  const topCategories = [
    ...topFromModel,
    ...topTastes(tasteVector, 6, 0.3).map((t) => ({ ...t, evidence: "" })),
  ]
    .filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const itemSet = new Set(items);
  const itemInsights = data.item_insights
    .filter((i) => itemSet.has(i.input.trim()))
    .map((i) => ({
      input: i.input.trim(),
      keys: i.keys.filter(isTasteKey).slice(0, 4),
      note: i.note.trim().slice(0, 120),
    }));

  return {
    personaLabel: data.persona_label.slice(0, 20),
    summary: data.summary.slice(0, 200),
    tasteVector,
    recentVector,
    topCategories,
    itemInsights,
  };
}

const GeminiReasonsSchema = z.object({
  reasons: z.array(z.object({ store_id: z.string(), reason: z.string() })).max(40),
});

/** 사실을 새로 만들어낼 위험이 큰 표현(가격·전화번호·URL·평점)이 포함된 문장은 버립니다. */
/**
 * 확인할 수 없는 사실을 단정하는 문장은 버리고 템플릿 이유를 씁니다.
 * 가격·전화번호·URL·평점·비율, 업력(30년 전통·3대째·원조), 순위·최초·유일, 영업시간·휴무·주차 정보
 */
const RISKY_PATTERNS = [
  /\d[\d,]*\s*원/,
  /\d{2,4}-\d{3,4}-\d{4}/,
  /https?:\/\//i,
  /평점|별점|리뷰\s*\d/,
  /\d+\s*%/,
  /\d+\s*(년|대째|주년)/,
  /원조|since\s*\d|창업\s*\d|개업\s*\d/i,
  /\d+\s*위(?!치|험)|유일한|최초/,
  /영업\s*시간|휴무|정기\s*휴일|\d+\s*시\s*(부터|까지)|주차/,
];

export const STORE_DESCRIPTIONS_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    descriptions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          store_id: { type: "STRING" },
          description: { type: "STRING" },
        },
        required: ["store_id", "description"],
      },
    },
  },
  required: ["descriptions"],
} as const;

const GeminiDescriptionsSchema = z.object({
  descriptions: z.array(z.object({ store_id: z.string(), description: z.string() })).max(60),
});

/** 점포 소개 응답 검증: 허용된 점포만, 확인할 수 없는 사실을 단정하는 문장은 제외 */
export function parseStoreDescriptionsResponse(raw: unknown, allowedIds: string[]): Record<string, string> {
  const parsed = GeminiDescriptionsSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidAIResponseError("점포 소개 응답 형식 오류");
  const allowed = new Set(allowedIds);
  const out: Record<string, string> = {};
  for (const d of parsed.data.descriptions) {
    const text = d.description.replace(/\s+/g, " ").trim();
    if (!allowed.has(d.store_id) || text.length < 10) continue;
    if (RISKY_PATTERNS.some((p) => p.test(text))) continue;
    out[d.store_id] = text.length > 180 ? `${text.slice(0, 178)}…` : text;
  }
  return out;
}

export function parseReasonsResponse(raw: unknown, allowedIds: string[]): Record<string, string> {
  const parsed = GeminiReasonsSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidAIResponseError("추천 이유 응답 형식 오류");
  const allowed = new Set(allowedIds);
  const out: Record<string, string> = {};
  for (const r of parsed.data.reasons) {
    const text = r.reason.replace(/\s+/g, " ").trim();
    if (!allowed.has(r.store_id) || text.length < 8) continue;
    if (RISKY_PATTERNS.some((p) => p.test(text))) continue;
    out[r.store_id] = text.length > 160 ? `${text.slice(0, 158)}…` : text;
  }
  return out;
}

/** 규칙 기반 vector와 AI vector를 섞어 극단적인 응답을 완화합니다. */
export function blendVectors(ai: ReturnType<typeof emptyVector>, rule: ReturnType<typeof emptyVector>, aiWeight = 0.75) {
  const out = emptyVector();
  for (const k of TASTE_KEYS) out[k] = round3(clamp01(aiWeight * ai[k] + (1 - aiWeight) * rule[k]));
  return out;
}
