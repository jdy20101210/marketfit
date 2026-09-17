/**
 * 대화 답변에서 상황 정보를 규칙으로 추출합니다 (MockGeminiProvider와 Gemini 응답 검증에 공용).
 * - 사용자가 말한 내용만 채웁니다. 예산 숫자는 사용자가 적은 숫자에서만 계산합니다.
 */
import { PRODUCT_KEYS } from "@/lib/recommendation/engine";
import { findDictionaryWords, KEYWORD_RULES, matchSentence } from "@/lib/recommendation/keywords";
import {
  CORE_SLOTS,
  MAX_QUESTIONS,
  MIN_ANSWERS,
  type Budget,
  type ChatMessage,
  type Companion,
  type InterviewSlot,
  type InterviewSlots,
  type Occasion,
  type PreferredStyle,
} from "./types";

// ---------- 예산 ----------

const KOREAN_DIGITS: Record<string, number> = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };

/** '이십', '오', '십오' 같은 한글 숫자(1~99) */
function koreanNumber(text: string): number | null {
  if (!/^[일이삼사오육칠팔구십]+$/.test(text)) return null;
  const tenIdx = text.indexOf("십");
  if (tenIdx < 0) return text.length === 1 ? KOREAN_DIGITS[text]! : null;
  const tens = tenIdx === 0 ? 1 : KOREAN_DIGITS[text.slice(0, tenIdx)] ?? null;
  const onesText = text.slice(tenIdx + 1);
  const ones = onesText ? KOREAN_DIGITS[onesText] ?? null : 0;
  if (tens === null || ones === null) return null;
  return tens * 10 + ones;
}

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "");
  const n = Number(cleaned);
  if (Number.isFinite(n)) return n;
  return koreanNumber(raw);
}

const DIGIT_AMOUNT_RE = /(\d[\d,]*(?:\.\d+)?)\s*만\s*(?:(\d+)\s*천)?\s*원?|(\d+)\s*천\s*원?|(\d{1,3}(?:,\d{3})+|\d{4,})\s*원?/g;
// 한글 숫자는 일상 단어와 겹치기 쉬워('이천', '사천') '원'이 붙은 경우만 금액으로 봅니다.
const KOREAN_AMOUNT_RE = /(?:^|[^가-힣])([일이삼사오육칠팔구십]+)\s*만\s*(?:([일이삼사오육칠팔구십]+)\s*천\s*)?원|(?:^|[^가-힣])([일이삼사오육칠팔구십]+)\s*천\s*원/g;

/** 문장 속 금액들 (원 단위) */
export function parseAmounts(text: string): number[] {
  const out: number[] = [];
  // '만원 정도'처럼 앞 숫자가 없는 '만원'은 1만원으로 봅니다.
  const normalized = text.replace(/(^|[^일이삼사오육칠팔구십\d])만\s*원/g, "$11만원");
  for (const m of normalized.matchAll(DIGIT_AMOUNT_RE)) {
    let value: number | null = null;
    if (m[1] !== undefined) {
      const man = toNumber(m[1]);
      const cheon = m[2] !== undefined ? toNumber(m[2]) : 0;
      if (man !== null && cheon !== null) value = Math.round(man * 10000 + cheon * 1000);
    } else if (m[3] !== undefined) {
      const cheon = toNumber(m[3]);
      if (cheon !== null) value = cheon * 1000;
    } else if (m[4] !== undefined) {
      value = toNumber(m[4]);
    }
    // 1,000원 미만(예: '2개')은 금액으로 보지 않습니다.
    if (value !== null && value >= 1000 && value <= 100_000_000) out.push(value);
  }
  for (const m of normalized.matchAll(KOREAN_AMOUNT_RE)) {
    const value =
      m[1] !== undefined
        ? (koreanNumber(m[1]) ?? 0) * 10000 + (m[2] !== undefined ? (koreanNumber(m[2]) ?? 0) * 1000 : 0)
        : (koreanNumber(m[3]!) ?? 0) * 1000;
    if (value >= 1000) out.push(value);
  }
  return out;
}

const OPEN_BUDGET = /(상관\s*없|상관\s*안|제한\s*없|정해지지\s*않|안\s*정했|모르겠|몰라|아무\s*거나|괜찮아요)/;

/** 예산 문장 → {min, max}. 금액이 없으면 null */
export function parseBudget(text: string): Budget | null {
  const amounts = parseAmounts(text);
  if (amounts.length === 0) return null;
  const rangeMatch = /(\d[\d,.]*)\s*(?:~|-|–|에서)\s*(\d[\d,.]*)\s*만/.exec(text);
  if (rangeMatch) {
    const a = toNumber(rangeMatch[1]!);
    const b = toNumber(rangeMatch[2]!);
    if (a !== null && b !== null && a < b) return { min: Math.round(a * 10000), max: Math.round(b * 10000) };
  }
  if (amounts.length >= 2) {
    const sorted = [...amounts].sort((x, y) => x - y);
    return { min: sorted[0]!, max: sorted.at(-1)! };
  }
  const value = amounts[0]!;
  if (/(이상|넘게|부터|최소)/.test(text)) return { min: value, max: null };
  return { min: null, max: value };
}

