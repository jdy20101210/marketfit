/**
 * 원본 소분류(categories)와 품목(items)만으로 추천용 성향 vector를 추정합니다.
 * - 점포명으로 품목을 추측하지 않습니다. (예: '구제나라'의 품목이 '여성복, 캐주얼'이면 빈티지로 보지 않음)
 * - 수치는 추천 계산용 추정치이며(inferredBy: "rule"), 사실 정보처럼 표시하지 않습니다.
 */
import { clamp01, emptyVector, round3, TASTE_KEYS, type TasteKey, type TasteVector } from "@/lib/recommendation/dimensions";
import { displayCategory } from "./parse";
import type { MarketFeatures, StoreActivity, StoreFeatures, StoreSeed } from "./types";

type Weights = Partial<Record<TasteKey, number>>;

/** 소분류별 기본 성향 (원본 34개 소분류 전부) */
export const SUB_CATEGORY_RULES: Record<string, Weights> = {
  // 식품•요리
  "떡•빵•김밥•치킨•즉석음식": { food: 0.8, dessert: 0.6, local: 0.65, travel: 0.45, date: 0.35, family: 0.4, practical: 0.4, price_sensitive: 0.6, discovery: 0.35 },
  "과자•음료•술•담배•마트물": { dessert: 0.6, food: 0.4, practical: 0.45, local: 0.45, travel: 0.35, price_sensitive: 0.55 },
  건강기능식품: { food: 0.6, traditional: 0.55, family: 0.55, gift: 0.45, practical: 0.5, local: 0.5, price_sensitive: 0.35 },
  "수산물•생선": { food: 0.75, kitchen: 0.55, family: 0.55, local: 0.6, practical: 0.5, price_sensitive: 0.45 },
  "건어물•반찬": { food: 0.75, kitchen: 0.5, traditional: 0.5, gift: 0.6, family: 0.6, local: 0.7, practical: 0.55, price_sensitive: 0.5, travel: 0.3 },
  "축산물•정육": { food: 0.75, kitchen: 0.6, family: 0.65, camping: 0.35, practical: 0.5, local: 0.45, price_sensitive: 0.4 },
  "농산물•쌀•채소": { food: 0.65, kitchen: 0.55, family: 0.6, practical: 0.6, local: 0.6, price_sensitive: 0.65, traditional: 0.3 },
  "청과물•과일": { food: 0.55, dessert: 0.45, family: 0.6, gift: 0.5, local: 0.5, practical: 0.45, price_sensitive: 0.5 },
  "식당•주점•카페": { food: 0.9, local: 0.75, travel: 0.55, family: 0.5, date: 0.4, traditional: 0.4, practical: 0.35, price_sensitive: 0.45 },
  // 의류•패션
  속옷: { fashion: 0.6, practical: 0.85, accessory: 0.3, family: 0.45, price_sensitive: 0.6, gift: 0.2 },
  가방: { accessory: 0.95, fashion: 0.55, gift: 0.6, practical: 0.45, travel: 0.35, date: 0.3, price_sensitive: 0.35 },
  "잡화•악세서리": { accessory: 0.9, gift: 0.55, fashion: 0.45, practical: 0.55, price_sensitive: 0.55, discovery: 0.35 },
  한복: { traditional: 0.95, fashion: 0.55, gift: 0.45, family: 0.65, date: 0.3, travel: 0.3, local: 0.55, craft: 0.3, price_sensitive: 0.15 },
  여성복: { fashion: 0.9, practical: 0.5, family: 0.3, date: 0.25, local: 0.4, price_sensitive: 0.5, gift: 0.2 },
  남성복: { fashion: 0.85, practical: 0.6, family: 0.3, local: 0.35, price_sensitive: 0.55, gift: 0.2 },
  신발: { fashion: 0.6, accessory: 0.55, practical: 0.75, family: 0.4, travel: 0.35, camping: 0.25, price_sensitive: 0.5, gift: 0.25 },
  "스포츠•아웃도어": { camping: 0.95, travel: 0.6, practical: 0.6, fashion: 0.35, discovery: 0.35, price_sensitive: 0.35 },
  "귀금속•시계": { accessory: 0.85, gift: 0.9, date: 0.65, family: 0.5, traditional: 0.2, price_sensitive: 0.05 },
  화장품: { accessory: 0.5, gift: 0.55, date: 0.3, practical: 0.35, fashion: 0.4, price_sensitive: 0.35 },
  "유니폼•드레스•특수": { fashion: 0.45, craft: 0.55, practical: 0.55, discovery: 0.4, traditional: 0.2 },
  구제의류: { vintage: 0.95, fashion: 0.75, discovery: 0.85, price_sensitive: 0.7, date: 0.3, local: 0.45 },
  "헤어•피부•네일•타투": { practical: 0.5, fashion: 0.45, local: 0.4, date: 0.2 },
  // 주거•생활
  "가구•인테리어 소품": { living: 0.85, traditional: 0.5, vintage: 0.45, gift: 0.35, discovery: 0.45 },
  "그릇•주방용품": { kitchen: 0.95, practical: 0.75, family: 0.55, living: 0.45, coffee: 0.25, gift: 0.35, camping: 0.25, price_sensitive: 0.55 },
  "문구•완구•공예": { craft: 0.75, family: 0.45, gift: 0.4, practical: 0.5, discovery: 0.45, price_sensitive: 0.5 },
  생활용품: { practical: 0.9, living: 0.6, family: 0.5, price_sensitive: 0.65, kitchen: 0.3 },
  "수예•자수": { craft: 0.95, vintage: 0.5, living: 0.35, gift: 0.35, traditional: 0.35, discovery: 0.45 },
  "예단•이바지": { traditional: 0.95, gift: 0.85, family: 0.8, food: 0.5, local: 0.55 },
  "원단•포목•지업": { craft: 0.85, living: 0.45, practical: 0.5, traditional: 0.3, vintage: 0.3, discovery: 0.35 },
  "이불•침구": { living: 0.9, family: 0.65, practical: 0.6, gift: 0.35, traditional: 0.2, price_sensitive: 0.35 },
  "조명•꽃": { living: 0.8, gift: 0.45, date: 0.3, practical: 0.45 },
  커텐: { living: 0.95, practical: 0.45, family: 0.4, vintage: 0.2 },
  // 근린•서비스
  "학원•서점": { discovery: 0.4, family: 0.45, local: 0.45, vintage: 0.35, gift: 0.3, practical: 0.35 },
};

