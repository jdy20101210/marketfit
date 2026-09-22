/**
 * 대화 답변에서 상황 정보를 규칙으로 추출합니다 (내장 챗봇 엔진의 인터뷰·분석 공용).
 * - 사용자가 말한 내용만 채웁니다. 예산 숫자는 사용자가 적은 숫자에서만 계산합니다.
 */
import { PRODUCT_KEYS } from "@/lib/recommendation/engine";
import { findDictionaryWords, isNegatedAt, KEYWORD_RULES, matchSentence, maskNegatedWords } from "@/lib/recommendation/keywords";
import {
  CORE_SLOTS,
  MAX_QUESTIONS,
  MIN_ANSWERS,
  type Budget,
  type ApparelFor,
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
    wantsApparel: false,
    apparelFor: null,
    tasteWords: [],
    answered: [],
  };
}

// ---------- 옷: 누가 입을 옷인지 ----------

/** 옷(의류)을 가리키는 말. 옷감(원단)·옷걸이·옷장은 옷이 아니라서 뺍니다. */
const APPAREL_WORDS = /옷(?!감|걸이|장)|의류|남성복|여성복|바지|치마|스커트|셔츠|블라우스|원피스|자켓|재킷|점퍼|잠바|외투|코트|패딩|정장|니트|가디건|카디건|조끼|캐주얼|작업복|등산복|운동복|트레이닝|맨투맨|후드티/g;
/** 성별을 직접 말한 경우 — 어디서 말하든 그대로 씁니다. */
const MEN_DIRECT = /남성|남자(?!\s*친구)|신사/g;
const WOMEN_DIRECT = /여성|여자(?!\s*친구)|숙녀|아가씨/g;
/**
 * 사람을 가리키는 말 — "엄마랑 옷 보러 왔어요"처럼 동행일 수도 있어서,
 * 선물 맥락이거나 '누가 입을 옷인지' 질문에 대한 답일 때만 성별로 봅니다.
 */
const MEN_RELATION = /남편|아빠|아버지|아버님|아들|할아버지|오빠|남자\s*친구|남친|시아버지|장인/g;
const WOMEN_RELATION = /아내|와이프|엄마|어머니|어머님|딸(?!기)|할머니|언니|누나|여자\s*친구|여친|시어머니|장모/g;
/** '누가 입을 옷인지' 질문에 둘 다/모르겠다고 답한 경우 */
const APPAREL_BOTH = /둘\s*다|남녀|공용|상관\s*없|아무거나|모르|다\s*볼/;
const GIFT_CONTEXT = /선물|드릴|드리려|드리고|사\s*드|사드|줄\s*거|줄\s*옷|생일|기념일|답례/;

/** 부정되지 않은 자리에서 정규식이 한 번이라도 걸리는지 ("여성복 싫고" 같은 언급은 제외) */
function hasPositiveMatch(text: string, re: RegExp): boolean {
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (!isNegatedAt(text, start, start + m[0].length)) return true;
  }
  return false;
}

function combineApparel(men: boolean, women: boolean): ApparelFor | null {
  if (men && women) return "both";
  if (men) return "men";
  if (women) return "women";
  return null;
}

function firstMatch<T>(patterns: [T, RegExp][], text: string): T | null {
  for (const [value, re] of patterns) if (re.test(text)) return value;
  return null;
}

/**
 * '캠핑은 관심 없어요'처럼 부정한 단어는 빼고 분석합니다.
 * matchSentence(취향 vector 추출)와 같은 기준(maskNegatedWords)을 써서, 같은 문장이
 * 상황 정보(예: 전통/실용 선호)와 취향 vector에서 서로 다르게 해석되지 않도록 합니다.
 */
function positiveText(text: string): string {
  return maskNegatedWords(text);
}

