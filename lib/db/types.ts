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

export interface PreferenceRecord {
  userId: string;
  tasteVector: TasteVector;
  recentVector: TasteVector;
  topCategories: { key: TasteKey; score: number }[];
  interestInputs: string[];
  instagramKeywords: { keyword: string; score: number }[];
  instagramMode: "real" | "mock" | "none";
  personaLabel: string | null;
  summary: string | null;
  aiProvider: "gemini" | "mock";
  createdAt: string;
}

export interface RecommendationRecord {
  userId: string;
  storeId: string;
  score: number;
  rank: number;
  components: Record<string, number>;
  reason: string | null;
  reasonProvider: "gemini" | "template" | null;
  createdAt: string;
}

export interface InstagramSignals {
  username: string | null;
  accountType: string | null;
  mediaAnalyzed: number;
  interests: { keyword: string; score: number }[];
  captionsSample: string[];
  fetchedAt: string;
}

export interface SocialConnectionRecord {
  userId: string;
  provider: "instagram";
  status: "connected" | "disconnected" | "revoked" | "error";
  externalUserId: string | null;
  username: string | null;
  accountType: string | null;
  signals: InstagramSignals | null;
  /** 암호화된 access token (평문 저장 금지) */
  tokenEncrypted: string | null;
  tokenExpiresAt: string | null;
  updatedAt: string;
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

export interface Repository {
  info(): RepositoryInfo;

  readSettings(): Promise<Record<string, string>>;
  writeSettings(patch: Record<string, string | null>): Promise<void>;

  touchUser(userId: string): Promise<void>;
  savePreference(record: PreferenceRecord): Promise<void>;
  latestPreferences(userIds: string[]): Promise<PreferenceRecord[]>;
  addInteraction(record: InteractionRecord): Promise<void>;
  listInteractions(userId: string): Promise<InteractionRecord[]>;
  listPositiveInteractions(limit: number): Promise<InteractionRecord[]>;
  countInteractionsByStore(): Promise<Record<string, Partial<Record<InteractionType, number>>>>;
  saveRecommendations(userId: string, records: RecommendationRecord[]): Promise<void>;
  saveMerchantInsight(record: MerchantInsightRecord): Promise<void>;
  latestMerchantInsight(storeId: string | null): Promise<MerchantInsightRecord | null>;

  upsertSocialConnection(record: SocialConnectionRecord): Promise<void>;
  getSocialConnection(userId: string, provider: "instagram"): Promise<SocialConnectionRecord | null>;
  revokeSocialByExternalId(provider: "instagram", externalUserId: string): Promise<string[]>;
  deleteUserData(userId: string): Promise<void>;

  loadStoreOverrides(): Promise<StoreOverrides>;
  saveStoreLocations(locations: StoreLocation[]): Promise<void>;
  saveStoreDescriptions(descriptions: StoreDescription[]): Promise<void>;
  seedStores(stores: Store[]): Promise<{ stores: number; features: number }>;
}