/** 품목 단어별 성향 (원본 품목에 적힌 경우에만 반영) */
const ITEM_RULES: { words: string[]; weights: Weights }[] = [
  { words: ["커피", "커피숍"], weights: { coffee: 0.95, dessert: 0.4, date: 0.45, travel: 0.35, local: 0.5 } },
  { words: ["차", "음료"], weights: { coffee: 0.55, dessert: 0.4, traditional: 0.25 } },
  { words: ["골동품"], weights: { vintage: 0.95, discovery: 0.85, traditional: 0.5, gift: 0.35 } },
  { words: ["식혜"], weights: { traditional: 0.6, dessert: 0.6, local: 0.6 } },
  { words: ["호떡", "꽈배기", "도넛", "붕어빵", "빵", "길쭉이치즈씨앗호떡"], weights: { dessert: 0.9, food: 0.5, date: 0.45, travel: 0.5, discovery: 0.45, local: 0.7 } },
  { words: ["과일쥬스"], weights: { dessert: 0.65, coffee: 0.3, travel: 0.4, date: 0.35 } },
  { words: ["스낵", "마트"], weights: { dessert: 0.45, practical: 0.6, price_sensitive: 0.6 } },
  { words: ["김밥", "어묵", "오뎅", "떡볶이", "튀김", "분식", "부침", "부침개", "녹두빈대떡", "죽", "국수", "누룽지"], weights: { food: 0.85, dessert: 0.5, local: 0.75, travel: 0.5, price_sensitive: 0.6 } },
  { words: ["떡"], weights: { dessert: 0.75, traditional: 0.6, gift: 0.45, local: 0.7, food: 0.5, travel: 0.35 } },
  { words: ["치킨", "닭"], weights: { food: 0.85, date: 0.45, family: 0.55, travel: 0.45, dessert: 0.3 } },
  { words: ["족발", "수육", "편육"], weights: { food: 0.9, family: 0.55, date: 0.35, local: 0.6 } },
  { words: ["햄버거"], weights: { food: 0.7, dessert: 0.3, discovery: 0.35 } },
  { words: ["이바지음식", "이바지", "폐백"], weights: { traditional: 0.95, gift: 0.85, family: 0.85, local: 0.6 } },
  { words: ["마늘", "단무지", "된장", "된당", "고추장", "쌈장", "간장", "두부", "토종된장", "젓갈"], weights: { food: 0.65, kitchen: 0.6, traditional: 0.65, family: 0.55, local: 0.65 } },
  { words: ["채소", "야채", "야채류", "나물", "곡물", "잡곡", "곡식", "농산물"], weights: { food: 0.6, kitchen: 0.55, practical: 0.6, family: 0.55, price_sensitive: 0.65 } },
  { words: ["청과", "과일"], weights: { food: 0.5, dessert: 0.5, gift: 0.45, family: 0.55 } },
  { words: ["꽃", "생화", "식물"], weights: { living: 0.7, gift: 0.8, date: 0.6, discovery: 0.4 } },
  { words: ["생선", "수산물", "해물", "민물고기", "꽃게장"], weights: { food: 0.75, kitchen: 0.55, local: 0.6, family: 0.5 } },
  { words: ["홍어무침"], weights: { food: 0.75, traditional: 0.55, local: 0.75, discovery: 0.5 } },
  { words: ["건어물", "반찬", "반찬류", "김", "구운 김", "김구이", "물엿"], weights: { food: 0.7, kitchen: 0.5, gift: 0.55, traditional: 0.45, local: 0.65, travel: 0.35 } },
  { words: ["건강식품", "한약재", "건강도시락"], weights: { traditional: 0.6, family: 0.6, gift: 0.55, food: 0.5 } },
  { words: ["정육점", "축산물"], weights: { food: 0.75, kitchen: 0.6, family: 0.6, camping: 0.35 } },
  { words: ["식당", "한식", "요식업", "식사", "칼국수", "오리탕", "옻계탕", "삼계탕", "보신탕", "추어탕"], weights: { food: 0.95, local: 0.8, traditional: 0.55, travel: 0.6, family: 0.55 } },
  { words: ["노점"], weights: { local: 0.8, discovery: 0.5, price_sensitive: 0.6 } },
  { words: ["속옷", "내의", "내의류"], weights: { practical: 0.85, fashion: 0.55, family: 0.45 } },
  { words: ["양말", "스타킹", "장갑"], weights: { practical: 0.85, accessory: 0.55, gift: 0.3, family: 0.4 } },
  { words: ["방한장갑", "우비"], weights: { practical: 0.8, camping: 0.4, travel: 0.35, accessory: 0.5 } },
  { words: ["스카프", "넥타이", "모자", "우산", "우양산", "액세서리", "악세사리", "패션잡화"], weights: { accessory: 0.85, gift: 0.55, fashion: 0.5 } },
  { words: ["가방", "핸드백", "지갑", "벨트", "피혁"], weights: { accessory: 0.95, gift: 0.6, fashion: 0.5 } },
  { words: ["가방수선"], weights: { practical: 0.8, accessory: 0.5, discovery: 0.3 } },
  { words: ["공예품"], weights: { craft: 0.75, gift: 0.65, traditional: 0.5, travel: 0.45, discovery: 0.5 } },
  { words: ["인테리어 소품", "소품"], weights: { living: 0.8, gift: 0.55, vintage: 0.4, discovery: 0.35 } },
  { words: ["주방기구", "주방용품", "그릇", "그릇 도소매", "빈상", "생활잡기"], weights: { kitchen: 0.85, practical: 0.75, family: 0.5 } },
  { words: ["생활용품"], weights: { practical: 0.85, living: 0.55, kitchen: 0.4 } },
  { words: ["한복", "한복지", "두루마기"], weights: { traditional: 0.95, fashion: 0.5, family: 0.6 } },
  { words: ["어린이한복", "아동화"], weights: { family: 0.85, gift: 0.5 } },
  { words: ["개량한복"], weights: { traditional: 0.8, fashion: 0.7, travel: 0.4, date: 0.35 } },
  { words: ["승복"], weights: { traditional: 0.7, discovery: 0.35 } },
  { words: ["속치마"], weights: { traditional: 0.7, practical: 0.5 } },
  { words: ["주단", "비단"], weights: { traditional: 0.85, craft: 0.6, gift: 0.45 } },
  { words: ["포목", "천", "옷감", "광목", "원단판매", "직물", "나염", "프린트", "의류부자재"], weights: { craft: 0.85, practical: 0.5 } },
  { words: ["방수천", "천막"], weights: { practical: 0.75, camping: 0.5, craft: 0.45 } },
  { words: ["수예", "수예품", "자수", "단추", "손뜨개", "레이스", "털실", "수편사", "실", "퀼트부속 홈패션재료"], weights: { craft: 0.95, vintage: 0.45, discovery: 0.45, gift: 0.3 } },
  { words: ["천마스크 맞춤바느질", "여성복제작"], weights: { craft: 0.6, practical: 0.5, discovery: 0.35 } },
  { words: ["이불", "침구", "침구류", "이불커버"], weights: { living: 0.9, family: 0.65 } },
  { words: ["손누비"], weights: { traditional: 0.6, craft: 0.55, living: 0.8 } },
  { words: ["앞치마"], weights: { kitchen: 0.5, practical: 0.6 } },
  { words: ["커튼", "커텐", "브라인드류", "인테리어", "홈패션", "커텐제작판매"], weights: { living: 0.95, practical: 0.45 } },
  { words: ["여성복", "여성의류", "숙녀복", "캐주얼", "의류", "남성복", "남성"], weights: { fashion: 0.85 } },
  { words: ["작업복"], weights: { practical: 0.85, fashion: 0.5 } },
  { words: ["양복점"], weights: { fashion: 0.8, gift: 0.35, family: 0.35 } },
  { words: ["구제", "구제의류"], weights: { vintage: 0.95, discovery: 0.85, price_sensitive: 0.7, fashion: 0.6 } },
  { words: ["신발", "운동화", "구두", "샌들", "숙녀화", "특수화", "기능성신발"], weights: { fashion: 0.55, practical: 0.75 } },
  { words: ["장화"], weights: { practical: 0.8, camping: 0.4 } },
  { words: ["등산장비", "레저용품"], weights: { camping: 0.95, travel: 0.65 } },
  { words: ["귀금속", "시계"], weights: { gift: 0.9, accessory: 0.85, date: 0.65 } },
  { words: ["예물"], weights: { gift: 0.9, family: 0.65, traditional: 0.35, date: 0.6 } },
  { words: ["화장품"], weights: { gift: 0.55, accessory: 0.5, date: 0.35 } },
  { words: ["불교용품"], weights: { traditional: 0.6, discovery: 0.45 } },
  { words: ["미용실"], weights: { practical: 0.5, local: 0.45 } },
  { words: ["서점", "책"], weights: { discovery: 0.4, vintage: 0.35, family: 0.45, gift: 0.35 } },
  { words: ["문구"], weights: { craft: 0.6, family: 0.55, practical: 0.6, gift: 0.35 } },
  { words: ["조명", "전기재료"], weights: { living: 0.8, practical: 0.7 } },
  { words: ["도배", "장판"], weights: { living: 0.8, practical: 0.8 } },
  { words: ["수건", "타올"], weights: { practical: 0.85, living: 0.6, gift: 0.45 } },
  { words: ["상", "병풍"], weights: { traditional: 0.85, living: 0.75, vintage: 0.55, gift: 0.35 } },
  { words: ["잡화", "잡화류", "일반잡화", "잡화(도소매)"], weights: { accessory: 0.7, practical: 0.6 } },
  { words: ["도소매", "소매", "잡화(도소매)", "그릇 도소매"], weights: { price_sensitive: 0.7 } },
];