/** 대화 전체에서 상황 정보를 추출합니다 (질문 slot을 힌트로 사용). */
export function extractSlots(messages: ChatMessage[]): InterviewSlots {
  const slots = emptySlots();
  const answered = new Set<InterviewSlot>();
  const taste = new Set<string>();
  let lastSlot: InterviewSlot | null = null;
  let wantsApparel = false;
  let men = false;
  let women = false;

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

    // 옷을 찾는지, 누가 입을 옷인지
    if (hasPositiveMatch(text, APPAREL_WORDS)) wantsApparel = true;
    const answeringApparel = target === "apparel_for";
    const relationCounts = answeringApparel || GIFT_CONTEXT.test(text);
    if (hasPositiveMatch(text, MEN_DIRECT) || (relationCounts && hasPositiveMatch(text, MEN_RELATION))) men = true;
    if (hasPositiveMatch(text, WOMEN_DIRECT) || (relationCounts && hasPositiveMatch(text, WOMEN_RELATION))) women = true;
    if (answeringApparel) {
      answered.add("apparel_for");
      if (APPAREL_BOTH.test(text)) {
        men = true;
        women = true;
      }
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
  slots.wantsApparel = wantsApparel;
  slots.apparelFor = combineApparel(men, women);
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
    case "apparel_for":
      // 옷을 찾는 게 아니면 물을 필요가 없습니다.
      return !slots.wantsApparel || Boolean(slots.apparelFor) || slots.answered.includes("apparel_for");
  }
}

/**
 * 질문 문장 은행 — 항목마다 여러 표현을 두고, 앞선 답변에 따라 골라 씁니다.
 * 같은 대화 안에서는 같은 문장이 나오도록(새로고침해도 흔들리지 않도록)
 * 대화 내용으로 만든 고정 값을 인덱스로 씁니다.
 */
type QuestionVariant = {
  /** {찾는것}에 앞서 사용자가 말한 내용을 넣습니다 */
  text: string;
  suggestions: string[];
  /** 이 표현을 쓸 조건 (없으면 언제나 사용 가능) */
  when?: (slots: InterviewSlots) => boolean;
};

/**
 * 답변 문장을 질문에 끼워 넣을 짧은 명사구로 다듬습니다.
 * "친구 생일 선물 찾고 있어요" → "친구 생일 선물"
 */
const LOOKING_TAIL =
  /\s*(을|를|이|가|은|는)?\s*(찾고\s*있어요|찾고\s*있습니다|찾으려고요|찾고\s*싶어요|찾아요|사려고요|사고\s*싶어요|살까\s*해요|보려고요|보고\s*있어요|구경하려고요|구경하고\s*싶어요|알아보고\s*있어요|필요해요|하나\s*사려고요|사려구요)\s*[.!]?\s*$/;

export function shortLookingFor(text: string | null): string {
  if (!text) return "";
  const trimmed = text.trim().replace(LOOKING_TAIL, "").replace(/\s*(을|를|이|가|은|는)\s*$/, "").trim();
  return trimmed.length >= 2 && trimmed.length <= 16 ? trimmed : "";
}

const hasLookingFor = (s: InterviewSlots) => Boolean(shortLookingFor(s.lookingFor));
// 목적을 아직 분류하지 못했을 때를 대비해 답변 문장에서도 단서를 찾습니다.
const isGift = (s: InterviewSlots) =>
  /gift|souvenir|birthday|anniversary|holiday|housewarming/.test(s.intent ?? "") ||
  /선물|드릴|드리려|드리고|줄\s*거|사드|기념일|생일|답례|보답/.test(s.lookingFor ?? "");
const isFood = (s: InterviewSlots) =>
  /food|meal|snack|coffee|grocery/.test(s.intent ?? "") || /먹|맛|음식|간식|커피|차\s|디저트|분식/.test(s.lookingFor ?? "");
/** 함께 둘러보는 상황 — 동행·분위기가 예산보다 먼저 */
const isOuting = (s: InterviewSlots) => /데이트|나들이|구경|놀러|산책|여행|가족\s*모임/.test(s.lookingFor ?? "");

