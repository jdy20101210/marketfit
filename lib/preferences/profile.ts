/**
 * 규칙 기반 취향 분석기 (MockGeminiProvider · Gemini 결과 보정용)
 * 대화 답변·키워드·추출한 상황 정보 → UserPreferenceProfile과 같은 구조의 초안
 */
import { clamp01, emptyVector, round3, TASTE_KEYS, TASTE_META, topTastes, type TasteKey, type TasteVector } from "@/lib/recommendation/dimensions";
import { PRODUCT_KEYS } from "@/lib/recommendation/engine";
import { combineWeights, matchKeyword, matchSentence } from "@/lib/recommendation/keywords";
import { josa } from "@/lib/recommendation/reasons";
import { extractSlots } from "./extract";
import {
  budgetLabel,
  STYLE_LABEL,
  type Budget,
  type ChatMessage,
  type Companion,
  type DiscoveryPreference,
  type InputMode,
  type InterviewSlots,
  type KeywordInsight,
  type Occasion,
  type PreferredStyle,
  type UserPreferenceProfile,
} from "./types";

type Weights = Partial<Record<TasteKey, number>>;

const STYLE_WEIGHTS: Record<PreferredStyle, Weights> = {
  local_unique: { local: 0.9, discovery: 0.85 },
  practical: { practical: 0.9 },
  traditional: { traditional: 0.85, local: 0.5 },
  trendy: { discovery: 0.5, date: 0.3 },
  vintage: { vintage: 0.85, discovery: 0.5 },
  value: { price_sensitive: 0.9, practical: 0.5 },
  premium: { gift: 0.3 },
};

const COMPANION_WEIGHTS: Record<Companion, Weights> = {
  alone: {},
  friend: {},
  partner: { date: 0.8 },
  family: { family: 0.85 },
  kids: { family: 0.9 },
  parents: { family: 0.9, traditional: 0.35 },
  colleague: { practical: 0.3 },
};

const OCCASION_WEIGHTS: Record<Occasion, Weights> = {
  birthday: { gift: 0.9 },
  holiday: { gift: 0.7, family: 0.6, traditional: 0.55 },
  anniversary: { gift: 0.85, date: 0.7 },
  housewarming: { gift: 0.8, living: 0.7 },
  wedding: { traditional: 0.8, gift: 0.7, family: 0.7 },
  travel: { travel: 0.9, local: 0.6 },
  camping: { camping: 0.9, travel: 0.5 },
  daily: { practical: 0.8, food: 0.5, price_sensitive: 0.5 },
};

const DISCOVERY_WEIGHTS: Record<DiscoveryPreference, Weights> = {
  new: { discovery: 0.9 },
  balanced: { discovery: 0.5 },
  familiar: { discovery: 0.15 },
};

function budgetWeights(budget: Budget | null): Weights {
  const max = budget?.max;
  if (!max) return {};
  if (max <= 10_000) return { price_sensitive: 0.75 };
  if (max <= 30_000) return { price_sensitive: 0.55 };
  if (max <= 50_000) return { price_sensitive: 0.4 };
  if (max <= 100_000) return { price_sensitive: 0.25 };
  return {};
}

function toFull(weights: Weights): TasteVector {
  const v = emptyVector();
  for (const [k, w] of Object.entries(weights) as [TasteKey, number][]) v[k] = w;
  return v;
}

/**
 * 목적이 '지역 특색 선물'이면 선물할 만한 시장 상품 분야(전통 먹거리·간식·공예)를 약하게 함께 반영합니다.
 */
export function applySouvenirExpansion(v: TasteVector): TasteVector {
  if (v.gift >= 0.6 && (v.local >= 0.6 || v.discovery >= 0.6)) {
    return { ...v, traditional: Math.max(v.traditional, 0.45), dessert: Math.max(v.dessert, 0.35), craft: Math.max(v.craft, 0.3) };
  }
  return v;
}

const PERSONA_NAMES: Partial<Record<TasteKey, string>> = {
  camping: "감성 캠퍼형",
  coffee: "커피 탐험가형",
  dessert: "간식 헌터형",
  food: "시장 미식가형",
  traditional: "전통 로컬형",
  gift: "선물 큐레이터형",
  accessory: "소품 수집가형",
  fashion: "시장 패셔니스타형",
  kitchen: "홈쿡 살림형",
  living: "공간 꾸미기형",
  vintage: "빈티지 감성형",
  craft: "핸드메이드 메이커형",
};