/** 판매 품목이 아닌 사업 형태 표기 (성향에 반영하지 않음) */
const NON_PRODUCT_WORDS = new Set(["전자상거래업"]);

const ITEM_INDEX = new Map<string, Weights[]>();
for (const rule of ITEM_RULES) {
  for (const w of rule.words) ITEM_INDEX.set(w, [...(ITEM_INDEX.get(w) ?? []), rule.weights]);
}

export function unmatchedItems(items: string[]): string[] {
  return items.filter((i) => !ITEM_INDEX.has(i) && !NON_PRODUCT_WORDS.has(i));
}

function applyMax(target: TasteVector, weights: Weights, scale = 1) {
  for (const [k, v] of Object.entries(weights) as [TasteKey, number][]) {
    target[k] = Math.max(target[k], v * scale);
  }
}

/** 점포 간 비교가 필요한 값(같은 건물의 동일 소분류 수 등) */
export interface FeatureContext {
  /** geocodeQuery(또는 구역) + 소분류별 점포 수 */
  clusterSize: number;
  activity: StoreActivity;
  /** 전체 점포 방문 수 중 이 점포의 백분위(0~1) */
  visitPercentile: number;
}

const NAMED_ZONE = /도매시장|메가프라자|상가시장|종합시장|신중앙시장|양키시장|화월통|번영회/;

