import type { TasteKey, TasteVector } from "@/lib/recommendation/dimensions";
import type { InstagramInterest } from "@/lib/providers/instagram/InstagramDataProvider";

export interface ProfileAnalysisInput {
  instagram: {
    mode: "real" | "mock";
    interests: InstagramInterest[];
    captionsSample: string[];
  } | null;
  items: string[];
}

export interface ProfileAnalysis {
  personaLabel: string;
  summary: string;
  tasteVector: TasteVector;
  recentVector: TasteVector;
  topCategories: { key: TasteKey; score: number; evidence: string }[];
  itemInsights: { input: string; keys: TasteKey[]; note: string }[];
}

export interface ReasonStoreInput {
  id: string;
  name: string;
  storeType: string;
  entityLabel: string;
  category: string;
  confirmedItems: string[];
  matchedTastes: TasteKey[];
  locationNote: string;
}

export interface ReasonInput {
  personaLabel: string | null;
  userTop: { key: TasteKey; score: number }[];
  stores: ReasonStoreInput[];
}

/** 점포 소개 문장 생성 입력 — 엑셀 원본과 추정 성향 라벨만 담습니다. */
export interface StoreDescriptionInput {
  id: string;
  name: string;
  storeType: string;
  entityLabel: string;
  category: string;
  /** 원본 유형·비고에 적힌 품목 */
  confirmedItems: string[];
  /** 추정 성향 중 두드러진 항목의 라벨 (예: "로컬 체험", "특화 거리") */
  marketHighlights: string[];
  locationNote: string;
}

export interface AIProvider {
  readonly name: "gemini" | "mock";
  readonly model: string | null;
  analyzeProfile(input: ProfileAnalysisInput): Promise<ProfileAnalysis>;
  generateReasons(input: ReasonInput): Promise<Record<string, string>>;
  /** (선택) 점포 특성에 대한 자연어 소개 */
  describeStores(stores: StoreDescriptionInput[]): Promise<Record<string, string>>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "quota" | "timeout" | "invalid_response" | "upstream" | "not_found",
    readonly status?: number,
  ) {
    super(message);
  }
}
