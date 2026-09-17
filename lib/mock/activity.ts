/**
 * 프로토타입용 가상 집계 데이터 생성기 (결정적 — 실행할 때마다 같은 값)
 * scripts/build-features.ts가 data/mock/*.json으로 저장하고, 화면은 저장된 파일만 읽습니다.
 * 실제 이용 기록(user_interactions)이 쌓이면 화면에서 가상 값에 더해 보여줍니다.
 */
import { TASTE_KEYS, type TasteKey } from "@/lib/recommendation/dimensions";
import type { StoreActivity, StoreSeed } from "@/lib/stores/types";
import { seededRandom } from "./random";

/** 소분류별 방문 빈도 가중치 (시장 먹거리·장보기 점포가 상대적으로 많이 방문된다고 가정) */
const VISIT_FACTOR: Record<string, number> = {
  "떡•빵•김밥•치킨•즉석음식": 1.7,
  "식당•주점•카페": 1.5,
  "과자•음료•술•담배•마트물": 1.4,
  "청과물•과일": 1.3,
  "농산물•쌀•채소": 1.3,
  "건어물•반찬": 1.25,
  "수산물•생선": 1.25,
  "축산물•정육": 1.2,
  건강기능식품: 1.1,
  "잡화•악세서리": 1.0,
  가방: 0.9,
  신발: 0.9,
  여성복: 0.85,
  남성복: 0.75,
  속옷: 0.9,
  "귀금속•시계": 0.75,
  한복: 0.6,
  "이불•침구": 0.55,
  커텐: 0.5,
  "원단•포목•지업": 0.55,
  "수예•자수": 0.6,
  "그릇•주방용품": 0.9,
  생활용품: 0.9,
};

export const MOCK_ACTIVITY_NOTICE = "프로토타입 가상 집계(고정값) — 실제 이용 기록이 쌓이면 함께 반영됩니다.";

export function mockStoreActivity(seed: Pick<StoreSeed, "id" | "subCategory" | "entityKind">): StoreActivity {
  const rng = seededRandom(`activity:${seed.id}`);
  const factor = (VISIT_FACTOR[seed.subCategory] ?? 0.8) * (seed.entityKind === "street_vendor" ? 1.15 : 1);
  const visitCount = Math.round((18 + rng() * 90) * factor);
  const likeCount = Math.round(visitCount * (0.05 + rng() * 0.15));
  const saveCount = Math.round(visitCount * (0.03 + rng() * 0.1));
  const interestUsers = Math.round(visitCount * (0.3 + rng() * 0.4) + likeCount * 0.5 + saveCount * 0.8);
  return { storeId: seed.id, visitCount, likeCount, saveCount, interestUsers };
}

/** 시장 전체 취향별 관심도 (최근 14일, 마지막 값이 오늘) */
const INTEREST_BASE: Record<TasteKey, { base: number; trend: number }> = {
  food: { base: 120, trend: 0.004 },
  dessert: { base: 90, trend: 0.012 },
  coffee: { base: 72, trend: 0.018 },
  fashion: { base: 80, trend: -0.006 },
  accessory: { base: 58, trend: 0.002 },
  living: { base: 48, trend: -0.004 },
  kitchen: { base: 44, trend: 0.003 },
  traditional: { base: 62, trend: -0.008 },
  gift: { base: 84, trend: 0.028 },
  camping: { base: 52, trend: 0.035 },
  travel: { base: 50, trend: 0.02 },
  vintage: { base: 42, trend: 0.03 },
  family: { base: 66, trend: 0 },
  date: { base: 34, trend: 0.01 },
  practical: { base: 70, trend: -0.002 },
  craft: { base: 28, trend: 0.006 },
  local: { base: 76, trend: 0.01 },
  discovery: { base: 54, trend: 0.024 },
  price_sensitive: { base: 64, trend: 0.004 },
};

export function mockMarketInterest(days = 14): { key: TasteKey; daily: number[] }[] {
  return TASTE_KEYS.map((key) => {
    const rng = seededRandom(`interest:${key}`);
    const { base, trend } = INTEREST_BASE[key];
    const daily = Array.from({ length: days }, (_, i) => {
      const offset = i - (days - 1); // 오늘 = 0, 13일 전 = -13
      return Math.max(0, Math.round(base * (1 + trend * offset * 1.4) * (0.9 + rng() * 0.2)));
    });
    return { key, daily };
  });
}
