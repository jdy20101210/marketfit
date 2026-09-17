import type { Budget, Companion, DiscoveryPreference, InputMode, Occasion, PreferredStyle } from "@/lib/preferences/types";
import type { TasteKey, TasteVector } from "@/lib/recommendation/dimensions";
import type { Store, StoreDescription, StoreFeatures, StoreLocation, StoreSeed } from "@/lib/stores/types";

export const INTERACTION_TYPES = ["view", "like", "bookmark", "dismiss", "visit"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export interface InteractionRecord {
  userId: string;
  storeId: string;
  type: InteractionType;
  /** like/bookmark 해제 시 false 이벤트가 기록됩니다. */
  active: boolean;
  createdAt: string;
}

/**
 * 서버에 저장하는 상황 정보 — 대화 원문은 저장하지 않고 구조화된 값만 보관합니다.
 */
export interface PreferenceContextRecord {
  intent: string | null;
  intentLabel: string | null;
  budget: Budget | null;
  companion: Companion | null;
  occasion: Occasion | null;
  preferredStyle: PreferredStyle[];
  discoveryPreference: DiscoveryPreference | null;
}

/** 취향 분석 결과 1건 (다시 분석할 때마다 analysisVersion이 늘어난 새 행) */
export interface PreferenceRecord {
  id: string;
  userId: string;
  analysisVersion: number;
  inputMode: InputMode;
  /** UserPreferenceProfile.categories */
  tasteVector: TasteVector;
  /** 지금 찾는 것(focus) */
  recentVector: TasteVector;
  topCategories: { key: TasteKey; score: number }[];
  keywords: string[];
  context: PreferenceContextRecord;
  personaLabel: string | null;
  summary: string | null;
  aiProvider: "gemini" | "mock";
  aiModel: string | null;
  /** 현재 추천에 쓰는 결과인지 (사용자당 1건) */
  isActive: boolean;
  createdAt: string;
}

export type NewPreferenceRecord = Omit<PreferenceRecord, "analysisVersion" | "isActive">;

export interface RecommendationRecord {
  userId: string;
  storeId: string;
  score: number;
  rank: number;
  components: Record<string, number>;
  reason: string | null;
  reasonProvider: "gemini" | "template" | null;
  analysisVersion: number | null;
  createdAt: string;
}

/** 상인 인사이트 스냅샷 — 익명 집계만 담습니다(개인 식별 정보 없음). */
export interface MerchantInsightRecord {
  /** null이면 시장 전체 */
  storeId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  distinctUsers: number;
  tasteDistribution: { key: TasteKey; share: number }[];
  interactionCounts: Partial<Record<InteractionType, number>>;
  productIdeas: string[];
  isMock: boolean;
  createdAt: string;
}

/** 시장 관심도 집계용 — 개인 식별 정보 없이 취향 vector와 시각만 */
export interface RecentPreferenceSignal {
  /** 같은 사용자의 여러 분석을 한 번만 세기 위한 내부 키 (화면에 노출하지 않음) */
  userKey: string;
  tasteVector: TasteVector;
  createdAt: string;
}

export interface RepositoryInfo {
  kind: "supabase" | "local-file" | "memory";
  persistent: boolean;
  detail: string;
}

export interface StoreOverrides {
  stores: StoreSeed[] | null;
  features: StoreFeatures[] | null;
  locations: StoreLocation[];
  descriptions: StoreDescription[];
}

export type InteractionCounts = Record<string, Partial<Record<InteractionType, number>>>;

export interface Repository {
  info(): RepositoryInfo;

  readSettings(): Promise<Record<string, string>>;
  writeSettings(patch: Record<string, string | null>): Promise<void>;

  touchUser(userId: string): Promise<void>;

  /** 새 분석 결과를 저장하고 활성 결과로 지정합니다. 버전은 max(저장된 최대 버전, minVersion - 1) + 1 */
  savePreference(record: NewPreferenceRecord, options?: { minVersion?: number }): Promise<{ analysisVersion: number }>;
  /** 사용자별 활성 분석 결과 (없으면 가장 최근 결과) */
  activePreferences(userIds: string[]): Promise<PreferenceRecord[]>;
  listPreferenceHistory(userId: string, limit: number): Promise<PreferenceRecord[]>;
  activatePreference(userId: string, id: string): Promise<boolean>;
  /** 좋아요·방문 등 행동에 따른 취향 조정을 활성 결과에 반영합니다(새 버전을 만들지 않음). */
  updateActivePreferenceVector(userId: string, tasteVector: TasteVector): Promise<void>;
  listRecentPreferences(sinceIso: string, limit: number): Promise<RecentPreferenceSignal[]>;

  addInteraction(record: InteractionRecord): Promise<void>;
  listInteractions(userId: string): Promise<InteractionRecord[]>;
  listPositiveInteractions(limit: number, sinceIso?: string): Promise<InteractionRecord[]>;
  countInteractionsByStore(sinceIso?: string): Promise<InteractionCounts>;
  saveRecommendations(userId: string, records: RecommendationRecord[]): Promise<void>;
  saveMerchantInsight(record: MerchantInsightRecord): Promise<void>;
  latestMerchantInsight(storeId: string | null): Promise<MerchantInsightRecord | null>;

  deleteUserData(userId: string): Promise<void>;

  loadStoreOverrides(): Promise<StoreOverrides>;
  saveStoreLocations(locations: StoreLocation[]): Promise<void>;
  saveStoreDescriptions(descriptions: StoreDescription[]): Promise<void>;
  seedStores(stores: Store[]): Promise<{ stores: number; features: number; removed: number }>;
}
