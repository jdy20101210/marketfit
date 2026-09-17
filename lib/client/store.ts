"use client";

import { useSyncExternalStore } from "react";
import type { InteractionState, RecommendationsResponse } from "@/lib/api/schemas";
import {
  GREETING_SUGGESTIONS,
  INTERVIEW_GREETING,
  type ChatMessage,
  type InputMode,
  type InterviewSlots,
  type InterviewTurn,
  type PreferenceAnalysis,
} from "@/lib/preferences/types";
import type { TasteVector } from "@/lib/recommendation/dimensions";

/**
 * 브라우저에 보관하는 사용자 상태 (비밀 정보 없음)
 * - 대화 내용·키워드·분석 결과·추천·좋아요/저장 표시를 이 브라우저에만 보관합니다.
 * - 서버리스 환경에서 DB 없이도 흐름이 이어지도록 분석 결과(버전 기록 포함)를 보관합니다.
 */

export interface InterviewDraftState {
  messages: ChatMessage[];
  done: boolean;
  suggestions: string[];
  slots: InterviewSlots | null;
  provider: InterviewTurn["provider"] | null;
  questionCount: number;
}

export interface StoredRecommendations extends RecommendationsResponse {
  forAnalysisId: string;
  reasonProvider: "gemini" | "template";
}

export interface MarketFitState {
  version: 2;
  tab: "chat" | "keywords";
  interview: InterviewDraftState;
  keywords: string[];
  /** 분석 결과 기록 (최신순, 최대 10개) */
  analyses: PreferenceAnalysis[];
  activeAnalysisId: string | null;
  recommendations: StoredRecommendations | null;
  interactions: InteractionState;
}

const KEY = "marketfit:v2";
const LEGACY_KEYS = ["marketfit:v1"];
export const MAX_HISTORY = 10;

export function freshInterview(): InterviewDraftState {
  return { messages: [INTERVIEW_GREETING], done: false, suggestions: GREETING_SUGGESTIONS, slots: null, provider: null, questionCount: 1 };
}

const EMPTY: MarketFitState = {
  version: 2,
  tab: "chat",
  interview: freshInterview(),
  keywords: [],
  analyses: [],
  activeAnalysisId: null,
  recommendations: null,
  interactions: { liked: [], bookmarked: [], visited: [], dismissed: [] },
};

let memory: MarketFitState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load(): MarketFitState {
  if (loaded) return memory;
  loaded = true;
  try {
    for (const legacy of LEGACY_KEYS) window.localStorage.removeItem(legacy);
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MarketFitState>;
      if (parsed.version === 2) {
        memory = {
          ...EMPTY,
          ...parsed,
          interview: { ...EMPTY.interview, ...parsed.interview },
          interactions: { ...EMPTY.interactions, ...parsed.interactions },
          analyses: Array.isArray(parsed.analyses) ? parsed.analyses.slice(0, MAX_HISTORY) : [],
        };
      }
    }
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등) → 메모리만 사용
  }
  return memory;
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // ignore
  }
}

export function getState(): MarketFitState {
  if (typeof window === "undefined") return EMPTY;
  return load();
}

export function setState(updater: (prev: MarketFitState) => MarketFitState) {
  memory = updater(getState());
  persist();
  for (const l of listeners) l();
}

export function resetState() {
  memory = { ...EMPTY, interview: freshInterview() };
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      loaded = false;
      load();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** SSR에서는 빈 상태, 하이드레이션 이후 저장된 상태를 반환합니다. */
export function useMarketFit(): { state: MarketFitState; hydrated: boolean } {
  const state = useSyncExternalStore(subscribe, getState, () => EMPTY);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return { state, hydrated };
}

export function activeAnalysis(state: MarketFitState): PreferenceAnalysis | null {
  return state.analyses.find((a) => a.id === state.activeAnalysisId) ?? null;
}

export function latestVersion(state: MarketFitState): number {
  return state.analyses.reduce((m, a) => Math.max(m, a.analysisVersion), 0);
}

export type InteractionList = keyof MarketFitState["interactions"];

export function toggleInList(list: InteractionList, storeId: string, active: boolean) {
  setState((prev) => {
    const current = new Set(prev.interactions[list]);
    if (active) current.add(storeId);
    else current.delete(storeId);
    return { ...prev, interactions: { ...prev.interactions, [list]: [...current] } };
  });
}

/** 행동 기록에 따른 취향 조정을 활성 분석 결과에 반영합니다(새 버전을 만들지 않음). */
export function updateActiveTaste(taste: TasteVector) {
  setState((prev) => ({
    ...prev,
    analyses: prev.analyses.map((a) => (a.id === prev.activeAnalysisId ? { ...a, profile: { ...a.profile, categories: taste } } : a)),
  }));
}

export function setInputMode(mode: InputMode) {
  setState((prev) => ({ ...prev, tab: mode === "keywords" ? "keywords" : "chat" }));
}
