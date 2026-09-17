import { z } from "zod";
import {
  COMPANIONS,
  DISCOVERY_PREFERENCES,
  INTERVIEW_SLOTS,
  OCCASIONS,
  STYLES,
  type Budget,
  type InterviewSlot,
  type KeywordInsight,
  type PreferredStyle,
  type UserPreferenceProfile,
} from "@/lib/preferences/types";
import { clamp01, emptyVector, isTasteKey, round3, TASTE_KEYS, TASTE_META, toVector, topTastes, type TasteKey, type TasteVector } from "@/lib/recommendation/dimensions";
import type { InterviewDraft, MerchantPromoDraft, PreferenceDraft } from "./types";

/**
 * Gemini 구조화 출력용 JSON schema (Gemini API Schema: OpenAPI 부분집합)
 * 서버는 이 스키마로 응답을 요청하고, 응답은 아래 Zod 스키마로 다시 검증합니다.
 */
const tasteVectorJsonSchema = (description: string) => ({
  type: "OBJECT",
  description,
  properties: Object.fromEntries(TASTE_KEYS.map((k) => [k, { type: "NUMBER", description: `${TASTE_META[k].label} (${TASTE_META[k].hint}), 0~1` }])),
  required: [...TASTE_KEYS],
});

const enumSchema = (values: readonly string[], nullable = false) => ({ type: "STRING", format: "enum", enum: [...values], ...(nullable ? { nullable: true } : {}) });
const tasteKeyEnum = enumSchema(TASTE_KEYS);

const contextJsonSchema = {
  type: "OBJECT",
  properties: {
    intent: { type: "STRING", nullable: true },
    intent_label: { type: "STRING", nullable: true },
    looking_for: { type: "STRING", nullable: true },
    budget_min: { type: "INTEGER", nullable: true },
    budget_max: { type: "INTEGER", nullable: true },
    companion: enumSchema(COMPANIONS, true),
    occasion: enumSchema(OCCASIONS, true),
    preferred_style: { type: "ARRAY", items: enumSchema(STYLES) },
    discovery_preference: enumSchema(DISCOVERY_PREFERENCES, true),
  },
  required: ["intent", "intent_label", "looking_for", "budget_min", "budget_max", "companion", "occasion", "preferred_style", "discovery_preference"],
};

export const INTERVIEW_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING", description: "짧은 공감 + 질문 하나 (120자 이내)" },
    next_slot: enumSchema(INTERVIEW_SLOTS, true),
    done: { type: "BOOLEAN" },
    suggestions: { type: "ARRAY", items: { type: "STRING" } },
    extracted: {
      type: "OBJECT",
      properties: {
        looking_for: { type: "STRING", nullable: true },
        intent: { type: "STRING", nullable: true },
        intent_label: { type: "STRING", nullable: true },
        companion: enumSchema(COMPANIONS, true),
        occasion: enumSchema(OCCASIONS, true),
        preferred_style: { type: "ARRAY", items: enumSchema(STYLES) },
        discovery_preference: enumSchema(DISCOVERY_PREFERENCES, true),
      },
    },
  },
  required: ["reply", "next_slot", "done", "suggestions", "extracted"],
  propertyOrdering: ["extracted", "done", "next_slot", "reply", "suggestions"],
} as const;

export const PREFERENCE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    persona_label: { type: "STRING", description: "10자 내외 한국어 취향 별칭" },
    summary: { type: "STRING", description: "1~2문장 한국어 요약(해요체)" },
    categories: tasteVectorJsonSchema("전체 취향 점수(0~1). 근거가 없으면 0에 가깝게."),
    focus: tasteVectorJsonSchema("지금 찾는 것(이번 방문 목적) 점수(0~1)"),
    context: contextJsonSchema,
    top_categories: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { key: tasteKeyEnum, score: { type: "NUMBER" }, evidence: { type: "STRING" } },
        required: ["key", "score", "evidence"],
      },
    },
    keyword_insights: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          input: { type: "STRING" },
          keys: { type: "ARRAY", items: tasteKeyEnum },
          expanded_terms: { type: "ARRAY", items: { type: "STRING" } },
          note: { type: "STRING" },
        },
        required: ["input", "keys", "expanded_terms", "note"],
      },
    },
  },
  required: ["persona_label", "summary", "categories", "focus", "context", "top_categories", "keyword_insights"],
  propertyOrdering: ["context", "categories", "focus", "top_categories", "keyword_insights", "persona_label", "summary"],
} as const;

