/**
 * 사용자 취향 입력(AI 인터뷰·키워드)과 분석 결과의 공용 타입 (클라이언트/서버 공용)
 */
import type { TasteKey, TasteVector } from "@/lib/recommendation/dimensions";
import { formatNumber } from "@/lib/format";

export const INPUT_MODES = ["chat", "keywords", "both"] as const;
export type InputMode = (typeof INPUT_MODES)[number];

export const INPUT_MODE_LABEL: Record<InputMode, string> = {
  chat: "AI 대화",
  keywords: "키워드",
  both: "대화 + 키워드",
};

/** 인터뷰에서 채우는 항목. 앞의 세 항목이 핵심이고, 나머지는 질문 수가 부족할 때만 묻습니다. */
export const INTERVIEW_SLOTS = ["looking_for", "budget", "style", "companion", "taste", "discovery"] as const;
export type InterviewSlot = (typeof INTERVIEW_SLOTS)[number];
export const CORE_SLOTS: InterviewSlot[] = ["looking_for", "budget", "style"];

export const COMPANIONS = ["alone", "friend", "partner", "family", "kids", "parents", "colleague"] as const;
export type Companion = (typeof COMPANIONS)[number];
export const COMPANION_LABEL: Record<Companion, string> = {
  alone: "나를 위해",
  friend: "친구",
  partner: "연인",
  family: "가족",
  kids: "아이",
  parents: "부모님",
  colleague: "동료",
};

export const OCCASIONS = ["birthday", "holiday", "anniversary", "housewarming", "wedding", "travel", "camping", "daily"] as const;
export type Occasion = (typeof OCCASIONS)[number];
export const OCCASION_LABEL: Record<Occasion, string> = {
  birthday: "생일",
  holiday: "명절",
  anniversary: "기념일",
  housewarming: "집들이",
  wedding: "혼례·예단",
  travel: "여행",
  camping: "캠핑",
  daily: "일상 장보기",
};

export const STYLES = ["local_unique", "practical", "traditional", "trendy", "vintage", "value", "premium"] as const;
export type PreferredStyle = (typeof STYLES)[number];
export const STYLE_LABEL: Record<PreferredStyle, string> = {
  local_unique: "대전만의 독특한",
  practical: "실용적인",
  traditional: "전통적인",
  trendy: "요즘 감성",
  vintage: "레트로·빈티지",
  value: "가성비",
  premium: "품질 우선",
};

export const DISCOVERY_PREFERENCES = ["familiar", "balanced", "new"] as const;
export type DiscoveryPreference = (typeof DISCOVERY_PREFERENCES)[number];
export const DISCOVERY_LABEL: Record<DiscoveryPreference, string> = {
  familiar: "잘 알려진 가게 선호",
  balanced: "새로운 곳도 괜찮음",
  new: "숨은 가게 발견 선호",
};

export interface Budget {
  min: number | null;
  max: number | null;
}

export interface ChatMessage {
  role: "assistant" | "user";
  text: string;
  /** 이 질문이 채우려는 항목 (assistant 메시지) */
  slot?: InterviewSlot | null;
}

/**
 * UserPreferenceProfile — AI 인터뷰와 키워드 입력의 결과 구조는 같습니다.
 * 예) { categories: { gift: 0.94, local: 0.91, ... }, budget: { max: 20000 }, intent: "birthday_gift", summary: "..." }
 */
export interface UserPreferenceProfile {
  /** 취향 차원별 점수 (0~1, 19개 차원) */
  categories: TasteVector;
  budget: Budget | null;
  intent: string | null;
  intentLabel: string | null;
  lookingFor: string | null;
  companion: Companion | null;
  occasion: Occasion | null;
  preferredStyle: PreferredStyle[];
  discoveryPreference: DiscoveryPreference | null;
  summary: string;
}

export interface KeywordInsight {
  input: string;
  keys: TasteKey[];
  /** 의미 확장: 함께 반영한 관련 취향 */
  expanded: string[];
  note: string;
}

/** 분석 1회 결과 (다시 분석하면 analysisVersion이 1씩 늘어난 새 결과가 생깁니다) */
export interface PreferenceAnalysis {
  id: string;
  analysisVersion: number;
  inputMode: InputMode;
  profile: UserPreferenceProfile;
  /** 지금 찾는 것(목적) vector — 추천 점수의 '지금 찾는 것' 항목에 사용 */
  focus: TasteVector;
  personaLabel: string;
  topCategories: { key: TasteKey; score: number; evidence: string }[];
  keywordInsights: KeywordInsight[];
  inputs: { keywords: string[]; answers: number };
  /** 취향 해석 엔진 — 서비스 내장 챗봇 엔진 하나만 사용합니다 (외부 AI API 없음) */
  provider: "builtin";
  storage: "supabase" | "local-file" | "memory" | "browser-only";
  createdAt: string;
}

/** 인터뷰 중 파악한 내용 (화면 표시·분석 힌트) */
export interface InterviewSlots {
  lookingFor: string | null;
  intent: string | null;
  intentLabel: string | null;
  budget: Budget | null;
  /** 예산을 묻는 질문에 '상관없음'이라고 답한 경우 */
  budgetOpen: boolean;
  preferredStyle: PreferredStyle[];
  companion: Companion | null;
  occasion: Occasion | null;
  discoveryPreference: DiscoveryPreference | null;
  tasteWords: string[];
  answered: InterviewSlot[];
}

export interface InterviewTurn {
  reply: string;
  slot: InterviewSlot | null;
  done: boolean;
  suggestions: string[];
  slots: InterviewSlots;
  questionCount: number;
  /** builtin: 내장 엔진이 고른 질문 / rule: 질문 수 한도·종료 요청으로 대화를 마무리한 경우 */
  provider: "builtin" | "rule";
}

export const MAX_QUESTIONS = 6;
export const MIN_ANSWERS = 3;

export const INTERVIEW_GREETING: ChatMessage = {
  role: "assistant",
  text: "안녕하세요! 지금 중앙시장에서 무엇을 찾고 계세요?",
  slot: "looking_for",
};
export const GREETING_SUGGESTIONS = ["친구 생일 선물", "시장 먹거리 구경", "캠핑 용품", "집 꾸미기 소품"];

export function formatWon(value: number): string {
  if (value >= 10000 && value % 10000 === 0) return `${value / 10000}만원`;
  if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}만원`;
  if (value >= 1000 && value % 1000 === 0) return `${value / 1000}천원`;
  return `${formatNumber(value)}원`;
}

export function budgetLabel(budget: Budget | null): string | null {
  if (!budget || (budget.min === null && budget.max === null)) return null;
  if (budget.min !== null && budget.max !== null) {
    return budget.min === budget.max ? `${formatWon(budget.max)} 정도` : `${formatWon(budget.min)}~${formatWon(budget.max)}`;
  }
  if (budget.max !== null) return `${formatWon(budget.max)} 이하`;
  return `${formatWon(budget.min!)} 이상`;
}