function marketFeatures(seed: StoreSeed, ctx: FeatureContext, flags: { isFood: boolean; isTraditional: boolean }): MarketFeatures {
  const inNamedZone = Boolean(seed.zone && NAMED_ZONE.test(seed.zone)) || /메가프라자|도매시장|종합시장/.test(seed.addressRaw);
  const representativeness = inNamedZone ? 0.75 : seed.entityKind === "street_vendor" ? 0.6 : 0.5;
  // 역사성은 개별 점포 연혁 데이터가 없으므로 '중앙시장 공통' 기반값에 품목 성격만 소폭 반영합니다.
  const historicalness = 0.55 + (flags.isTraditional ? 0.15 : 0) + (flags.isFood ? 0.05 : 0);
  const localExperience =
    0.5 + (flags.isFood ? 0.25 : 0) + (seed.entityKind === "street_vendor" ? 0.15 : 0) + (flags.isTraditional ? 0.2 : 0) + (inNamedZone ? 0.05 : 0);
  const specialized = ctx.clusterSize >= 8 ? 0.95 : ctx.clusterSize >= 5 ? 0.85 : ctx.clusterSize >= 3 ? 0.7 : ctx.clusterSize === 2 ? 0.5 : 0.35;
  const locality = 0.7 + (flags.isFood ? 0.15 : 0) + (seed.entityKind === "street_vendor" ? 0.1 : 0);
  return {
    market_representativeness: round3(representativeness),
    historicalness: round3(Math.min(1, historicalness)),
    local_experience: round3(Math.min(1, localExperience)),
    specialized_street: round3(specialized),
    locality: round3(Math.min(1, locality)),
  };
}

