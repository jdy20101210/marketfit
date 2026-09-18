import type { ChatMessage, InputMode, InterviewSlot, InterviewSlots, KeywordInsight, UserPreferenceProfile } from "@/lib/preferences/types";
import type { TasteKey, TasteVector } from "@/lib/recommendation/dimensions";

// ---------- 취향 인터뷰 ----------

export interface InterviewInput {
  messages: ChatMessage[];
  /** 규칙으로 먼저 파악한 내용 (이미 답한 항목을 다시 묻지 않도록 전달) */
  known: InterviewSlots;
  answeredCount: number;
  askedSlots: InterviewSlot[];
  maxQuestions: number;
  minAnswers: number;
}

export interface InterviewDraft {
  reply: string;
  slot: InterviewSlot | null;
  done: boolean;
  suggestions: string[];
}

// ---------- 취향 분석 ----------

export interface PreferenceInput {
  mode: InputMode;
  messages: ChatMessage[];
  keywords: string[];
  /** 규칙으로 추출한 상황 정보 (AI 힌트) */
  known: InterviewSlots;
}

export interface PreferenceDraft {
  profile: UserPreferenceProfile;
  focus: TasteVector;
  personaLabel: string;
  topCategories: { key: TasteKey; score: number; evidence: string }[];
  keywordInsights: KeywordInsight[];
}

/** 점포 소개 문장 생성 입력 — 엑셀 원본과 추정 성향 라벨만 담습니다. */
export interface StoreDescriptionInput {
  id: string;
  name: string;
  storeType: string;
  entityLabel: string;
  /** '대분류 > 소분류' */
  category: string;
  /** 원본 품목 */
  confirmedItems: string[];
  /** 추정 성향 중 두드러진 항목의 라벨 (예: "로컬 체험", "특화 거리") */
  marketHighlights: string[];
  locationNote: string;
}

// ---------- 상인 AI 홍보 도우미 ----------

export interface MerchantPromoInput {
  /** null이면 시장 전체 */
  store: {
    id: string;
    name: string;
    category: string;
    entityLabel: string;
    confirmedItems: string[];
    locationNote: string;
  } | null;
  period: string;
  interestTop: { key: TasteKey; label: string; share: number }[];
  lowConversion: { key: TasteKey; label: string; interestShare: number; visitShare: number }[];
  metrics: { interestUsers: number; visits: number; likes: number; saves: number } | null;
}

export interface PromoIdea {
  title: string;
  detail: string;
  /** confirmed: 원본 품목만 사용 / idea: 원본에 없는 구성·서비스를 포함한 제안 */
  basis: "confirmed" | "idea";
  items: string[];
}

export interface MerchantPromoDraft {
  interestSummary: string;
  conversionInsight: string;
  displayIdeas: PromoIdea[];
  keywords: string[];
  snsCopy: string;
  eventIdeas: { title: string; detail: string }[];
}

export interface AIProvider {
  readonly name: "builtin";
  interviewTurn(input: InterviewInput): Promise<InterviewDraft>;
  analyzePreferences(input: PreferenceInput): Promise<PreferenceDraft>;
  /** 점포 소개 문장 (엑셀 원본 + 추정 성향 라벨만 사용) */
  describeStores(stores: StoreDescriptionInput[]): Promise<Record<string, string>>;
  generateMerchantPromo(input: MerchantPromoInput): Promise<MerchantPromoDraft>;
}
