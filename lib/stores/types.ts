import type { TasteVector } from "@/lib/recommendation/dimensions";
import type { EntityKind, LocationBasis, PhoneStatus } from "./parse";

export type LocationAccuracy = "exact" | "approximate" | "unknown";

/** 엑셀 원본에서 변환한 점포/상권 레코드 (값 추가 없음) */
export interface StoreSeed {
  id: string;
  name: string;
  storeType: string;
  addressRaw: string;
  phoneRaw: string;
  phone: string | null;
  phoneStatus: PhoneStatus;
  source: string;
  note: string;
  entityKind: EntityKind;
  geocodeQuery: string | null;
  addressDetail: string | null;
  locationBasis: LocationBasis;
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
      return [k, Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : (fallback?.[k] ?? 0)];
    }),
  ) as MarketFeatures;
}

export const MARKET_FEATURE_META: Record<MarketFeatureKey, { label: string; hint: string }> = {
  market_representativeness: { label: "시장 대표성", hint: "중앙시장을 대표하는 상가·상권인지" },
  historicalness: { label: "역사성", hint: "오래된 시장 문화와의 연결 (시장 공통 기반 추정)" },
  local_experience: { label: "로컬 체험", hint: "먹거리·노점·전통 품목처럼 시장에서만 해볼 수 있는 경험" },
  specialized_street: { label: "특화 거리", hint: "품목별로 모여 있는 상권·골목 성격" },
  locality: { label: "지역성", hint: "대전 원도심 로컬 경험 정도" },
};

/** 추천용 성향 (기본 업종과 분리) */
export interface StoreFeatures {
  storeId: string;
  primaryCategory: StoreCategory;
  categories: StoreCategory[];
  taste: TasteVector;
  market: MarketFeatures;
  /** 알려진 정도(0~1). 낮을수록 discovery bonus가 커집니다. */
  exposure: number;
  tags: string[];
  /** 원본 유형/비고에 실제로 적힌 품목 */
  productHints: string[];
  recommendable: boolean;
  rationale: string;
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

/** 저장된 점포 소개 (관리자 화면에서 생성) */
export interface StoreDescription {
  storeId: string;
  text: string;
  provider: "gemini" | "template";
  model: string | null;
  updatedAt: string;
}

export interface Store extends StoreSeed {
  features: StoreFeatures;
  location: StoreLocation;
  /** 생성·저장된 소개가 없으면 null (화면에서는 템플릿 소개 사용) */
  description: StoreDescription | null;
}

export const STORE_CATEGORIES = [
  "먹거리",
  "패션·의류",
  "잡화·소품",
  "한복·원단·수예",
  "리빙·침구",
  "주방·식기",
  "복합 상가",
  "시장 안내",
] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];