export const QUESTION_BANK: Record<InterviewSlot, QuestionVariant[]> = {
  looking_for: [
    { text: "지금 중앙시장에서 무엇을 찾고 계세요?", suggestions: ["친구 생일 선물", "시장 먹거리 구경", "캠핑 용품", "집 꾸미기 소품"] },
    { text: "오늘 중앙시장에서 어떤 걸 보고 싶으세요?", suggestions: ["선물 고르기", "먹거리 구경", "생활용품", "구경만 할래요"] },
    { text: "어떤 물건이나 장소를 찾고 계신지 편하게 말씀해 주세요.", suggestions: ["옷·신발", "먹거리", "주방·살림", "아직 정하지 않았어요"] },
  ],
  budget: [
    { text: "{찾는것}, 예산은 어느 정도 생각하고 계세요?", suggestions: ["1만원 이하", "2만원 정도", "5만원 정도", "상관없어요"], when: hasLookingFor },
    { text: "선물 예산은 어느 정도로 잡고 계세요?", suggestions: ["1만원 이하", "2만원 정도", "5만원 정도", "상관없어요"], when: isGift },
    { text: "예산은 어느 정도 생각하고 계세요?", suggestions: ["1만원 이하", "2만원 정도", "5만원 정도", "상관없어요"] },
    { text: "가격대는 어느 정도가 편하실까요?", suggestions: ["저렴한 걸로", "2만원 정도", "좋은 거면 더 써도 돼요", "상관없어요"] },
  ],
  style: [
    { text: "받는 분이 좋아할 만한 건 대전만의 특별한 상품일까요, 실용적인 상품일까요?", suggestions: ["대전만의 독특한 상품", "실용적인 상품", "둘 다 좋아요"], when: isGift },
    { text: "맛으로 유명한 곳과 직접 만드는 곳 중 어느 쪽이 더 끌리세요?", suggestions: ["유명한 곳", "직접 만드는 곳", "둘 다 좋아요"], when: isFood },
    { text: "흔하지 않은 대전만의 상품과 실용적인 상품 중 어느 쪽을 더 선호하시나요?", suggestions: ["대전만의 독특한 상품", "실용적인 상품", "둘 다 좋아요"] },
    { text: "고를 때 특별함과 실용성 중 무엇을 더 보세요?", suggestions: ["특별한 게 좋아요", "실용적인 게 좋아요", "둘 다 좋아요"] },
  ],
  companion: [
    { text: "누구에게 줄 선물인가요?", suggestions: ["친구", "가족", "연인", "나를 위해"], when: isGift },
    { text: "누구와 함께 가시나요? 혹은 누구를 위한 건가요?", suggestions: ["나를 위해", "친구", "가족", "연인"] },
    { text: "혼자 가시나요, 아니면 같이 가는 분이 있으세요?", suggestions: ["혼자", "친구랑", "가족이랑", "연인이랑"] },
  ],
  taste: [
    { text: "평소 즐겨 드시는 음식이나 좋아하는 맛이 있으세요?", suggestions: ["분식", "전통 먹거리", "달달한 간식", "커피"], when: isFood },
    { text: "평소 좋아하는 것이나 취미가 있다면 알려주세요.", suggestions: ["커피", "캠핑", "빈티지", "전통 먹거리"] },
    { text: "요즘 관심 있는 것이 있다면 한두 가지만 알려주세요.", suggestions: ["커피", "캠핑", "빈티지", "집 꾸미기"] },
  ],
  apparel_for: [
    { text: "받는 분은 남성인가요, 여성인가요?", suggestions: ["남성", "여성", "잘 모르겠어요"], when: isGift },
    { text: "남성 옷을 찾으세요, 여성 옷을 찾으세요?", suggestions: ["남성 옷", "여성 옷", "둘 다 볼래요"] },
    { text: "누가 입을 옷인가요? 남성용과 여성용 중에 알려 주세요.", suggestions: ["남성용", "여성용", "둘 다"] },
  ],
  discovery: [
    { text: "처음 가 보는 숨은 가게도 괜찮으세요, 아니면 잘 알려진 가게가 좋으세요?", suggestions: ["숨은 가게 좋아요", "잘 알려진 곳이 좋아요", "상관없어요"] },
    { text: "잘 알려진 곳 위주로 볼까요, 새로운 곳도 섞어 볼까요?", suggestions: ["새로운 곳도 좋아요", "알려진 곳이 좋아요", "상관없어요"] },
  ],
};

