import type { TasteVector } from "@/lib/recommendation/dimensions";
import type { EntityKind, LocationBasis, LocLevel, PhoneStatus } from "./parse";

export type LocationAccuracy = "exact" | "approximate" | "unknown";

/**
 * 엑셀 원본에서 옮긴 점포 기본 정보 (원본에 없는 값은 만들지 않음)
 * - 원본 컬럼: sIdx, name, phone, items, categories, address, address_clean, zone, loc_level, source, collected
 * - storeType / entityKind / geocodeQuery 등은 원문을 나누고 정리한 값입니다.
 */
export interface StoreSeed {
  id: string;
  /** 원본 sIdx (완전히 같은 행을 합친 경우 여러 개) */
  sourceIds: number[];
  name: string;
  phoneRaw: string;
  phone: string | null;
  phoneStatus: PhoneStatus;
  /** 원본 품목 문자열과 나눈 목록 */
  itemsRaw: string;
  items: string[];
  /** 화면 표시용 품목 (items를 가운뎃점으로 연결) */
  storeType: string;
  categoriesRaw: string;
  mainCategory: string;
  subCategory: string;
  addressRaw: string;
  /** 원본 address_clean 값 (참고용) */
  addressClean: string | null;
  zone: string | null;
  locLevel: LocLevel;
  source: string;
  collectedAt: string;
  entityKind: EntityKind;
  geocodeQuery: string | null;
  addressDetail: string | null;
  locationBasis: LocationBasis;
  /** 병합·형식 확인 등 변환 과정 메모 */
  note: string;
  sourceRow: number;
}

export const MARKET_FEATURE_KEYS = [
  "market_representativeness",
  "historicalness",
  "local_experience",
  "specialized_street",
  "locality",
] as const;
export type MarketFeatureKey = (typeof MARKET_FEATURE_KEYS)[number];
export type MarketFeatures = Record<MarketFeatureKey, number>;

/** DB에 저장된 값 등에서 빠진 키를 기본값으로 채웁니다. */
export function toMarketFeatures(value: unknown, fallback?: Partial<MarketFeatures>): MarketFeatures {
  const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return Object.fromEntries(
    MARKET_FEATURE_KEYS.map((k) => {
      const n = Number(obj[k]);
      return [k, Number.isFinite(n) && obj[k] !== null && obj[k] !== undefined ? Math.min(1, Math.max(0, n)) : (fallback?.[k] ?? 0)];
    }),
  ) as MarketFeatures;
}

export const MARKET_FEATURE_META: Record<MarketFeatureKey, { label: string; hint: string }> = {
  market_representativeness: { label: "시장 대표성", hint: "도매시장·메가프라자처럼 이름 있는 시장 구역에 속한 정도" },
  historicalness: { label: "역사성", hint: "오래된 시장 문화와의 연결 (시장 공통 기반 추정)" },
  local_experience: { label: "로컬 체험", hint: "먹거리·노점·전통 품목처럼 시장에서만 해볼 수 있는 경험" },
  specialized_street: { label: "특화 거리", hint: "같은 품목 점포가 한 건물·골목에 모여 있는 정도" },
  locality: { label: "지역성", hint: "대전 원도심 로컬 경험 정도" },
};

/** 문자열 분류: 원본 대분류(식품•요리 등)와 소분류(건어물•반찬 등) */
export type StoreCategory = string;

/** 추천용 성향 — 원본 정보가 아니라 분류·품목에서 규칙으로 추정한 값입니다. */
export interface StoreFeatures {
  storeId: string;
  /** 원본 대분류 */
  primaryCategory: StoreCategory;
  /** [대분류, 소분류] */
  categories: StoreCategory[];
  subCategory: StoreCategory;
  taste: TasteVector;
  market: MarketFeatures;
  /** 알려진 정도(0~1). 낮을수록 discovery bonus가 커집니다. */
  exposure: number;
  tags: string[];
  /** 원본 품목 (사실 정보) */
  productHints: string[];
  recommendable: boolean;
  rationale: string;
  /** 추정 방식: rule(분류·품목 규칙) */
  inferredBy: "rule";
}

export interface StoreLocation {
  storeId: string;
  lat: number | null;
  lng: number | null;
  accuracy: LocationAccuracy;
  /** 좌표 근거 설명 */
  note: string;
  query: string | null;
  provider: "kakao-local" | "kakao-js" | null;
  geocodedAt: string | null;
}

/** 저장된 점포 소개 (원본 데이터 기반 템플릿) */
export interface StoreDescription {
  storeId: string;
  text: string;
  provider: "template";
  model: string | null;
  updatedAt: string;
}

/** 프로토타입용 가상 집계 (data/mock/store-activity.json — 고정값) */
export interface StoreActivity {
  storeId: string;
  visitCount: number;
  likeCount: number;
  saveCount: number;
  interestUsers: number;
}

export interface Store extends StoreSeed {
  features: StoreFeatures;
  location: StoreLocation;
  /** 생성·저장된 소개가 없으면 null (화면에서는 템플릿 소개 사용) */
  description: StoreDescription | null;
  activity: StoreActivity;
}

export { MAIN_CATEGORIES } from "./parse";
