/**
 * 한국어 관심 키워드 → 취향 차원 매핑 사전 (규칙 기반 "키워드 의미 확장")
 * - 내장 챗봇 엔진의 키워드·대화 해석 사전
 * - 추천 점수의 '지금 찾는 것' 보조 vector
 * 에서 공통으로 사용합니다.
 *
 * 각 규칙은 주 차원(1.0 내외)과 함께 자주 같이 나타나는 관련 차원을 약하게 포함합니다.
 * 예) 커피 → 커피 1.0 · 디저트 0.3 · 데이트 0.25 · 로컬 0.15
 */
import { clamp01, emptyVector, round3, TASTE_KEYS, type TasteKey, type TasteVector } from "./dimensions";

type Rule = { words: string[]; weights: Partial<Record<TasteKey, number>> };

export const KEYWORD_RULES: Rule[] = [
  { words: ["커피", "드립", "드립커피", "원두", "카페", "라떼", "에스프레소", "바리스타", "콜드브루", "홈카페"], weights: { coffee: 1, dessert: 0.3, date: 0.25, local: 0.15 } },
  { words: ["머그", "텀블러", "찻잔"], weights: { coffee: 0.6, kitchen: 0.5, gift: 0.35 } },
  { words: ["전통차", "식혜", "수정과", "쌍화차", "대추차"], weights: { traditional: 0.8, dessert: 0.5, coffee: 0.3, local: 0.3 } },
  { words: ["디저트", "케이크", "베이커리", "마카롱", "쿠키", "도넛", "아이스크림", "빙수", "초콜릿", "젤리", "빵집"], weights: { dessert: 1, date: 0.3, coffee: 0.2 } },
  { words: ["간식", "호떡", "붕어빵", "빵", "꽈배기", "찐빵", "주전부리"], weights: { dessert: 0.9, food: 0.35, local: 0.35, travel: 0.2 } },
  { words: ["한과", "약과", "떡", "엿", "강정", "유과", "떡집", "인절미"], weights: { dessert: 0.7, traditional: 0.9, gift: 0.5, local: 0.4 } },
  { words: ["떡볶이", "분식", "김밥", "튀김", "어묵", "오뎅", "순대", "부침개", "빈대떡", "녹두전"], weights: { food: 0.85, dessert: 0.5, local: 0.45, travel: 0.3 } },
  { words: ["닭강정", "치킨", "통닭"], weights: { food: 0.9, dessert: 0.4, date: 0.2 } },
  { words: ["과일", "제철", "청과", "제철과일"], weights: { food: 0.5, dessert: 0.5, family: 0.35, gift: 0.35 } },
  { words: ["맛집", "먹방", "음식", "먹거리", "먹을거리", "맛있는", "먹고", "미식", "노포", "시장음식", "시장 음식", "먹자골목", "길거리음식"], weights: { food: 1, local: 0.55, travel: 0.35, discovery: 0.2 } },
  { words: ["국밥", "설렁탕", "만두", "칼국수", "한식", "족발", "보쌈", "전골", "백반", "수육", "국수", "팥죽", "삼계탕", "추어탕"], weights: { food: 1, local: 0.5, traditional: 0.35, family: 0.3 } },
  {
    words: ["반찬", "식재료", "생선", "장보기", "팥", "꽁치", "건어물", "젓갈", "멸치", "조미김", "김가루", "구운김", "정육", "고기", "채소", "야채", "쌀", "잡곡", "나물", "꽃게", "꽃게장", "수산물"],
    weights: { food: 0.65, kitchen: 0.55, practical: 0.45, family: 0.4, price_sensitive: 0.3 },
  },
  { words: ["건강식품", "홍삼", "한약재", "건강즙"], weights: { food: 0.5, family: 0.6, gift: 0.5, traditional: 0.4 } },
  {
    words: ["옷", "의류", "패션", "원피스", "셔츠", "니트", "코디", "ootd", "여성복", "남성복", "코트", "자켓", "재킷", "바지", "치마", "블라우스", "티셔츠", "정장", "양복"],
    weights: { fashion: 1, date: 0.15 },
  },
  { words: ["가방", "지갑", "벨트", "파우치", "에코백", "핸드백"], weights: { accessory: 1, fashion: 0.4, gift: 0.35 } },
  { words: ["액세서리", "악세사리", "머리핀", "헤어핀", "스카프", "키링", "양말", "모자", "우산", "손수건", "넥타이"], weights: { accessory: 0.9, fashion: 0.3, gift: 0.3, practical: 0.2 } },
  { words: ["귀걸이", "목걸이", "반지", "주얼리", "금은방", "귀금속", "시계", "팔찌"], weights: { accessory: 0.8, gift: 0.75, date: 0.45 } },
  { words: ["신발", "운동화", "구두", "샌들", "슬리퍼"], weights: { fashion: 0.6, practical: 0.6, accessory: 0.3 } },
  { words: ["화장품", "향수", "립스틱", "스킨케어"], weights: { accessory: 0.5, gift: 0.5, date: 0.3 } },
  { words: ["인테리어", "커튼", "커텐", "홈데코", "집꾸미기", "조명", "러그", "쿠션", "오늘의집", "소품", "인테리어소품"], weights: { living: 1, vintage: 0.2, gift: 0.2 } },
  { words: ["이불", "침구", "베개", "혼수", "담요", "이불커버"], weights: { living: 0.9, family: 0.5, practical: 0.3, gift: 0.2 } },
  { words: ["꽃", "꽃다발", "화분", "식물", "생화"], weights: { living: 0.6, gift: 0.8, date: 0.5 } },
  { words: ["자취", "수납", "정리", "살림", "생활용품", "생필품", "일상템"], weights: { practical: 0.9, living: 0.6, kitchen: 0.3, price_sensitive: 0.3 } },
  {
    words: ["주방", "그릇", "식기", "냄비", "프라이팬", "도마", "수저", "접시", "밀폐용기", "요리", "집밥", "베이킹", "주방용품"],
    weights: { kitchen: 1, family: 0.3, practical: 0.3 },
  },
  {
    words: ["전통", "한복", "한옥", "민속", "전통주", "다도", "한지", "자개", "주단", "비단", "명주", "국악", "고궁", "역사", "전통소품", "전통 소품"],
    weights: { traditional: 1, local: 0.4, travel: 0.2 },
  },
  { words: ["선물", "답례품", "선물세트", "포장", "생일", "생일선물", "생일 선물"], weights: { gift: 1, date: 0.15, family: 0.15 } },
  { words: ["집들이"], weights: { gift: 0.9, living: 0.6 } },
  { words: ["기념품", "굿즈", "여행 기념품", "여행기념품", "특산품", "지역특산품", "지역 특산품"], weights: { gift: 0.9, travel: 0.6, local: 0.5 } },
  { words: ["어버이날", "명절", "효도", "부모님", "설날", "추석", "환갑", "칠순"], weights: { family: 0.9, gift: 0.6, traditional: 0.45 } },
  { words: ["캠핑", "텐트", "차박", "글램핑", "백패킹", "캠핑의자", "캠핑 의자", "랜턴", "버너", "코펠", "캠핑용품"], weights: { camping: 1, travel: 0.4, practical: 0.3 } },
  { words: ["등산", "아웃도어", "트레킹", "낚시", "러닝", "등산복", "등산화", "레저"], weights: { camping: 0.8, travel: 0.35, practical: 0.3 } },
  { words: ["여행", "관광", "투어", "호캉스", "여행지", "뚜벅이", "기차여행", "나들이", "당일치기", "대전여행", "대전 여행"], weights: { travel: 1, local: 0.4, date: 0.2, discovery: 0.2 } },
  { words: ["빈티지", "레트로", "앤틱", "앤티크", "구제", "필름카메라", "lp", "옛날", "감성", "골동품", "중고"], weights: { vintage: 1, discovery: 0.5, fashion: 0.2 } },
  { words: ["가족", "육아", "아이", "엄마", "아빠", "아기", "키즈", "아이들", "조카"], weights: { family: 1, practical: 0.2 } },
  { words: ["데이트", "커플", "연인", "남자친구", "여자친구", "기념일", "남친", "여친", "애인"], weights: { date: 1, gift: 0.3 } },
  { words: ["실용", "실용적", "쓸모", "튼튼"], weights: { practical: 1 } },
  { words: ["가성비", "할인", "도매", "저렴", "싸게", "알뜰", "착한가격", "착한 가격"], weights: { price_sensitive: 1, practical: 0.4 } },
  {
    words: ["수공예", "공예", "공예품", "diy", "뜨개", "뜨개질", "바느질", "자수", "원단", "수예", "퀼트", "핸드메이드", "리폼", "재봉", "면직물", "털실", "손뜨개"],
    weights: { craft: 1, vintage: 0.2, discovery: 0.2 },
  },
  { words: ["책", "서점", "독서", "헌책", "도서"], weights: { discovery: 0.5, vintage: 0.3, family: 0.3, gift: 0.3 } },
  { words: ["전통시장", "재래시장"], weights: { local: 1, traditional: 0.5, food: 0.3, discovery: 0.2 } },
  { words: ["대전만의", "대전에서만", "지역한정", "지역 한정", "여기서만"], weights: { local: 1, discovery: 0.6 } },
  { words: ["로컬", "시장", "골목", "동네", "대전", "원도심", "중앙시장", "지역", "로컬푸드", "대전역"], weights: { local: 1, discovery: 0.15 } },
  {
    words: ["독특", "독특한", "특별", "특별한", "색다른", "새로운", "숨은", "숨겨진", "흔하지않은", "흔하지 않은", "이색", "희귀", "발견", "신기한", "유니크", "처음보는", "처음 보는"],
    weights: { discovery: 1 },
  },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

type DictionaryEntry = { word: string; norm: string; rule: number };
let dictionaryCache: DictionaryEntry[] | null = null;

function dictionary(): DictionaryEntry[] {
  dictionaryCache ??= KEYWORD_RULES.flatMap((rule, index) => rule.words.map((word) => ({ word, norm: normalize(word), rule: index }))).sort(
    (a, b) => b.norm.length - a.norm.length,
  );
  return dictionaryCache;
}

/**
 * 사전 단어를 긴 것부터 찾고, 이미 매칭된 글자 구간은 다시 쓰지 않습니다.
 * 예) '닭강정'은 한과류 '강정'으로, '떡볶이'는 '떡'으로 중복 해석되지 않습니다.
 * @param keepSpaces 대화 문장처럼 긴 글은 띄어쓰기를 유지해 단어 경계를 넘는 오탐을 줄입니다.
 */
export function findDictionaryWords(text: string, options: { keepSpaces?: boolean } = {}): { word: string; rule: number }[] {
  const source = options.keepSpaces ? text.toLowerCase() : normalize(text);
  const used = new Uint8Array(source.length);
  const hits: { word: string; rule: number }[] = [];
  for (const entry of dictionary()) {
    const needle = options.keepSpaces ? entry.word.toLowerCase() : entry.norm;
    let from = 0;
    for (;;) {
      const at = source.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      if (!used.subarray(at, end).some((v) => v === 1)) {
        used.fill(1, at, end);
        hits.push({ word: entry.word, rule: entry.rule });
      }
      from = at + 1;
    }
  }
  return hits;
}

export type KeywordMatch = { input: string; matchedWords: string[]; weights: TasteVector; mapped: boolean };

function weightsForRules(rules: Iterable<number>): TasteVector {
  const weights = emptyVector();
  for (const index of rules) {
    for (const [key, w] of Object.entries(KEYWORD_RULES[index]!.weights) as [TasteKey, number][]) {
      weights[key] = Math.max(weights[key], w);
    }
  }
  return weights;
}

export function matchKeyword(input: string): KeywordMatch {
  const matchedWords = new Set<string>();
  const rules = new Set<number>();
  for (const hit of findDictionaryWords(input)) {
    matchedWords.add(hit.word);
    rules.add(hit.rule);
  }
  const weights = weightsForRules(rules);
  const mapped = matchedWords.size > 0;
  if (!mapped) {
    // 사전에 없는 상품은 생활 실용·시장 탐색 성향으로 약하게만 반영합니다(과대 해석 방지).
    weights.practical = 0.25;
    weights.local = 0.15;
  }
  return { input, matchedWords: [...matchedWords], weights, mapped };
}

/** 부정 표현이 있는 구절(“캠핑은 관심 없어요”)은 취향 신호로 쓰지 않습니다. */
const NEGATION = /(관심\s*(이|은|는)?\s*없|안\s*좋아|싫|말고|빼고|제외|별로)/;

/** 대화 문장에서 사전 단어를 찾습니다(부정 구절 제외). */
export function matchSentence(text: string): KeywordMatch {
  const clauses = text
    .split(/[,.!?\n·]|그리고|하지만|그런데|근데/)
    .map((c) => c.trim())
    .filter(Boolean);
  const matchedWords = new Set<string>();
  const rules = new Set<number>();
  for (const clause of clauses) {
    if (NEGATION.test(clause)) continue;
    for (const hit of findDictionaryWords(clause)) {
      matchedWords.add(hit.word);
      rules.add(hit.rule);
    }
  }
  return { input: text, matchedWords: [...matchedWords], weights: weightsForRules(rules), mapped: matchedWords.size > 0 };
}

/**
 * 가중치가 있는 키워드 목록을 하나의 취향 vector로 합칩니다.
 * 차원별로 가장 강한 신호를 기준으로 삼고, 추가 신호는 절반만 반영하는
 * 할인된 noisy-OR(1 - Π(1 - d·w))로 합쳐 0~1 범위와 점수 간 차이를 유지합니다.
 */
export function vectorFromKeywords(items: { keyword: string; score: number }[]): {
  vector: TasteVector;
  matches: KeywordMatch[];
} {
  const matches = items.map((item) => matchKeyword(item.keyword));
  return { vector: combineWeights(matches.map((m, i) => ({ weights: m.weights, strength: items[i]!.score }))), matches };
}

export function combineWeights(signals: { weights: TasteVector; strength: number }[]): TasteVector {
  const perKey = Object.fromEntries(TASTE_KEYS.map((k) => [k, [] as number[]])) as Record<TasteKey, number[]>;
  for (const s of signals) {
    const strength = clamp01(s.strength);
    for (const key of TASTE_KEYS) {
      const w = s.weights[key] * strength;
      if (w > 0) perKey[key].push(w);
    }
  }
  const vector = emptyVector();
  for (const key of TASTE_KEYS) {
    const sorted = perKey[key].sort((a, b) => b - a);
    const remaining = sorted.reduce((acc, w, i) => acc * (1 - w * (i === 0 ? 1 : 0.5)), 1);
    vector[key] = round3(clamp01(1 - remaining));
  }
  return vector;
}

/** 키워드 입력 문자열 → 키워드 목록 ("커피, 캠핑", "[커피] [캠핑]", "#커피 #캠핑") */
export function splitKeywords(text: string): string[] {
  const parts = text
    .split(/[,，、;\n#\[\]()]+|\s{2,}/)
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    // 공백으로만 구분한 짧은 단어 나열("커피 캠핑 선물")은 각각 키워드로 봅니다.
    const tokens = p.split(" ").length > 1 && p.split(" ").every((t) => matchKeyword(t).mapped) ? p.split(" ") : [p];
    for (const t of tokens) {
      const key = normalize(t);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(t.slice(0, 20));
    }
  }
  return out;
}
