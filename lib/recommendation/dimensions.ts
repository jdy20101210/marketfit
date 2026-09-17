/**
 * 사용자 취향 vector와 점포 feature vector가 공유하는 차원 정의.
 * 같은 공간에 있어야 cosine similarity를 계산할 수 있습니다.
 */

export const TASTE_KEYS = [
  "food",
  "dessert",
  "coffee",
  "fashion",
  "accessory",
  "living",
  "kitchen",
  "traditional",
  "gift",
  "camping",
  "travel",
  "vintage",
  "family",
  "date",
  "practical",
  "craft",
  "local",
] as const;

export type TasteKey = (typeof TASTE_KEYS)[number];
export type TasteVector = Record<TasteKey, number>;

export const TASTE_META: Record<TasteKey, { label: string; short: string; emoji: string; hint: string }> = {
  food: { label: "먹거리", short: "먹거리", emoji: "🍜", hint: "시장 음식·식사" },
  dessert: { label: "간식·디저트", short: "디저트", emoji: "🍡", hint: "분식·간식·달콤한 것" },
  coffee: { label: "커피", short: "커피", emoji: "☕", hint: "커피·카페 문화" },
  fashion: { label: "패션", short: "패션", emoji: "👗", hint: "의류·스타일" },
  accessory: { label: "잡화·소품", short: "소품", emoji: "👜", hint: "가방·액세서리·양말" },
  living: { label: "리빙", short: "리빙", emoji: "🛋️", hint: "침구·커튼·인테리어" },
  kitchen: { label: "주방·요리", short: "주방", emoji: "🍳", hint: "식기·조리도구" },
  traditional: { label: "전통", short: "전통", emoji: "🏮", hint: "한복·주단·전통 먹거리" },
  gift: { label: "선물", short: "선물", emoji: "🎁", hint: "선물·기념품" },
  camping: { label: "캠핑", short: "캠핑", emoji: "🏕️", hint: "캠핑·아웃도어" },
  travel: { label: "여행", short: "여행", emoji: "✈️", hint: "여행·관광" },
  vintage: { label: "빈티지", short: "빈티지", emoji: "🧵", hint: "레트로·감성" },
  family: { label: "가족", short: "가족", emoji: "👨‍👩‍👧", hint: "가족·생활" },
  date: { label: "데이트", short: "데이트", emoji: "💞", hint: "커플·나들이" },
  practical: { label: "실용", short: "실용", emoji: "🧺", hint: "생활용품·가성비" },
  craft: { label: "수공예", short: "수공예", emoji: "✂️", hint: "원단·수예·DIY" },
  local: { label: "로컬 경험", short: "로컬", emoji: "📍", hint: "지역·시장 경험" },
};

export function emptyVector(): TasteVector {
  return Object.fromEntries(TASTE_KEYS.map((k) => [k, 0])) as TasteVector;
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** 누락 키는 0, 범위를 벗어난 값은 0~1로 보정합니다. */
export function toVector(partial: Partial<Record<string, unknown>> | null | undefined): TasteVector {
  const v = emptyVector();
  if (!partial) return v;
  for (const key of TASTE_KEYS) {
    const raw = partial[key];
    v[key] = typeof raw === "number" ? round3(clamp01(raw)) : 0;
  }
  return v;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function isTasteKey(value: string): value is TasteKey {
  return (TASTE_KEYS as readonly string[]).includes(value);
}

export function topTastes(vector: TasteVector, count = 5, minScore = 0.05): { key: TasteKey; score: number }[] {
  return TASTE_KEYS.map((key) => ({ key, score: vector[key] }))
    .filter((t) => t.score >= minScore)
    .sort((a, b) => b.score - a.score || TASTE_KEYS.indexOf(a.key) - TASTE_KEYS.indexOf(b.key))
    .slice(0, count);
}

export function tasteLabel(key: TasteKey): string {
  return `${TASTE_META[key].emoji} ${TASTE_META[key].label}`;
}