export const REASONS_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reasons: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { store_id: { type: "STRING" }, reason: { type: "STRING" } },
        required: ["store_id", "reason"],
      },
    },
  },
  required: ["reasons"],
} as const;

export const STORE_DESCRIPTIONS_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    descriptions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { store_id: { type: "STRING" }, description: { type: "STRING" } },
        required: ["store_id", "description"],
      },
    },
  },
  required: ["descriptions"],
} as const;

export const MERCHANT_PROMO_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    interest_summary: { type: "STRING" },
    conversion_insight: { type: "STRING" },
    display_ideas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          detail: { type: "STRING" },
          items: { type: "ARRAY", items: { type: "STRING" } },
          uses_only_confirmed_items: { type: "BOOLEAN" },
        },
        required: ["title", "detail", "items", "uses_only_confirmed_items"],
      },
    },
    keywords: { type: "ARRAY", items: { type: "STRING" } },
    sns_copy: { type: "STRING" },
    event_ideas: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { title: { type: "STRING" }, detail: { type: "STRING" } }, required: ["title", "detail"] },
    },
  },
  required: ["interest_summary", "conversion_insight", "display_ideas", "keywords", "sns_copy", "event_ideas"],
} as const;

export class InvalidAIResponseError extends Error {}

const looseNumber = z.union([z.number(), z.string()]).transform((v) => clamp01(Number(v)));
const looseInt = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 && n <= 100_000_000 ? n : null;
  });
const optionalText = (max: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim().slice(0, max) : null));
const enumOrNull = <T extends string>(values: readonly T[]) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((v) => ((values as readonly string[]).includes(v ?? "") ? (v as T) : null));
const enumList = <T extends string>(values: readonly T[]) =>
  z
    .array(z.string())
    .optional()
    .default([])
    .transform((list) => [...new Set(list.filter((v): v is T => (values as readonly string[]).includes(v)))]);

const INTENT_RE = /^[a-z][a-z0-9_]{1,39}$/;

// ---------- 인터뷰 ----------

const GeminiInterviewSchema = z.object({
  reply: z.string(),
  next_slot: enumOrNull(INTERVIEW_SLOTS),
  done: z.boolean(),
  suggestions: z.array(z.string()).optional().default([]),
  extracted: z
    .object({
      looking_for: optionalText(40),
      intent: optionalText(40),
      intent_label: optionalText(20),
      companion: enumOrNull(COMPANIONS),
      occasion: enumOrNull(OCCASIONS),
      preferred_style: enumList(STYLES),
      discovery_preference: enumOrNull(DISCOVERY_PREFERENCES),
    })
    .optional(),
});

