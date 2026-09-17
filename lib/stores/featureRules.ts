/**
 * 점포 유형(엑셀 '점포 유형')과 비고에 적힌 품목만으로 추천용 성향 vector를 추정합니다.
 * - 점포명으로 품목을 추측하지 않습니다. (예: '생선골목'의 유형은 '주방용품'이므로 주방용품으로만 해석)
 * - 수치는 추천 계산용 추정치이며, 사실 정보처럼 표시하지 않습니다.
 */
import { emptyVector, round3, TASTE_KEYS, type TasteKey, type TasteVector } from "@/lib/recommendation/dimensions";
import type { MarketFeatures, StoreCategory, StoreFeatures, StoreSeed } from "./types";

type TokenRule = {
  tokens: string[];
  category: StoreCategory;
  taste: Partial<Record<TasteKey, number>>;
};

const TOKEN_RULES: TokenRule[] = [
  {
    tokens: ["여성의류", "여성복", "숙녀복", "의류", "의류 노점", "남성·여성 의류"],
    category: "패션·의류",
    taste: { fashion: 0.9, practical: 0.5, gift: 0.25, family: 0.3, date: 0.2, vintage: 0.2, local: 0.45 },
  },
  { tokens: ["란제리"], category: "패션·의류", taste: { fashion: 0.6, accessory: 0.4, practical: 0.45 } },
  {
    tokens: ["한복"],
    category: "한복·원단·수예",
    taste: { traditional: 0.95, fashion: 0.55, gift: 0.5, family: 0.6, date: 0.3, travel: 0.35, local: 0.6, craft: 0.25 },
  },
  {
    tokens: ["주단"],
    category: "한복·원단·수예",
    taste: { traditional: 0.75, craft: 0.7, fashion: 0.35, vintage: 0.45, gift: 0.3, local: 0.5 },
  },
  {
    tokens: ["원단", "면직물"],
    category: "한복·원단·수예",
    taste: { craft: 0.9, living: 0.35, practical: 0.45, vintage: 0.4, fashion: 0.3 },
  },
  {
    tokens: ["수예"],
    category: "한복·원단·수예",
    taste: { craft: 0.9, vintage: 0.5, living: 0.45, gift: 0.35, traditional: 0.3 },
  },
  { tokens: ["침구"], category: "리빙·침구", taste: { living: 0.9, family: 0.65, practical: 0.6, gift: 0.3 } },
  {
    tokens: ["커튼", "인테리어"],
    category: "리빙·침구",
    taste: { living: 0.95, practical: 0.45, vintage: 0.25, family: 0.4 },
  },
  {
    tokens: ["주방용품"],
    category: "주방·식기",
    taste: { kitchen: 0.95, practical: 0.8, family: 0.55, living: 0.4, camping: 0.3, coffee: 0.15, gift: 0.25 },
  },
  {
    tokens: ["식기", "주방식기"],
    category: "주방·식기",
    taste: { kitchen: 0.9, practical: 0.65, family: 0.5, living: 0.45, coffee: 0.3, gift: 0.45, vintage: 0.25, camping: 0.2 },
  },
  {
    tokens: ["가방", "지갑", "벨트"],
    category: "잡화·소품",
    taste: { accessory: 0.95, fashion: 0.55, gift: 0.6, practical: 0.45, travel: 0.35, date: 0.3 },
  },
  { tokens: ["패션잡화"], category: "잡화·소품", taste: { accessory: 0.9, fashion: 0.55, gift: 0.5, practical: 0.4 } },
  {
    tokens: ["패션소품", "머리핀"],
    category: "잡화·소품",
    taste: { accessory: 0.85, fashion: 0.6, gift: 0.45, date: 0.25 },
  },
  {
    tokens: ["잡화", "액세서리"],
    category: "잡화·소품",
    taste: { accessory: 0.9, gift: 0.55, fashion: 0.45, practical: 0.45 },
  },
  {
    tokens: ["양말"],
    category: "잡화·소품",
    taste: { accessory: 0.7, practical: 0.85, fashion: 0.35, gift: 0.35, family: 0.4, camping: 0.2 },
  },
  { tokens: ["모자", "우산"], category: "잡화·소품", taste: { accessory: 0.6, practical: 0.5, travel: 0.3, camping: 0.25 } },
  { tokens: ["공예품"], category: "잡화·소품", taste: { craft: 0.7, gift: 0.6, traditional: 0.45, travel: 0.45 } },
  { tokens: ["귀금속", "금은방"], category: "잡화·소품", taste: { accessory: 0.8, gift: 0.8, date: 0.55, family: 0.35 } },
  { tokens: ["식품"], category: "먹거리", taste: { food: 0.65, family: 0.55, practical: 0.5, local: 0.55, gift: 0.3 } },
  {
    tokens: ["과일"],
    category: "먹거리",
    taste: { food: 0.55, dessert: 0.5, family: 0.6, gift: 0.5, local: 0.5, practical: 0.35 },
  },
  { tokens: ["팥"], category: "먹거리", taste: { traditional: 0.5, food: 0.45, dessert: 0.35 } },
  { tokens: ["꽁치"], category: "먹거리", taste: { food: 0.55, kitchen: 0.35, local: 0.4 } },
  { tokens: ["서적"], category: "복합 상가", taste: { gift: 0.2, vintage: 0.2 } },
  {
    tokens: ["음식점", "한식"],
    category: "먹거리",
    taste: { food: 0.95, local: 0.8, traditional: 0.5, family: 0.6, travel: 0.55, date: 0.3, practical: 0.4 },
  },
  { tokens: ["만두"], category: "먹거리", taste: { food: 0.9, dessert: 0.3, local: 0.7, travel: 0.45 } },
  {
    tokens: ["순대", "설렁탕"],
    category: "먹거리",
    taste: { food: 0.95, local: 0.85, traditional: 0.55, travel: 0.55, family: 0.5 },
  },
  {
    tokens: ["분식", "떡볶이"],
    category: "먹거리",
    taste: { food: 0.8, dessert: 0.65, date: 0.5, local: 0.65, travel: 0.45, practical: 0.55 },
  },
  {
    tokens: ["치킨", "닭강정"],
    category: "먹거리",
    taste: { food: 0.85, dessert: 0.45, date: 0.45, family: 0.55, travel: 0.5, local: 0.55, gift: 0.25 },
  },
  { tokens: ["시장 관리", "상인회"], category: "시장 안내", taste: { local: 0.8, travel: 0.5 } },
];

