/**
 * 품목 직접 일치 (item match)
 *
 * 19개 취향 차원만으로는 "운동화"와 "여성복"이 같은 패션 성향으로 묶여서,
 * 신발 가게 대신 옷 가게가 추천되는 문제가 있었습니다.
 * 이 모듈은 사용자가 실제로 입력한 **품목 단어**를 점포의 원본 품목·업종·소분류와
 * 그대로 대조해, 그 물건을 실제로 취급하는 점포를 앞으로 올립니다.
 *
 * 원칙
 * - 엑셀 원본에 적힌 품목 문자열만 사용합니다 (없는 품목을 만들어 내지 않음).
 * - 취향 vector 점수를 대체하지 않고, 별도 항목(item_match)으로만 더합니다.
 */

/** 비교용 정규화: 소문자 + 공백·가운뎃점 제거 */
export function normalizeTerm(text: string): string {
  return text.toLowerCase().replace(/[\s·•‧/,]+/g, "");
}

/** 너무 짧은 단어는 아무 데나 붙어서 오탐이 됩니다(예: "복"이 여성복·한복 모두에 걸림). */
const MIN_TERM = 2;

/**
 * 상위 품목 관계 — 구체어가 상위어 점포에도 부분 점수를 받게 합니다.
 * 예) "운동화"로 검색하면 운동화를 적어 둔 점포가 1순위, 그냥 "신발" 점포가 2순위.
 * 원본 데이터에 실제로 등장하는 표기만 넣습니다.
 */
const HYPERNYMS: Record<string, string[]> = {
  운동화: ["신발", "제화", "화점"],
  구두: ["신발", "제화", "화점"],
  슬리퍼: ["신발"],
  샌들: ["신발"],
  등산화: ["신발", "등산"],
  시계: ["귀금속", "금은방"],
  반지: ["귀금속", "금은방", "보석", "예물"],
  목걸이: ["귀금속", "금은방", "보석"],
  귀걸이: ["귀금속", "금은방", "보석"],
  팔찌: ["귀금속", "금은방", "보석"],
  금: ["귀금속", "금은방"],
  은: ["귀금속", "금은방"],
  건어물: ["젓갈", "반찬"],
  멸치: ["건어물"],
  김: ["건어물", "반찬"],
  젓갈: ["반찬", "수산물"],
  생선: ["수산물"],
  회: ["수산물", "생선"],
  정육: ["육류", "고기"],
  고기: ["정육", "육류"],
  한우: ["정육", "육류", "고기"],
  돼지고기: ["정육", "육류", "고기"],
  닭: ["육류", "정육"],
  떡: ["떡집", "한과"],
  한과: ["떡", "과자"],
  빵: ["제과", "베이커리"],
  케이크: ["제과", "베이커리", "빵"],
  커피: ["카페", "음료"],
  이불: ["침구", "혼수"],
  베개: ["침구"],
  커튼: ["침구", "인테리어"],
  한복: ["주단", "포목", "혼수"],
  원단: ["포목", "주단", "직물"],
  털실: ["수예", "뜨개"],
  자수: ["수예"],
  양말: ["잡화", "내의"],
  속옷: ["내의", "란제리"],
  가방: ["잡화", "피혁"],
  지갑: ["잡화", "피혁"],
  모자: ["잡화"],
  안경: ["잡화"],
  그릇: ["주방", "식기", "도자기"],
  냄비: ["주방", "주방용품"],
  칼: ["주방", "칼갈이"],
  화장품: ["화장품", "뷰티"],
  꽃: ["화원", "생화"],
};

export interface StoreItemTerms {
  /** 이 점포가 실제로 적어 둔 품목·업종 (가장 확실한 근거) */
  items: string[];
  /** 소분류 — 같은 골목/매대 분류라서 품목과 다를 수 있습니다(부침개 가게가 '건어물•반찬' 분류에 속하는 식). */
  category: string[];
}

function split(values: string[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    // "귀금속·시계"처럼 묶인 표기는 조각으로도 비교합니다.
    for (const piece of value.split(/[·•‧/,\s]+/)) {
      const t = normalizeTerm(piece);
      if (t.length >= MIN_TERM) out.add(t);
    }
    const whole = normalizeTerm(value);
    if (whole.length >= MIN_TERM) out.add(whole);
  }
  return [...out];
}

/** 점포 쪽 비교 대상 — 품목·업종과 소분류를 분리합니다(분류만 같은 점포가 1순위로 올라오지 않도록). */
export function storeItemTerms(store: { items: string[]; storeType: string; subCategory: string }): StoreItemTerms {
  return { items: split([...store.items, store.storeType]), category: split([store.subCategory]) };
}

/** 사용자 쪽 비교 대상: 입력 키워드와 "무엇을 찾는지" 문장에서 뽑은 품목 후보 */
export function userItemTerms(sources: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    for (const piece of source.split(/[\s,，、;·•/]+/)) {
      // 조사·어미를 붙여 쓴 입력("운동화를", "시계가")도 앞부분이 품목이면 비교되도록 남깁니다.
      const t = normalizeTerm(piece).replace(/(을|를|이|가|은|는|랑|이랑|하고|좀|요)$/u, "");
      if (t.length >= MIN_TERM && t.length <= 12) out.add(t);
    }
  }
  return [...out];
}

export interface ItemMatch {
  /** 0~1 — 1이면 원본 품목에 그대로 적힌 물건 */
  score: number;
  /** 실제로 일치한 사용자 입력 단어 */
  matched: string[];
}

function hit(term: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  if (terms.includes(term)) return 1;
  if (terms.some((s) => s.includes(term) || term.includes(s))) return 0.8;
  const parents = HYPERNYMS[term] ?? [];
  if (parents.some((p) => terms.some((s) => s.includes(normalizeTerm(p))))) return 0.45;
  return 0;
}

/** 소분류만 같은 경우의 감점 — 같은 매대 분류라도 파는 물건은 다를 수 있습니다. */
const CATEGORY_DISCOUNT = 0.6;

/**
 * 사용자 품목 단어 ↔ 점포 품목 대조
 * - 원본 품목·업종과 완전히 같으면 1.0
 * - 한쪽이 다른 쪽을 포함하면 0.8 (예: "귀금속·시계" ↔ "시계")
 * - 상위 품목이면 0.45 (예: "운동화" ↔ "신발")
 * - 품목은 다르고 소분류만 같으면 위 값의 0.6배 (예: '건어물•반찬' 분류의 부침개 가게)
 */
export function itemMatchScore(userTerms: string[], store: StoreItemTerms | null | undefined): ItemMatch {
  if (userTerms.length === 0 || !store) return { score: 0, matched: [] };
  let best = 0;
  const matched: string[] = [];

  for (const term of userTerms) {
    const score = Math.max(hit(term, store.items), hit(term, store.category) * CATEGORY_DISCOUNT);
    if (score > 0) matched.push(term);
    best = Math.max(best, score);
  }
  // 여러 품목이 동시에 맞으면 약간 더 올려 줍니다(최대 1.0).
  const bonus = matched.length > 1 ? Math.min(0.1, 0.05 * (matched.length - 1)) : 0;
  return { score: Math.min(1, best + bonus), matched };
}
