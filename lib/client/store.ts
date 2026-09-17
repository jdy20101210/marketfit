"use client";

import { useSyncExternalStore } from "react";
import type { ProfileResult, RecommendationItem } from "@/lib/api/schemas";
import type { TasteVector } from "@/lib/recommendation/dimensions";

/**
 * 브라우저에 보관하는 사용자 상태 (비밀 정보 없음)
 * - access token 같은 비밀 값은 절대 저장하지 않습니다(서버 HttpOnly 쿠키/DB에만 존재).
 * - 서버리스 환경에서 DB 없이도 흐름이 이어지도록 취향·추천 결과를 보관합니다.
 */

export type OnboardingMode = "instagram" | "manual" | "both";

export interface InstagramSummary {
  mode: "real" | "mock";
  demoReason: "not_configured" | "not_connected" | "requested" | null;
  username: string | null;
  mediaAnalyzed: number;
  interests: { keyword: string; score: number }[];
  personaId: string | null;
  personaLabel: string | null;
  fetchedAt: string;
}

export interface MarketFitState {
  version: 1;
  onboarding: {
    mode: OnboardingMode;
    items: string[];
    personaId: string | null;
    preferDemo: boolean;
    updatedAt: string;
  } | null;
  instagram: InstagramSummary | null;
  profile: (ProfileResult & { createdAt: string; instagramModeUsed: "real" | "mock" | "none"; items: string[] }) | null;
  recommendations: {
    items: RecommendationItem[];
    generatedAt: string;
    reasonProvider: "gemini" | "template";
  } | null;
  interactions: {
    liked: string[];
    bookmarked: string[];
    visited: string[];
    dismissed: string[];
  };
}

const KEY = "marketfit:v1";

const EMPTY: MarketFitState = {
  version: 1,
  onboarding: null,
  instagram: null,
  profile: null,
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
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MarketFitState>;
      if (parsed.version === 1) {
        memory = { ...EMPTY, ...parsed, interactions: { ...EMPTY.interactions, ...parsed.interactions } };
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
  memory = EMPTY;
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

export type InteractionList = keyof MarketFitState["interactions"];

export function toggleInList(list: InteractionList, storeId: string, active: boolean) {
  setState((prev) => {
    const current = new Set(prev.interactions[list]);
    if (active) current.add(storeId);
    else current.delete(storeId);
    return { ...prev, interactions: { ...prev.interactions, [list]: [...current] } };
  });
}

export function updateProfileTaste(taste: TasteVector) {
  setState((prev) => (prev.profile ? { ...prev, profile: { ...prev.profile, taste } } : prev));
}