// ---------- 상황 정보 ----------

const COMPANION_PATTERNS: [Companion, RegExp][] = [
  ["parents", /(부모님|어머니|아버지|엄마|아빠|할머니|할아버지|시부모|장인|장모)/],
  ["kids", /(아이(?!스|디|템|폰|패드|돌|라인)|아들|딸(?!기)|조카|키즈|애들|유아)/],
  ["partner", /(연인|남자\s*친구|여자\s*친구|남친|여친|애인|커플|와이프|아내|남편|배우자)/],
  ["friend", /(친구|지인|동생|언니|오빠|누나|형님)/],
  ["family", /(가족|식구)/],
  ["colleague", /(동료|직장|회사|팀원|선생님|거래처)/],
  ["alone", /(혼자|나\s*혼자|제가\s*쓸|내가\s*쓸|나를\s*위한|저를\s*위한|제\s*것|내\s*것)/],
];

const OCCASION_PATTERNS: [Occasion, RegExp][] = [
  ["birthday", /생일|생신/],
  ["holiday", /명절|설날|추석|설 선물/],
  ["anniversary", /기념일|결혼\s*기념|\d+\s*주년|백일|100일/],
  ["housewarming", /집들이|이사/],
  ["wedding", /결혼|예단|이바지|혼수|폐백|상견례/],
  ["camping", /캠핑|차박|글램핑/],
  ["travel", /여행|관광|나들이|구경/],
  ["daily", /장보기|장\s*보|반찬|식재료|일상|생활용품/],
];

const STYLE_PATTERNS: [PreferredStyle, RegExp][] = [
  ["local_unique", /(독특|특별|흔하지\s*않|흔치\s*않|대전만|대전에서만|대전\s*특|지역\s*특|로컬|특산|이색|색다른|개성|유니크)/],
  ["practical", /(실용|쓸모|튼튼|오래\s*쓰|자주\s*쓰|생활에\s*필요)/],
  ["traditional", /(전통|한국적|옛\s*정취)/],
  ["trendy", /(요즘|트렌디|유행|감성적|힙한|예쁜)/],
  ["vintage", /(빈티지|레트로|옛날\s*감성|복고)/],
  ["value", /(가성비|저렴|싸게|알뜰|합리적)/],
  ["premium", /(고급|품질\s*좋|프리미엄|좋은\s*품질)/],
];

const DISCOVERY_NEW = /(새로운|숨은|숨겨진|처음\s*가|안\s*가\s*본|몰랐던|발견|골목\s*가게|잘\s*모르는\s*곳)/;
const DISCOVERY_FAMILIAR = /(유명|대표|잘\s*알려진|익숙|단골|검증|후기\s*많|인기\s*있)/;
const DISCOVERY_BALANCED = /(상관\s*없|둘\s*다|아무\s*곳|반반|모두\s*좋)/;
const BOTH_STYLES = /(둘\s*다|모두|반반|다\s*좋)/;
const FINISH_REQUEST = /(그만|이제\s*(추천|분석)|바로\s*(추천|분석)|충분|이대로\s*(추천|분석))/;

/** 찾는 것 → 목적 코드와 라벨 */
export function deriveIntent(text: string, occasion: Occasion | null): { intent: string; label: string } | null {
  const hits = new Set(findDictionaryWords(text).map((h) => h.rule));
  const has = (word: string) => hits.has(KEYWORD_RULES.findIndex((r) => r.words.includes(word)));
  const gift = /선물|답례|기념품|특산품/.test(text) || has("선물");
  if (gift) {
    if (occasion === "birthday") return { intent: "birthday_gift", label: "생일 선물" };
    if (occasion === "holiday") return { intent: "holiday_gift", label: "명절 선물" };
    if (occasion === "housewarming") return { intent: "housewarming_gift", label: "집들이 선물" };
    if (occasion === "anniversary") return { intent: "anniversary_gift", label: "기념일 선물" };
    if (/기념품|특산품/.test(text)) return { intent: "souvenir", label: "지역 기념품" };
    return { intent: "gift", label: "선물" };
  }
  if (/예단|이바지|혼수|폐백/.test(text)) return { intent: "wedding_goods", label: "혼례·예단 준비" };
  if (/한복|전통/.test(text)) return { intent: "traditional_goods", label: "전통 상품" };
  if (has("캠핑") || has("등산")) return { intent: "outdoor_gear", label: "캠핑·아웃도어 용품" };
  if (has("커피")) return { intent: "coffee", label: "커피" };
  if (has("맛집") || has("국밥") || has("떡볶이") || has("간식") || has("닭강정") || has("디저트")) return { intent: "market_food", label: "시장 먹거리" };
  if (has("반찬") || occasion === "daily") return { intent: "grocery_shopping", label: "장보기" };
  if (has("옷") || has("가방") || has("신발") || has("액세서리") || has("귀걸이")) return { intent: "fashion_shopping", label: "패션 쇼핑" };
  if (has("이불") || has("인테리어") || has("꽃")) return { intent: "home_living", label: "집 꾸미기" };
  if (has("주방")) return { intent: "kitchen_goods", label: "주방 살림" };
  if (has("수공예")) return { intent: "craft_supplies", label: "수공예 재료" };
  if (has("빈티지")) return { intent: "vintage_finds", label: "빈티지 찾기" };
  if (has("여행") || has("전통시장") || has("로컬") || /구경|둘러/.test(text)) return { intent: "market_tour", label: "시장 구경" };
  return null;
}