export function personaFor(v: TasteVector): string {
  const product = PRODUCT_KEYS.filter((k) => v[k] >= 0.45).sort((a, b) => v[b] - v[a])[0];
  if (product && PERSONA_NAMES[product]) return PERSONA_NAMES[product]!;
  if (v.local >= 0.6 && v.discovery >= 0.6) return "원도심 탐방형";
  if (v.practical >= 0.6 || v.price_sensitive >= 0.6) return "실속 쇼핑형";
  if (v.family >= 0.6) return "가족 살림형";
  if (v.travel >= 0.6) return "여행 기록가형";
  return "시장 탐색형";
}

export interface RuleProfileInput {
  mode: InputMode;
  messages: ChatMessage[];
  keywords: string[];
}

export interface RuleProfile {
  profile: UserPreferenceProfile;
  focus: TasteVector;
  slots: InterviewSlots;
  personaLabel: string;
  topCategories: { key: TasteKey; score: number; evidence: string }[];
  keywordInsights: KeywordInsight[];
  empty: boolean;
}

/** 키워드 한 개의 해석: 주 차원과 함께 반영한 관련 차원 */
export function keywordInsight(input: string): KeywordInsight {
  const m = matchKeyword(input);
  const entries = (Object.entries(m.weights) as [TasteKey, number][]).sort((a, b) => b[1] - a[1]);
  const keys = entries.filter(([, w]) => w >= 0.5).slice(0, 3).map(([k]) => k);
  const expanded = entries
    .filter(([k, w]) => w > 0 && w < 0.5 && !keys.includes(k))
    .slice(0, 3)
    .map(([k]) => TASTE_META[k].label);
  return {
    input,
    keys,
    expanded,
    note: m.mapped
      ? `${keys.map((k) => TASTE_META[k].label).join("·")} 관심으로 해석했어요${expanded.length ? ` (관련: ${expanded.join("·")})` : ""}.`
      : "사전에 없는 단어라 시장 탐색·실용 관심으로 약하게만 반영했어요.",
  };
}

function summaryFor(profile: Omit<UserPreferenceProfile, "summary">, mode: InputMode, keywords: string[], v: TasteVector): string {
  const style = profile.preferredStyle.filter((s) => s !== "premium").map((s) => STYLE_LABEL[s]);
  const budget = budgetLabel(profile.budget);
  const target = profile.intentLabel ?? (profile.lookingFor ? "상품" : null);
  if (mode !== "keywords" && target) {
    const parts = [style.slice(0, 2).join(" "), budget].filter(Boolean).join(" ");
    const lead = parts ? `${parts} ${target}` : target;
    const extra = profile.discoveryPreference === "new" ? " 숨은 가게를 발견하는 것도 좋아해요." : "";
    return `${josa(lead, "을", "를")} 찾고 있어요.${extra}`.replace(/\s+/g, " ");
  }
  const labels = topTastes(v, 3, 0.3).map((t) => TASTE_META[t.key].label);
  const head = keywords.length ? `${keywords.slice(0, 3).join("·")} 키워드로 보면 ` : "";
  return labels.length
    ? `${head}${labels.join("·")}에 관심이 많아요. 이 취향에 맞는 중앙시장 점포를 찾아볼게요.`
    : "아직 뚜렷한 취향 신호가 적어요. 중앙시장을 폭넓게 둘러보는 추천을 준비할게요.";
}

