/**
 * 한국어 관심 키워드 → 취향 차원 매핑 사전.
 * - MockGeminiProvider(외부 AI 없이 동작하는 분석기)
 * - Instagram 캡션/해시태그 키워드 추출
 * 에서 공통으로 사용합니다.
 */
import { clamp01, emptyVector, round3, TASTE_KEYS, type TasteKey, type TasteVector } from "./dimensions";

type Rule = { words: string[]; weights: Partial<Record<TasteKey, number>> };

export const KEYWORD_RULES: Rule[] = [
  { words: ["커피", "드립", "원두", "카페", "라떼", "에스프레소", "바리스타", "콜드브루", "홈카페"], weights: { coffee: 1 } },
  { words: ["머그", "텀블러", "찻잔"], weights: { coffee: 0.6, kitchen: 0.4, gift: 0.3 } },
  { words: ["디저트", "케이크", "베이커리", "마카롱", "쿠키", "도넛", "아이스크림", "빙수", "초콜릿", "젤리"], weights: { dessert: 1, date: 0.2 } },
  { words: ["간식", "호떡", "붕어빵", "빵"], weights: { dessert: 0.9, food: 0.3 } },
  { words: ["한과", "약과", "떡", "엿", "강정"], weights: { dessert: 0.7, traditional: 0.9, gift: 0.5 } },
  { words: ["떡볶이", "분식", "김밥", "튀김", "어묵"], weights: { food: 0.8, dessert: 0.6, local: 0.3 } },
  { words: ["닭강정", "치킨"], weights: { food: 0.9, dessert: 0.4 } },
  { words: ["과일", "제철"], weights: { food: 0.5, dessert: 0.5, family: 0.3, gift: 0.3 } },
  { words: ["맛집", "먹방", "음식", "먹거리", "미식", "노포"], weights: { food: 1, local: 0.4 } },
  { words: ["국밥", "순대", "설렁탕", "만두", "칼국수", "한식", "족발", "보쌈", "전골", "백반"], weights: { food: 1, local: 0.5, traditional: 0.3 } },
  { words: ["반찬", "식재료", "생선", "장보기", "팥", "꽁치"], weights: { food: 0.6, kitchen: 0.5, practical: 0.4, family: 0.3 } },
  { words: ["옷", "의류", "패션", "원피스", "셔츠", "니트", "코디", "ootd", "스타일", "여성복", "남성복", "코트", "자켓", "재킷", "바지", "치마", "블라우스"], weights: { fashion: 1 } },
  { words: ["가방", "지갑", "벨트", "파우치", "에코백"], weights: { accessory: 1, fashion: 0.4, gift: 0.3 } },
  { words: ["액세서리", "악세사리", "머리핀", "헤어핀", "스카프", "키링", "양말", "모자", "우산"], weights: { accessory: 0.9, fashion: 0.3, gift: 0.2 } },
  { words: ["귀걸이", "목걸이", "반지", "주얼리", "금은방", "귀금속"], weights: { accessory: 0.8, gift: 0.7, date: 0.4 } },
  { words: ["인테리어", "커튼", "홈데코", "집꾸미기", "조명", "러그", "쿠션", "오늘의집"], weights: { living: 1, vintage: 0.2 } },
  { words: ["이불", "침구", "베개", "혼수"], weights: { living: 0.9, family: 0.5, practical: 0.3 } },
  { words: ["자취", "수납", "정리", "살림"], weights: { living: 0.6, practical: 0.8, kitchen: 0.3 } },
  { words: ["주방", "그릇", "식기", "냄비", "프라이팬", "도마", "수저", "접시", "밀폐용기", "요리", "집밥", "베이킹"], weights: { kitchen: 1, family: 0.3 } },
  { words: ["전통", "한복", "한옥", "민속", "전통주", "다도", "한지", "자개", "주단", "비단", "명주", "국악", "고궁", "역사"], weights: { traditional: 1, local: 0.3 } },
  { words: ["선물", "답례품", "선물세트", "포장", "생일"], weights: { gift: 1 } },
  { words: ["기념품", "굿즈", "여행 기념품", "여행기념품"], weights: { gift: 0.9, travel: 0.7 } },
  { words: ["어버이날", "명절", "효도", "부모님"], weights: { family: 0.9, gift: 0.6, traditional: 0.3 } },
  { words: ["캠핑", "텐트", "차박", "글램핑", "백패킹", "캠핑의자", "캠핑 의자", "랜턴", "버너", "코펠"], weights: { camping: 1, practical: 0.2 } },
  { words: ["등산", "아웃도어", "트레킹", "낚시", "러닝"], weights: { camping: 0.8, practical: 0.3 } },
  { words: ["여행", "관광", "투어", "호캉스", "여행지", "뚜벅이", "기차여행", "나들이"], weights: { travel: 1, date: 0.2 } },
  { words: ["빈티지", "레트로", "앤틱", "앤티크", "구제", "필름카메라", "lp", "옛날", "감성"], weights: { vintage: 1 } },
  { words: ["가족", "육아", "아이", "엄마", "아빠", "아기", "키즈"], weights: { family: 1, practical: 0.2 } },
  { words: ["데이트", "커플", "연인", "남자친구", "여자친구", "기념일"], weights: { date: 1, gift: 0.3 } },
  { words: ["가성비", "실용", "생활용품", "할인", "도매", "일상템", "저렴", "생필품"], weights: { practical: 1 } },
  { words: ["수공예", "공예", "공예품", "diy", "뜨개", "뜨개질", "바느질", "자수", "원단", "수예", "퀼트", "핸드메이드", "리폼", "재봉", "면직물"], weights: { craft: 1, vintage: 0.2 } },
  { words: ["전통시장", "재래시장"], weights: { local: 1, traditional: 0.4 } },
  { words: ["로컬", "시장", "골목", "동네", "대전", "원도심", "중앙시장", "지역", "로컬푸드", "대전역"], weights: { local: 1 } },
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
 * @param keepSpaces 캡션처럼 긴 문장은 띄어쓰기를 유지해 단어 경계를 넘는 오탐을 줄입니다.
 */
export function findDictionaryWords(text: string, options: { keepSpaces?: boolean } = {}): { word: string; rule: number }[] {
  const source = options.keepSpaces ? text.toLowerCase() : normalize(text);
  const used = new Uint8Array(source.length);
  const hits: { word: string; rule: number }[] = [];
  for (const entry of dictionary()) {
    if (options.keepSpaces && /\s/.test(entry.word)) continue;
    let from = 0;
    for (;;) {
      const at = source.indexOf(entry.norm, from);
      if (at < 0) break;
      const end = at + entry.norm.length;
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

export function matchKeyword(input: string): KeywordMatch {
  const weights = emptyVector();
  const matchedWords = new Set<string>();
  const rules = new Set<number>();
  for (const hit of findDictionaryWords(input)) {
    matchedWords.add(hit.word);
    rules.add(hit.rule);
  }
  for (const index of rules) {
    for (const [key, w] of Object.entries(KEYWORD_RULES[index]!.weights) as [TasteKey, number][]) {
      weights[key] = Math.max(weights[key], w);
    }
  }
  const mapped = matchedWords.size > 0;
  if (!mapped) {
    // 사전에 없는 상품은 생활 실용·시장 탐색 성향으로 약하게만 반영합니다(과대 해석 방지).
    weights.practical = 0.25;
    weights.local = 0.15;
  }
  return { input, matchedWords: [...matchedWords], weights, mapped };
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
  const signals = Object.fromEntries(TASTE_KEYS.map((k) => [k, [] as number[]])) as Record<TasteKey, number[]>;
  const matches: KeywordMatch[] = [];
  for (const item of items) {
    const match = matchKeyword(item.keyword);
    matches.push(match);
    const strength = clamp01(item.score);
    for (const key of TASTE_KEYS) {
      const w = match.weights[key] * strength;
      if (w > 0) signals[key].push(w);
    }
  }
  const vector = emptyVector();
  for (const key of TASTE_KEYS) {
    const sorted = signals[key].sort((a, b) => b - a);
    const remaining = sorted.reduce((acc, w, i) => acc * (1 - w * (i === 0 ? 1 : 0.5)), 1);
    vector[key] = round3(clamp01(1 - remaining));
  }
  return { vector, matches };
}