function emptySlots(): InterviewSlots {
  return {
    lookingFor: null,
    intent: null,
    intentLabel: null,
    budget: null,
    budgetOpen: false,
    preferredStyle: [],
    companion: null,
    occasion: null,
    discoveryPreference: null,
    tasteWords: [],
    answered: [],
  };
}

function firstMatch<T>(patterns: [T, RegExp][], text: string): T | null {
  for (const [value, re] of patterns) if (re.test(text)) return value;
  return null;
}

/** '캠핑은 관심 없어요'처럼 부정한 구절은 빼고 분석합니다. */
function positiveText(text: string): string {
  return text
    .split(/[,.!?\n]|그리고|하지만|그런데|근데/)
    .filter((c) => !/(관심\s*(이|은|는)?\s*없|싫|말고|빼고|제외|별로)/.test(c))
    .join(" ");
}

/** 대화 전체에서 상황 정보를 추출합니다 (질문 slot을 힌트로 사용). */
export function extractSlots(messages: ChatMessage[]): InterviewSlots {
  const slots = emptySlots();
  const answered = new Set<InterviewSlot>();
  const taste = new Set<string>();
  let lastSlot: InterviewSlot | null = null;

  for (const m of messages) {
    if (m.role === "assistant") {
      lastSlot = m.slot ?? null;
      continue;
    }
    const text = m.text.trim();
    if (!text) continue;
    const positive = positiveText(text);
    const target = lastSlot;
    if (target) answered.add(target);

    if (target === "looking_for" && !slots.lookingFor) slots.lookingFor = text.slice(0, 40);

    const occasion = firstMatch(OCCASION_PATTERNS, positive);
    if (occasion && !slots.occasion) slots.occasion = occasion;

    const companion = firstMatch(COMPANION_PATTERNS, positive);
    if (companion && (!slots.companion || target === "companion")) slots.companion = companion;
    if (companion) answered.add("companion");

    const budget = parseBudget(text);
    if (budget) {
      slots.budget = budget;
      slots.budgetOpen = false;
      answered.add("budget");
    } else if (target === "budget" && OPEN_BUDGET.test(text)) {
      slots.budgetOpen = true;
    }

    const styles = STYLE_PATTERNS.filter(([, re]) => re.test(positive)).map(([s]) => s);
    if (target === "style" && styles.length === 0 && BOTH_STYLES.test(text)) styles.push("local_unique", "practical");
    for (const s of styles) if (!slots.preferredStyle.includes(s)) slots.preferredStyle.push(s);
    if (styles.length) answered.add("style");

    if (DISCOVERY_NEW.test(positive)) slots.discoveryPreference = "new";
    else if (DISCOVERY_FAMILIAR.test(positive)) slots.discoveryPreference = "familiar";
    else if (target === "discovery" && DISCOVERY_BALANCED.test(text)) slots.discoveryPreference = "balanced";
    if (slots.discoveryPreference && (target === "discovery" || DISCOVERY_NEW.test(positive) || DISCOVERY_FAMILIAR.test(positive))) {
      answered.add("discovery");
    }

    const sentence = matchSentence(text);
    for (const w of sentence.matchedWords) taste.add(w);
    const productSignal = PRODUCT_KEYS.some((k) => sentence.weights[k] >= 0.6);
    if (target === "taste" || (target !== "looking_for" && productSignal)) answered.add("taste");
  }

  const lookingText = slots.lookingFor ?? messages.find((m) => m.role === "user")?.text ?? "";
  if (!slots.lookingFor && lookingText) slots.lookingFor = lookingText.slice(0, 40);
  if (slots.lookingFor) answered.add("looking_for");
  const intent = deriveIntent(`${lookingText} ${[...taste].join(" ")}`, slots.occasion);
  if (intent) {
    slots.intent = intent.intent;
    slots.intentLabel = intent.label;
  }
  slots.tasteWords = [...taste].slice(0, 12);
  slots.answered = [...answered];
  return slots;
}