/** 대화 내용으로 만드는 고정 값 — 같은 대화면 항상 같은 표현이 나옵니다. */
function conversationSeed(messages: ChatMessage[]): number {
  const text = messages.map((m) => m.text).join("|");
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 100_000;
  return h;
}

/** 항목별 질문 고르기 — 조건에 맞는 표현 중에서 대화 고정 값으로 하나를 선택합니다. */
export function questionFor(slot: InterviewSlot, slots: InterviewSlots, seed: number): { text: string; suggestions: string[] } {
  const all = QUESTION_BANK[slot];
  const fitted = all.filter((v) => v.when?.(slots));
  const general = all.filter((v) => !v.when);
  const pool = fitted.length ? fitted : general;
  const chosen = pool[seed % pool.length] ?? general[0]!;
  const looking = shortLookingFor(slots.lookingFor);
  return { text: chosen.text.replace("{찾는것}", looking || "찾으시는 것"), suggestions: chosen.suggestions };
}

/** 이전 버전 호환용 기본 문장 (테스트·문서에서 참조) */
export const RULE_QUESTIONS: Record<InterviewSlot, { text: string; suggestions: string[] }> = Object.fromEntries(
  (Object.keys(QUESTION_BANK) as InterviewSlot[]).map((slot) => {
    const general = QUESTION_BANK[slot].find((v) => !v.when)!;
    return [slot, { text: general.text.replace("{찾는것}", "찾으시는 것"), suggestions: general.suggestions }];
  }),
) as Record<InterviewSlot, { text: string; suggestions: string[] }>;

/**
 * 목적별 질문 순서.
 * 그 상황에서 추천 품질을 가장 크게 가르는 항목을 앞에 둡니다.
 * (예: 선물은 '누구에게'가, 먹거리는 '입맛'이, 혼수·한복은 '누구와 함께'가 예산보다 중요)
 */
const ORDER_BY_INTENT: Record<string, InterviewSlot[]> = {
  // 선물류 — 받는 사람이 먼저
  gift: ["looking_for", "companion", "budget", "style", "discovery", "taste"],
  // 먹거리·커피 — 가격대 차이가 작아 입맛이 먼저
  food: ["looking_for", "taste", "style", "companion", "discovery", "budget"],
  // 옷·신발·잡화 — 예산과 스타일이 핵심
  fashion: ["looking_for", "budget", "style", "companion", "discovery", "taste"],
  // 살림·주방 — 실용/특별 취향이 예산보다 먼저
  living: ["looking_for", "style", "budget", "taste", "discovery", "companion"],
  // 한복·혼수·전통 — 누구와 함께 쓰는지가 먼저
  traditional: ["looking_for", "companion", "style", "budget", "discovery", "taste"],
  // 캠핑·야외 — 어디에 쓰는지(취향)가 먼저
  outdoor: ["looking_for", "taste", "budget", "style", "discovery", "companion"],
  // 빈티지·구경 — 발견 취향이 먼저
  browse: ["looking_for", "discovery", "taste", "style", "budget", "companion"],
};

/** 감지한 목적을 질문 순서 묶음으로 매핑합니다. */
function orderKeyFor(slots: InterviewSlots): keyof typeof ORDER_BY_INTENT | null {
  const intent = slots.intent ?? "";
  if (/gift|souvenir|birthday|anniversary|holiday|housewarming/.test(intent)) return "gift";
  if (/market_food|coffee|grocery/.test(intent)) return "food";
  if (/fashion/.test(intent)) return "fashion";
  if (/home_living|kitchen_goods|craft_supplies|daily/.test(intent)) return "living";
  if (/traditional_goods|wedding_goods/.test(intent)) return "traditional";
  if (/outdoor_gear/.test(intent)) return "outdoor";
  if (/market_tour|vintage_finds/.test(intent)) return "browse";
  // 목적 분류가 비어 있으면 답변 문장에 드러난 단서로 판단합니다.
  if (isGift(slots)) return "gift";
  if (isFood(slots)) return "food";
  if (isOuting(slots)) return "browse";
  return null;
}