export function parseInterviewResponse(raw: unknown): InterviewDraft {
  const parsed = GeminiInterviewSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidAIResponseError(`인터뷰 응답 형식 오류: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  const d = parsed.data;
  const reply = d.reply.replace(/\s+/g, " ").trim();
  if (reply.length < 2) throw new InvalidAIResponseError("인터뷰 응답이 비어 있습니다.");
  const e = d.extracted ?? { looking_for: null, intent: null, intent_label: null, companion: null, occasion: null, preferred_style: [], discovery_preference: null };
  return {
    reply: reply.length > 160 ? `${reply.slice(0, 158)}…` : reply,
    slot: (d.next_slot as InterviewSlot | null) ?? null,
    done: d.done,
    suggestions: [...new Set(d.suggestions.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 0 && s.length <= 20))].slice(0, 4),
    extracted: {
      lookingFor: e.looking_for ?? null,
      intent: e.intent && INTENT_RE.test(e.intent) ? e.intent : null,
      intentLabel: e.intent_label ?? null,
      companion: e.companion ?? null,
      occasion: e.occasion ?? null,
      preferredStyle: (e.preferred_style ?? []) as PreferredStyle[],
      discoveryPreference: e.discovery_preference ?? null,
    },
  };
}

// ---------- 취향 분석 ----------

const GeminiPreferenceSchema = z.object({
  persona_label: z.string().trim().min(1).max(40),
  summary: z.string().trim().min(1).max(400),
  categories: z.record(z.string(), looseNumber),
  focus: z.record(z.string(), looseNumber).optional(),
  context: z
    .object({
      intent: optionalText(40),
      intent_label: optionalText(20),
      looking_for: optionalText(40),
      budget_min: looseInt,
      budget_max: looseInt,
      companion: enumOrNull(COMPANIONS),
      occasion: enumOrNull(OCCASIONS),
      preferred_style: enumList(STYLES),
      discovery_preference: enumOrNull(DISCOVERY_PREFERENCES),
    })
    .optional(),
  top_categories: z
    .array(z.object({ key: z.string(), score: looseNumber, evidence: z.string().max(300).optional().default("") }))
    .max(12)
    .optional()
    .default([]),
  keyword_insights: z
    .array(
      z.object({
        input: z.string().max(100),
        keys: z.array(z.string()).max(8),
        expanded_terms: z.array(z.string()).max(8).optional().default([]),
        note: z.string().max(300).optional().default(""),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

function validVector(v: TasteVector, label: string) {
  const strong = TASTE_KEYS.filter((k) => v[k] >= 0.3).length;
  if (TASTE_KEYS.reduce((s, k) => s + v[k], 0) < 0.3 || strong === 0) throw new InvalidAIResponseError(`${label} vector가 비어 있습니다.`);
  if (strong > 12) throw new InvalidAIResponseError(`${label} vector가 과도하게 퍼져 있습니다.`);
}

/**
 * Gemini 응답 → 검증·정규화된 PreferenceDraft. 형식이 맞지 않으면 예외.
 * @param keywords 입력 키워드 (keyword_insights는 입력에 있는 키워드만 사용)
 * @param hasBudgetMention 사용자 입력에 금액 표현이 있었는지 (없는데 예산이 오면 버림)
 */
export function parsePreferenceResponse(raw: unknown, keywords: string[], options: { hasBudgetMention: boolean }): PreferenceDraft {
  const parsed = GeminiPreferenceSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidAIResponseError(`취향 분석 응답 형식 오류: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  const data = parsed.data;
  const categories = toVector(data.categories);
  validVector(categories, "취향");
  const focusRaw = data.focus ? toVector(data.focus) : null;
  const focus = focusRaw && TASTE_KEYS.some((k) => focusRaw[k] >= 0.3) ? focusRaw : { ...categories };

  const ctx = data.context;
  let budget: Budget | null = null;
  if (options.hasBudgetMention && ctx && (ctx.budget_min !== null || ctx.budget_max !== null)) {
    const min = ctx.budget_min;
    const max = ctx.budget_max;
    budget = min !== null && max !== null && min > max ? { min: max, max: min } : { min, max };
  }

  const topFromModel = data.top_categories
    .filter((c): c is typeof c & { key: TasteKey } => isTasteKey(c.key))
    .map((c) => ({ key: c.key, score: round3(categories[c.key]), evidence: c.evidence.trim().slice(0, 120) }));
  const seen = new Set<TasteKey>();
  const topCategories = [...topFromModel, ...topTastes(categories, 6, 0.3).map((t) => ({ ...t, evidence: "" }))]
    .filter((c) => c.score >= 0.3)
    .filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const allowed = new Map(keywords.map((k) => [k.trim(), k]));
  const keywordInsights: KeywordInsight[] = data.keyword_insights
    .filter((i) => allowed.has(i.input.trim()))
    .map((i) => ({
      input: allowed.get(i.input.trim())!,
      keys: i.keys.filter(isTasteKey).slice(0, 4),
      expanded: [...new Set(i.expanded_terms.map((t) => t.trim()).filter((t) => t && t.length <= 15))].slice(0, 4),
      note: i.note.trim().slice(0, 120),
    }));

  const profile: UserPreferenceProfile = {
    categories,
    budget,
    intent: ctx?.intent && INTENT_RE.test(ctx.intent) ? ctx.intent : null,
    intentLabel: ctx?.intent_label ?? null,
    lookingFor: ctx?.looking_for ?? null,
    companion: ctx?.companion ?? null,
    occasion: ctx?.occasion ?? null,
    preferredStyle: (ctx?.preferred_style ?? []) as PreferredStyle[],
    discoveryPreference: ctx?.discovery_preference ?? null,
    summary: data.summary.slice(0, 200),
  };
  return { profile, focus, personaLabel: data.persona_label.slice(0, 20), topCategories, keywordInsights };
}

// ---------- 추천 이유 · 점포 소개 ----------

/**
 * 확인할 수 없는 사실을 단정하는 문장은 버리고 템플릿 문장을 씁니다.
 * 가격·전화번호·URL·평점·비율, 업력(30년 전통·3대째·원조), 순위·최초·유일, 영업시간·휴무·주차 정보
 */
export const RISKY_PATTERNS = [
  /\d[\d,.]*\s*(만\s*)?원/,
  /만\s*원/,
  /\d{2,4}-\d{3,4}-\d{4}/,
  /https?:\/\//i,
  /평점|별점|리뷰\s*\d/,
  /\d+\s*%/,
  /\d+\s*(년|대째|주년)/,
  /원조|since\s*\d|창업\s*\d|개업\s*\d/i,
  /\d+\s*위(?!치|험)|유일한|최초/,
  /영업\s*시간|휴무|정기\s*휴일|\d+\s*시\s*(부터|까지)|주차/,
];

const GeminiReasonsSchema = z.object({
  reasons: z.array(z.object({ store_id: z.string(), reason: z.string() })).max(40),
});

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

// ---------- 상인 홍보 도우미 ----------

const GeminiPromoSchema = z.object({
  interest_summary: z.string().max(600),
  conversion_insight: z.string().max(600),
  display_ideas: z
    .array(
      z.object({
        title: z.string().max(100),
        detail: z.string().max(400),
        items: z.array(z.string().max(40)).max(10).optional().default([]),
        uses_only_confirmed_items: z.boolean().optional().default(false),
      }),
    )
    .max(8),
  keywords: z.array(z.string().max(40)).max(15),
  sns_copy: z.string().max(600),
  event_ideas: z.array(z.object({ title: z.string().max(100), detail: z.string().max(400) })).max(6),
});

/** 형식 검증만 합니다 (사실 단정 필터·아이디어 표시는 lib/merchant/promo.ts의 sanitizePromo) */
export function parsePromoResponse(raw: unknown): MerchantPromoDraft {
  const parsed = GeminiPromoSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidAIResponseError(`홍보 도우미 응답 형식 오류: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  const d = parsed.data;
  return {
    interestSummary: d.interest_summary,
    conversionInsight: d.conversion_insight,
    displayIdeas: d.display_ideas.map((i) => ({ title: i.title, detail: i.detail, items: i.items, basis: i.uses_only_confirmed_items ? "confirmed" : "idea" })),
    keywords: d.keywords,
    snsCopy: d.sns_copy,
    eventIdeas: d.event_ideas,
  };
}

/** 규칙 기반 vector와 AI vector를 섞어 극단적인 응답을 완화합니다. */
export function blendVectors(ai: TasteVector, rule: TasteVector, aiWeight = 0.75): TasteVector {
  const out = emptyVector();
  for (const k of TASTE_KEYS) out[k] = round3(clamp01(aiWeight * ai[k] + (1 - aiWeight) * rule[k]));
  return out;
}