/** 비고에서 품목으로 인정하는 단어 (원문에 적힌 경우에만 사용) */
const NOTE_PRODUCT_WORDS = ["가방", "지갑", "벨트", "머리핀", "란제리", "팥", "순대", "설렁탕", "금은방", "꽁치", "양말", "모자", "우산", "공예품"];

export function splitTypeTokens(storeType: string): string[] {
  const t = storeType.trim();
  if (t === "의류 노점") return ["의류 노점"];
  if (t === "시장 관리·상인회") return ["시장 관리", "상인회"];
  return t
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function noteProductWords(note: string): string[] {
  // '노점(상인명: …)', '공식 안내 대표번호가 0000 표기' 같은 메타 정보는 품목으로 보지 않습니다.
  const isProductList = /포함$/.test(note.trim()) || /^[가-힣]+(·[가-힣]+)+$/.test(note.trim());
  if (!isProductList) return [];
  return NOTE_PRODUCT_WORDS.filter((w) => note.includes(w));
}

function findRule(token: string): TokenRule | undefined {
  return TOKEN_RULES.find((r) => r.tokens.includes(token));
}

function marketFeatures(seed: StoreSeed, isFood: boolean, isTraditionalGoods: boolean): MarketFeatures {
  const representativeness = {
    association: 0.9,
    arcade: 0.75,
    product_zone: 0.65,
    store: 0.5,
    street_vendor: 0.45,
  }[seed.entityKind];
  const specialized = /골목|거리|통$/.test(seed.name)
    ? 0.85
    : { product_zone: 0.85, arcade: 0.7, street_vendor: 0.4, store: 0.35, association: 0.3 }[seed.entityKind];
  // 역사성은 개별 점포 연혁 데이터가 없으므로 '중앙시장 공통' 기반값에 품목 성격만 소폭 반영합니다.
  const historicalness = 0.55 + (isTraditionalGoods ? 0.15 : 0) + (isFood ? 0.05 : 0);
  const locality = 0.7 + (isFood ? 0.15 : 0) + (seed.entityKind === "street_vendor" ? 0.1 : 0);
  // 로컬 체험: 시장 먹거리·노점·전통 품목·골목 상권 구경처럼 '시장에서만' 할 수 있는 경험의 정도
  const localExperience =
    0.5 +
    (isFood ? 0.25 : 0) +
    (seed.entityKind === "street_vendor" ? 0.15 : 0) +
    (isTraditionalGoods ? 0.2 : 0) +
    (seed.entityKind === "product_zone" || seed.entityKind === "arcade" ? 0.1 : 0);
  return {
    market_representativeness: round3(representativeness),
    historicalness: round3(Math.min(1, historicalness)),
    local_experience: round3(Math.min(1, localExperience)),
    specialized_street: round3(specialized),
    locality: round3(Math.min(1, locality)),
  };
}

function exposureFor(seed: StoreSeed): number {
  switch (seed.entityKind) {
    case "association":
      return 0.9;
    case "arcade":
      return 0.65;
    case "product_zone":
      return 0.55;
    case "street_vendor":
      return 0.2;
    case "store":
      if (seed.source.includes("맛집")) return 0.6;
      if (seed.source.includes("공개 점포")) return 0.5;
      return 0.3;
  }
}

export function buildStoreFeatures(seed: StoreSeed): StoreFeatures {
  const typeTokens = splitTypeTokens(seed.storeType);
  const noteWords = noteProductWords(seed.note);
  const tokens = [...new Set([...typeTokens, ...noteWords])];

  const taste: TasteVector = emptyVector();
  const categories: StoreCategory[] = [];
  const unmatched: string[] = [];
  for (const token of tokens) {
    const rule = findRule(token);
    if (!rule) {
      unmatched.push(token);
      continue;
    }
    if (!categories.includes(rule.category)) categories.push(rule.category);
    for (const key of TASTE_KEYS) {
      const w = rule.taste[key] ?? 0;
      if (w > taste[key]) taste[key] = w;
    }
  }
  if (unmatched.length > 0) {
    throw new Error(`[featureRules] '${seed.name}'의 유형 토큰을 해석할 수 없습니다: ${unmatched.join(", ")}`);
  }

  const typeCategories = typeTokens.map((t) => findRule(t)!.category);
  const distinctTypeCategories = [...new Set(typeCategories)].filter((c) => c !== "복합 상가");
  const primaryCategory: StoreCategory =
    distinctTypeCategories.length >= 3 ? "복합 상가" : (distinctTypeCategories[0] ?? typeCategories[0]);
  const withoutMixed = categories.filter((c) => c !== "복합 상가");
  categories.length = 0;
  categories.push(...(primaryCategory === "복합 상가" ? ["복합 상가" as const, ...withoutMixed] : withoutMixed));

  // 시장 경험(local) 성향은 모든 점포에 기본값을 둡니다(중앙시장 내 위치라는 사실 기반).
  taste.local = Math.max(taste.local, 0.4);
  for (const key of TASTE_KEYS) taste[key] = round3(taste[key]);

  const isFood = categories.includes("먹거리");
  const isTraditionalGoods = typeTokens.some((t) => ["한복", "주단", "수예"].includes(t));
  const recommendable = seed.entityKind !== "association";

  return {
    storeId: seed.id,
    primaryCategory,
    categories,
    taste,
    market: marketFeatures(seed, isFood, isTraditionalGoods),
    exposure: exposureFor(seed),
    tags: tokens,
    productHints: tokens
      .map((t) => (t === "의류 노점" ? "의류" : t))
      .filter((t) => !["시장 관리", "상인회", "음식점"].includes(t)),
    recommendable,
    rationale: recommendable
      ? `점포 유형(${seed.storeType})${noteWords.length ? `과 비고의 품목(${noteWords.join("·")})` : ""}을 바탕으로 추정한 추천 성향입니다. 실제 취급 품목과 영업 여부는 방문 전 확인이 필요합니다.`
      : "시장 관리·고객 문의 창구로, 개인화 추천 대상에서는 제외하고 지도에만 표시합니다.",
  };
}
