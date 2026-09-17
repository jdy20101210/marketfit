/** 클라이언트 ↔ 서버 공용 요청/응답 스키마 */
import { z } from "zod";
import { TASTE_KEYS, type TasteKey, type TasteVector } from "@/lib/recommendation/dimensions";
import type { ScoreComponents } from "@/lib/recommendation/engine";
import type { LocationAccuracy, StoreCategory } from "@/lib/stores/types";
import type { EntityKind, LocationBasis, LocLevel, PhoneStatus } from "@/lib/stores/parse";

// 기본 검증 메시지를 한국어로 (직접 지정한 메시지는 그대로 사용)
z.config(z.locales.ko());

const unit = z.number().min(0).max(1);

export const TasteVectorSchema = z.object(Object.fromEntries(TASTE_KEYS.map((k) => [k, unit])) as Record<TasteKey, typeof unit>);

export const InterestItemSchema = z
  .string()
  .trim()
  .min(1, "빈 항목이 있어요")
  .max(30, "관심 상품은 30자 이내로 입력해주세요")
  .refine((v) => !/[<>{}]/.test(v), "사용할 수 없는 문자가 있어요");

/** 띄어쓰기·대소문자만 다른 항목도 같은 상품으로 봅니다. */
export const normalizeInterestItem = (v: string) => v.toLowerCase().replace(/\s+/g, "");

export const InterestItemsSchema = z
  .array(InterestItemSchema)
  .max(5, "관심 상품은 최대 5개까지 입력할 수 있어요")
  .refine((items) => new Set(items.map(normalizeInterestItem)).size === items.length, "같은 관심 상품이 중복되었어요");

export const InstagramInterestSchema = z.object({
  keyword: z.string().trim().min(1).max(30),
  score: unit,
});

export const InteractionStateSchema = z.object({
  liked: z.array(z.string().max(20)).max(100).default([]),
  bookmarked: z.array(z.string().max(20)).max(100).default([]),
  visited: z.array(z.string().max(20)).max(100).default([]),
  dismissed: z.array(z.string().max(20)).max(100).default([]),
});
export type InteractionState = z.infer<typeof InteractionStateSchema>;

export const AnalyzeRequestSchema = z.object({
  items: InterestItemsSchema,
  instagram: z
    .object({
      mode: z.enum(["real", "mock"]),
      personaId: z.string().max(30).nullable().optional(),
      interests: z.array(InstagramInterestSchema).max(20),
    })
    .nullable(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const RecommendationRequestSchema = z.object({
  profile: z.object({
    taste: TasteVectorSchema,
    recent: TasteVectorSchema.nullable(),
  }),
  interactions: InteractionStateSchema.optional(),
});

export const ReasonsRequestSchema = z.object({
  personaLabel: z.string().max(40).nullable(),
  taste: TasteVectorSchema,
  recent: TasteVectorSchema.nullable(),
  storeIds: z.array(z.string().max(20)).min(1).max(12),
});

export const InteractionRequestSchema = z.object({
  storeId: z.string().max(20),
  type: z.enum(["view", "like", "bookmark", "dismiss", "visit"]),
  active: z.boolean().default(true),
  taste: TasteVectorSchema.nullable().optional(),
});

export const SaveProfileRequestSchema = z.object({
  taste: TasteVectorSchema,
  recent: TasteVectorSchema,
  topCategories: z.array(z.object({ key: z.enum(TASTE_KEYS), score: unit })).max(10),
  items: InterestItemsSchema,
  instagramKeywords: z.array(InstagramInterestSchema).max(20),
  instagramMode: z.enum(["real", "mock", "none"]),
  personaLabel: z.string().max(40).nullable(),
  summary: z.string().max(400).nullable(),
  aiProvider: z.enum(["gemini", "mock"]),
});

// ---------- 응답 DTO ----------

/**
 * 점포 응답 — 엑셀 원본 정보(raw)와 규칙으로 추정한 추천 성향(inferred)을 나눠 담습니다.
 */
export interface StoreDTO {
  id: string;
  name: string;
  /** 원본 품목을 가운뎃점으로 연결한 표시용 문자열 */
  storeType: string;
  /** 원본 정보 (엑셀) */
  raw: {
    sourceIds: number[];
    items: string[];
    itemsRaw: string;
    categoriesRaw: string;
    addressRaw: string;
    addressClean: string | null;
    zone: string | null;
    locLevel: LocLevel;
    phoneRaw: string;
    source: string;
    collectedAt: string;
  };
  mainCategory: string;
  subCategory: string;
  addressDetail: string | null;
  geocodeQuery: string | null;
  locationBasis: LocationBasis;
  phone: string | null;
  phoneStatus: PhoneStatus;
  /** 변환 과정 메모 (병합·형식 확인 등) */
  note: string;
  entityKind: EntityKind;
  /** 추정 정보 (규칙 기반) */
  inferred: {
    by: "rule";
    taste: TasteVector;
    market: Record<string, number>;
    exposure: number;
    rationale: string;
  };
  primaryCategory: StoreCategory;
  categories: StoreCategory[];
  tags: string[];
  productHints: string[];
  recommendable: boolean;
  /** 프로토타입 가상 집계 (고정값) */
  activity: { visitCount: number; likeCount: number; saveCount: number; interestUsers: number };
  /** 점포 소개 (저장된 AI/템플릿 소개가 없으면 원본 데이터 기반 템플릿) */
  description: { text: string; provider: "gemini" | "template"; updatedAt: string | null };
  location: {
    lat: number | null;
    lng: number | null;
    accuracy: LocationAccuracy;
    note: string;
  };
}

export interface RecommendationItem {
  storeId: string;
  score: number;
  raw: number;
  components: ScoreComponents;
  matchedTastes: { key: TasteKey; user: number; store: number; contribution: number }[];
  matchedProducts: string[];
  reason: string;
  reasonProvider: "gemini" | "template";
  recommendable: boolean;
  dismissed: boolean;
}

export interface ProfileResult {
  personaLabel: string;
  summary: string;
  taste: TasteVector;
  recent: TasteVector;
  topCategories: { key: TasteKey; score: number; evidence: string }[];
  itemInsights: { input: string; keys: TasteKey[]; note: string }[];
  provider: "gemini" | "mock";
  model: string | null;
  fallbackReason: string | null;
}

export interface PublicConfig {
  modes: {
    instagram: "real" | "mock";
    ai: "gemini" | "mock";
    map: "kakao" | "mock";
    geocoding: "kakao" | "mock";
    storage: "supabase" | "local-file" | "memory";
  };
  kakaoJsKey: string | null;
  instagram: {
    connected: boolean;
    username: string | null;
    mediaAnalyzed: number;
  };
}