/**
 * 다음에 물을 항목 — 앞선 답변에 따라 순서가 달라집니다.
 * 감지한 목적이 없으면 찾는 것 → 예산 → 스타일 기본 순서를 씁니다.
 */
export function slotOrderFor(slots: InterviewSlots): InterviewSlot[] {
  const key = orderKeyFor(slots);
  const base: InterviewSlot[] = key ? ORDER_BY_INTENT[key]! : [...CORE_SLOTS, "taste", "discovery", "companion"];
  // 옷을 찾는다면 남성/여성을 먼저 알아야 추천이 갈립니다(원본 데이터가 남성복·여성복으로 나뉨).
  // 옷이 아니면 isSlotFilled가 true를 돌려주므로 이 항목은 자동으로 건너뜁니다.
  return ["looking_for", "apparel_for", ...base.filter((s) => s !== "looking_for" && s !== "apparel_for")];
}

export function nextRuleSlot(slots: InterviewSlots, answeredCount: number, askedSlots: InterviewSlot[]): InterviewSlot | null {
  const order = slotOrderFor(slots);
  const pending = order.filter((s) => !isSlotFilled(slots, s) && !askedSlots.includes(s));
  if (pending.length === 0) return null;
  // 최소 답변 수를 채우기 전에는 계속 묻고, 채운 뒤에는 핵심 항목만 남았을 때 묻습니다.
  // 최소 답변 뒤에도 '누가 입을 옷인지'는 추천을 크게 가르므로 핵심 항목처럼 물어봅니다.
  if (answeredCount >= MIN_ANSWERS) return pending.find((s) => CORE_SLOTS.includes(s) || s === "apparel_for") ?? null;
  return pending[0]!;
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

/** 맞장구 — 직전 답변의 성격에 맞춰 고릅니다(무조건 "좋아요!"만 나오지 않도록). */
const ACK_GENERAL = ["좋아요!", "알겠어요.", "그렇군요.", "네, 참고할게요.", "잘 알겠습니다."];
const ACK_BY_SLOT: Partial<Record<InterviewSlot, string[]>> = {
  looking_for: ["좋아요, 찾아볼게요!", "네, 그쪽으로 살펴볼게요."],
  budget: ["예산 참고할게요.", "그 가격대로 맞춰 볼게요."],
  style: ["취향 알겠어요.", "그런 스타일로 찾아볼게요."],
  companion: ["누구와 함께인지 알겠어요.", "네, 참고할게요."],
  taste: ["좋은 정보예요.", "취향 잘 알겠어요."],
  discovery: ["알겠어요.", "네, 반영할게요."],
  apparel_for: ["네, 그 옷으로 찾아볼게요.", "알겠어요, 거기에 맞춰 볼게요."],
};

function ackFor(lastSlot: InterviewSlot | null, seed: number): string {
  const pool = (lastSlot && ACK_BY_SLOT[lastSlot]) || ACK_GENERAL;
  return pool[seed % pool.length]!;
}

/** 다음 질문 고르기 — 아직 듣지 못한 항목을 순서대로, 최대 6개까지 */
export function ruleInterviewTurn(messages: ChatMessage[]) {
  const state = interviewState(messages);
  const seed = conversationSeed(messages);
  // 직전에 물었던 항목에 맞춰 맞장구를 고릅니다.
  const lastAsked = [...messages].reverse().find((m) => m.role === "assistant" && m.slot)?.slot ?? null;
  const ack = ackFor(lastAsked, seed);
  if (state.done || !state.next) {
    const looking = shortLookingFor(state.slots.lookingFor);
    const closing = looking
      ? `${ack} 말씀해 주신 '${looking}' 기준으로 분석할 준비가 됐어요. 아래 [대화 내용으로 분석하기]를 눌러 주세요.`
      : `${ack} 말씀해 주신 내용으로 취향을 분석할 준비가 됐어요. 아래 [대화 내용으로 분석하기]를 눌러 주세요.`;
    return { ...state, reply: closing, slot: null, done: true, suggestions: [] as string[] };
  }
  const q = questionFor(state.next, state.slots, seed);
  return { ...state, reply: `${ack} ${q.text}`, slot: state.next, done: false, suggestions: q.suggestions };
}