export function buildStoreFeatures(seed: StoreSeed, ctx: FeatureContext): StoreFeatures {
  const base = SUB_CATEGORY_RULES[seed.subCategory];
  if (!base) throw new Error(`[featureRules] '${seed.name}'의 소분류를 해석할 수 없습니다: ${seed.subCategory}`);

  const taste: TasteVector = emptyVector();
  applyMax(taste, base);
  const productWords = seed.items.filter((i) => !NON_PRODUCT_WORDS.has(i));
  for (const item of productWords) for (const w of ITEM_INDEX.get(item) ?? []) applyMax(taste, w);

  const isFood = seed.mainCategory === "식품•요리";
  const isTraditional = taste.traditional >= 0.6;

  // 시장 안 점포라는 사실에 기반한 로컬 기본값
  taste.local = Math.max(taste.local, 0.4);
  // 노점·구역 골목 점포는 '새로운 발견' 성격을 조금 더합니다.
  if (seed.entityKind === "street_vendor") {
    taste.discovery = Math.max(taste.discovery, 0.45);
    taste.local = Math.max(taste.local, 0.7);
    taste.price_sensitive = Math.max(taste.price_sensitive, 0.55);
  }
  // 도매시장 구역·도소매 표기는 가성비 성향으로 봅니다.
  if (/도매/.test(seed.zone ?? "") || /도매/.test(seed.name)) taste.price_sensitive = Math.max(taste.price_sensitive, 0.65);
  // 품목 종류가 흔하지 않을수록(소분류 안에서 드문 품목) 발견 성향을 약간 더합니다.
  if (ctx.clusterSize <= 1 && productWords.length > 0) taste.discovery = Math.max(taste.discovery, 0.3);
  for (const key of TASTE_KEYS) taste[key] = round3(clamp01(taste[key]));

  // 알려진 정도: 가상 방문 수 백분위 기반 (많이 방문할수록 노출도↑ → 발견 가산점↓)
  const exposure = round3(clamp01(0.2 + 0.65 * ctx.visitPercentile - (seed.entityKind === "street_vendor" ? 0.05 : 0)));

  const sub = displayCategory(seed.subCategory);
  return {
    storeId: seed.id,
    primaryCategory: seed.mainCategory,
    categories: [seed.mainCategory, seed.subCategory],
    subCategory: seed.subCategory,
    taste,
    market: marketFeatures(seed, ctx, { isFood, isTraditional }),
    exposure,
    tags: [...new Set([sub, ...productWords])],
    productHints: productWords,
    recommendable: true,
    rationale: `원본 소분류(${sub})와 품목(${productWords.join("·") || "없음"})을 바탕으로 규칙에 따라 추정한 추천 성향입니다. 실제 취급 품목과 영업 여부는 방문 전 확인이 필요합니다.`,
    inferredBy: "rule",
  };
}
