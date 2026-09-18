/** 클라이언트 ↔ 서버 공용 요청/응답 스키마 */
import { z } from "zod";
import { INPUT_MODES, INTERVIEW_SLOTS, MAX_QUESTIONS } from "@/lib/preferences/types";
import { TASTE_KEYS, type TasteKey, type TasteVector } from "@/lib/recommendation/dimensions";
import type { ScoreComponents } from "@/lib/recommendation/engine";
import type { LocationAccuracy, StoreCategory } from "@/lib/stores/types";
import type { EntityKind, LocationBasis, LocLevel, PhoneStatus } from "@/lib/stores/parse";

// 기본 검증 메시지를 한국어로 (직접 지정한 메시지는 그대로 사용)
z.config(z.locales.ko());

const unit = z.number().min(0).max(1);

export const TasteVectorSchema = z.object(Object.fromEntries(TASTE_KEYS.map((k) => [k, unit])) as Record<TasteKey, typeof unit>);

const storeId = z.string().min(1).max(20);

export const InteractionStateSchema = z.object({
  liked: z.array(storeId).max(200).default([]),
  bookmarked: z.array(storeId).max(200).default([]),
  visited: z.array(storeId).max(200).default([]),
  dismissed: z.array(storeId).max(200).default([]),
});
export type InteractionState = z.infer<typeof InteractionStateSchema>;

// ---------- 취향 입력 ----------

const safeText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label}을(를) 입력해주세요`)
    .max(max, `${label}은(는) ${max}자 이내로 입력해주세요`)
    .refine((v) => !/[<>{}]/.test(v), "사용할 수 없는 문자가 있어요");

export const ChatMessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  text: safeText(300, "메시지"),
  slot: z.enum(INTERVIEW_SLOTS).nullable().optional(),
});

/** 인사말 1개 + (답변·질문) 최대 6쌍 */
const MAX_MESSAGES = MAX_QUESTIONS * 2 + 1;

export const ConversationSchema = z
  .array(ChatMessageSchema)
  .max(MAX_MESSAGES, "대화가 너무 길어요. 지금까지 내용으로 분석해 주세요.")
  .refine((messages) => messages.every((m, i) => m.role === (i % 2 === 0 ? "assistant" : "user")), "대화 순서가 올바르지 않아요.");

export const InterviewRequestSchema = z.object({
  messages: ConversationSchema.refine((m) => m.length >= 2 && m.at(-1)?.role === "user", "답변을 입력해주세요."),
});

/** 띄어쓰기·대소문자만 다른 키워드도 같은 키워드로 봅니다. */
export const normalizeKeyword = (v: string) => v.toLowerCase().replace(/\s+/g, "");

export const KeywordsSchema = z
  .array(safeText(20, "키워드"))
  .max(10, "키워드는 최대 10개까지 입력할 수 있어요")
  .refine((items) => new Set(items.map(normalizeKeyword)).size === items.length, "같은 키워드가 중복되었어요");

export const AnalyzeRequestSchema = z
  .object({
    mode: z.enum(INPUT_MODES),
    messages: ConversationSchema.default([]),
    keywords: KeywordsSchema.default([]),
    /** 브라우저에 저장된 마지막 분석 버전 (서버 저장소가 초기화돼도 버전이 거꾸로 가지 않도록) */
    previousVersion: z.number().int().min(0).max(100000).optional(),
  })
  .superRefine((body, ctx) => {
    const answers = body.messages.filter((m) => m.role === "user").length;
    if (body.mode !== "keywords" && answers === 0) {
      ctx.addIssue({ code: "custom", message: "AI와 대화한 내용이 없어요. 먼저 질문에 답해주세요.", path: ["messages"] });
    }
    if (body.mode !== "chat" && body.keywords.length === 0) {
      ctx.addIssue({ code: "custom", message: "키워드를 1개 이상 입력해주세요.", path: ["keywords"] });
    }
  });
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const ActivateAnalysisRequestSchema = z.object({
  analysisId: z.string().min(1).max(64),
});

// ---------- 추천 ----------

export const RecommendationRequestSchema = z.object({
  profile: z.object({
    taste: TasteVectorSchema,
    recent: TasteVectorSchema.nullable(),
  }),
  interactions: InteractionStateSchema.optional(),
  /** 추천 기준 미만이어도 상세 점수가 필요한 점포 (상세 화면) */
  include: z.array(storeId).max(5).optional(),
  analysisVersion: z.number().int().min(0).max(100000).nullable().optional(),
});

export const InteractionRequestSchema = z.object({
  storeId,
  type: z.enum(["view", "like", "bookmark", "dismiss", "visit"]),
  active: z.boolean().default(true),
  taste: TasteVectorSchema.nullable().optional(),
});

export const MerchantPromoRequestSchema = z.object({
  storeId: storeId.nullable(),
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
  /** 점포 소개 (원본 데이터 기반 템플릿 문장) */
  description: { text: string; provider: "template"; updatedAt: string | null };
  location: {
    lat: number | null;
    lng: number | null;
    accuracy: LocationAccuracy;
    note: string;
  };
}

export interface RecommendationItem {
  storeId: string;
  /** 추천 순위 (기준 점수 이상일 때만, 지도·목록 공통) */
  rank: number | null;
  score: number;
  raw: number;
  components: ScoreComponents;
  matchedTastes: { key: TasteKey; user: number; store: number; contribution: number }[];
  matchedProducts: string[];
  facet: TasteKey | null;
  reason: string;
  /** 추천 이유는 점포 원본 데이터와 매칭 결과로 만든 문장입니다 (외부 AI 미사용) */
  reasonProvider: "template";
  recommendable: boolean;
  dismissed: boolean;
}

export interface RecommendationThreshold {
  primary: number;
  fallback: number;
  /** 실제 적용된 기준 (없으면 일치하는 점포 없음) */
  applied: number | null;
  usedFallback: boolean;
}

export interface RecommendationsResponse {
  /** 순위가 매겨진 추천 점포(점수 내림차순) + include로 요청한 점포 */
  items: RecommendationItem[];
  threshold: RecommendationThreshold;
  counts: { atPrimary: number; atFallback: number; scored: number; dismissed: number };
  bestScore: number;
  /** 전체 점포 점수 (상세 화면·목록 표시용, 기준 미만 포함) */
  scores: Record<string, number>;
  interactions: InteractionState;
  analysisVersion: number | null;
  generatedAt: string;
}

export interface PublicConfig {
  modes: {
    ai: "builtin";
    map: "kakao" | "mock";
    geocoding: "kakao" | "mock";
    storage: "supabase" | "local-file" | "memory";
  };
  kakaoJsKey: string | null;
}