/** 대화·키워드 → 규칙 기반 취향 프로필 */
export function buildRuleProfile(input: RuleProfileInput): RuleProfile {
  const useChat = input.mode !== "keywords";
  const useKeywords = input.mode !== "chat";
  const messages = useChat ? input.messages : [];
  const keywords = useKeywords ? input.keywords : [];
  const slots = extractSlots(messages);

  const answers = messages.filter((m) => m.role === "user").map((m) => m.text);
  const signals: { weights: TasteVector; strength: number }[] = [];
  const evidence = new Map<TasteKey, Set<string>>();
  const note = (weights: TasteVector, source: string) => {
    for (const k of TASTE_KEYS) if (weights[k] >= 0.5) (evidence.get(k) ?? evidence.set(k, new Set()).get(k)!).add(source);
  };

  answers.forEach((text, i) => {
    const m = matchSentence(text);
    if (!m.mapped) return;
    signals.push({ weights: m.weights, strength: i === 0 ? 1 : 0.9 });
    note(m.weights, m.matchedWords.slice(0, 2).join("·"));
  });
  for (const k of keywords) {
    const m = matchKeyword(k);
    signals.push({ weights: m.weights, strength: 0.9 });
    if (m.mapped) note(m.weights, k);
  }
  const contextSignals: [Weights, string][] = [
    ...slots.preferredStyle.map((s) => [STYLE_WEIGHTS[s], STYLE_LABEL[s]] as [Weights, string]),
    ...(slots.companion ? [[COMPANION_WEIGHTS[slots.companion], "동행·대상"] as [Weights, string]] : []),
    ...(slots.occasion ? [[OCCASION_WEIGHTS[slots.occasion], "상황"] as [Weights, string]] : []),
    ...(slots.discoveryPreference ? [[DISCOVERY_WEIGHTS[slots.discoveryPreference], "발견 선호"] as [Weights, string]] : []),
    [budgetWeights(slots.budget), `예산 ${budgetLabel(slots.budget) ?? ""}`],
  ];
  for (const [w, label] of contextSignals) {
    const full = toFull(w);
    if (TASTE_KEYS.some((k) => full[k] > 0)) {
      signals.push({ weights: full, strength: 1 });
      note(full, label);
    }
  }

  const combined = combineWeights(signals);
  let categories = applySouvenirExpansion(combined);
  for (const k of TASTE_KEYS) if (categories[k] > combined[k]) note(toFull({ [k]: 1 }), "지역 특색 선물");
  const empty = TASTE_KEYS.every((k) => combined[k] < 0.3);
  if (empty) {
    // 해석할 신호가 거의 없으면 시장을 폭넓게 둘러보는 기본 취향으로 둡니다(데모가 멈추지 않도록).
    categories = combineWeights([...signals, { weights: toFull({ local: 0.7, food: 0.45, discovery: 0.5, practical: 0.35 }), strength: 1 }]);
  }

  // 지금 찾는 것: 첫 답변(찾는 것) + 상황, 키워드만 입력했다면 키워드
  const focusSignals: { weights: TasteVector; strength: number }[] = [];
  if (answers[0]) {
    const m = matchSentence(answers[0]);
    if (m.mapped) focusSignals.push({ weights: m.weights, strength: 1 });
  }
  if (slots.occasion) focusSignals.push({ weights: toFull(OCCASION_WEIGHTS[slots.occasion]), strength: 1 });
  for (const s of slots.preferredStyle) focusSignals.push({ weights: toFull(STYLE_WEIGHTS[s]), strength: 0.8 });
  if (focusSignals.length === 0) for (const k of keywords) focusSignals.push({ weights: matchKeyword(k).weights, strength: 0.9 });
  let focus = focusSignals.length ? applySouvenirExpansion(combineWeights(focusSignals)) : { ...categories };
  if (TASTE_KEYS.every((k) => focus[k] < 0.3)) focus = { ...categories };

  categories = Object.fromEntries(TASTE_KEYS.map((k) => [k, round3(clamp01(categories[k]))])) as TasteVector;
  focus = Object.fromEntries(TASTE_KEYS.map((k) => [k, round3(clamp01(focus[k]))])) as TasteVector;

  const top = topTastes(categories, 6, 0.3);
  const topCategories = top.map((t) => ({
    key: t.key,
    score: t.score,
    evidence: [...(evidence.get(t.key) ?? [])].filter(Boolean).slice(0, 3).join(", "),
  }));

  const base: Omit<UserPreferenceProfile, "summary"> = {
    categories,
    budget: slots.budget,
    intent: slots.intent,
    intentLabel: slots.intentLabel,
    lookingFor: slots.lookingFor,
    companion: slots.companion,
    occasion: slots.occasion,
    preferredStyle: slots.preferredStyle,
    discoveryPreference: slots.discoveryPreference,
  };
  const summary = empty
    ? "입력한 내용에서 뚜렷한 취향을 찾지 못해, 중앙시장을 폭넓게 둘러보는 기본 취향으로 추천해요. 좋아하는 것을 조금 더 알려주시면 더 정확해져요."
    : summaryFor(base, input.mode, keywords, categories);
  return {
    profile: { ...base, summary },
    focus,
    slots,
    personaLabel: personaFor(categories),
    topCategories,
    keywordInsights: keywords.map(keywordInsight),
    empty,
  };
}