export function isSlotFilled(slots: InterviewSlots, slot: InterviewSlot): boolean {
  switch (slot) {
    case "looking_for":
      return Boolean(slots.lookingFor);
    case "budget":
      return Boolean(slots.budget) || slots.budgetOpen;
    case "style":
      return slots.preferredStyle.length > 0 || slots.answered.includes("style");
    case "companion":
      return Boolean(slots.companion) || slots.answered.includes("companion");
    case "taste":
      return slots.answered.includes("taste");
    case "discovery":
      return Boolean(slots.discoveryPreference) || slots.answered.includes("discovery");
  }
}

export const RULE_QUESTIONS: Record<InterviewSlot, { text: string; suggestions: string[] }> = {
  looking_for: { text: "지금 중앙시장에서 무엇을 찾고 계세요?", suggestions: ["친구 생일 선물", "시장 먹거리 구경", "캠핑 용품", "집 꾸미기 소품"] },
  budget: { text: "예산은 어느 정도 생각하고 계세요?", suggestions: ["1만원 이하", "2만원 정도", "5만원 정도", "상관없어요"] },
  style: {
    text: "흔하지 않은 대전만의 상품과 실용적인 상품 중 어느 쪽을 더 선호하시나요?",
    suggestions: ["대전만의 독특한 상품", "실용적인 상품", "둘 다 좋아요"],
  },
  companion: { text: "누구와 함께 가시나요? 혹은 누구를 위한 건가요?", suggestions: ["나를 위해", "친구", "가족", "연인"] },
  taste: { text: "평소 좋아하는 것이나 취미가 있다면 알려주세요.", suggestions: ["커피", "캠핑", "빈티지", "전통 먹거리"] },
  discovery: {
    text: "처음 가 보는 숨은 가게도 괜찮으세요, 아니면 잘 알려진 가게가 좋으세요?",
    suggestions: ["숨은 가게 좋아요", "잘 알려진 곳이 좋아요", "상관없어요"],
  },
};

/** 다음에 물을 항목: 핵심 항목(찾는 것·예산·스타일) → 질문이 3개가 안 되면 동행·취향·발견 선호 */
export function nextRuleSlot(slots: InterviewSlots, answeredCount: number, askedSlots: InterviewSlot[]): InterviewSlot | null {
  const pending = (list: InterviewSlot[]) => list.filter((s) => !isSlotFilled(slots, s) && !askedSlots.includes(s));
  const core = pending(CORE_SLOTS);
  if (core.length) return core[0]!;
  if (answeredCount >= MIN_ANSWERS) return null;
  const gifty = /gift|souvenir/.test(slots.intent ?? "");
  const optional = pending(gifty ? ["companion", "discovery", "taste"] : ["taste", "discovery", "companion"]);
  return optional[0] ?? null;
}

export function interviewState(messages: ChatMessage[]) {
  const answers = messages.filter((m) => m.role === "user");
  const asked = messages.filter((m) => m.role === "assistant");
  const askedSlots = asked.map((m) => m.slot).filter((s): s is InterviewSlot => Boolean(s));
  const slots = extractSlots(messages);
  const lastAnswer = answers.at(-1)?.text ?? "";
  const finishRequested = FINISH_REQUEST.test(lastAnswer) && answers.length >= 1;
  const next = nextRuleSlot(slots, answers.length, askedSlots);
  const done = finishRequested || answers.length >= MAX_QUESTIONS || next === null;
  return { slots, answeredCount: answers.length, askedCount: asked.length, askedSlots, next, done, finishRequested };
}

const ACKS = ["좋아요!", "알겠어요.", "그렇군요.", "좋은 정보예요.", "네, 참고할게요."];

/** 규칙 기반 다음 질문 (Mock 인터뷰어 · Gemini 응답이 부적절할 때 대체) */
export function ruleInterviewTurn(messages: ChatMessage[]) {
  const state = interviewState(messages);
  const ack = ACKS[(state.answeredCount - 1 + ACKS.length) % ACKS.length]!;
  if (state.done || !state.next) {
    return {
      ...state,
      reply: `${ack} 말씀해 주신 내용으로 취향을 분석할 준비가 됐어요. 아래 [대화 내용으로 분석하기]를 눌러 주세요.`,
      slot: null,
      done: true,
      suggestions: [] as string[],
    };
  }
  const q = RULE_QUESTIONS[state.next];
  return { ...state, reply: `${ack} ${q.text}`, slot: state.next, done: false, suggestions: q.suggestions };
}
