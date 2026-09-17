"use client";

import { useSyncExternalStore } from "react";
import type { RecommendationsResponse } from "@/lib/api/schemas";
import type { ChatMessage, InputMode, PreferenceAnalysis } from "@/lib/preferences/types";
import { api, errorMessage } from "./api";
import { fetchRecommendations, storeRecommendations } from "./recommendations";
import { getState, latestVersion, MAX_HISTORY, setState } from "./store";

/**
 * 취향 분석 실행기
 * 상태: idle → analyzing → success | error
 * - analyzing 중에만 버튼을 막고, success·error 뒤에는 언제든 다시 실행할 수 있습니다.
 * - 새 분석이 성공해야 활성 프로필이 바뀝니다(실패하면 이전 결과를 그대로 유지).
 */
export type AnalysisStatus = "idle" | "analyzing" | "success" | "error";
export type AnalysisStep = "profile" | "match" | "reasons" | null;

export interface AnalysisRunState {
  status: AnalysisStatus;
  step: AnalysisStep;
  error: string | null;
  /** 마지막으로 성공한 분석 id (결과 화면 안내용) */
  lastAnalysisId: string | null;
  /** Gemini 추천 이유 작성 상태 (분석 성공과 별개로 백그라운드 진행) */
  reasons: "idle" | "running" | "done" | "skipped" | "failed";
  startedAt: number | null;
}

let run: AnalysisRunState = { status: "idle", step: null, error: null, lastAnalysisId: null, reasons: "idle", startedAt: null };
const listeners = new Set<() => void>();

function update(patch: Partial<AnalysisRunState>) {
  run = { ...run, ...patch };
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverSnapshot: AnalysisRunState = { status: "idle", step: null, error: null, lastAnalysisId: null, reasons: "idle", startedAt: null };

export function useAnalysisRun(): AnalysisRunState {
  return useSyncExternalStore(
    subscribe,
    () => run,
    () => serverSnapshot,
  );
}

export function getAnalysisRun(): AnalysisRunState {
  return run;
}

export interface AnalysisInput {
  mode: InputMode;
  messages: ChatMessage[];
  keywords: string[];
}

/** 현재 브라우저에 있는 대화·키워드로 만들 수 있는 입력 (둘 다 있으면 통합) */
export function currentInput(preferred?: InputMode): AnalysisInput | null {
  const state = getState();
  const messages = state.interview.messages;
  const hasChat = messages.some((m) => m.role === "user");
  const hasKeywords = state.keywords.length > 0;
  let mode: InputMode | null = preferred ?? null;
  if (mode === "chat" && !hasChat) mode = null;
  if (mode === "keywords" && !hasKeywords) mode = null;
  if (mode === "both" && !(hasChat && hasKeywords)) mode = null;
  mode ??= hasChat && hasKeywords ? "both" : hasChat ? "chat" : hasKeywords ? "keywords" : null;
  if (!mode) return null;
  return { mode, messages: mode === "keywords" ? [] : completeTurns(messages), keywords: mode === "chat" ? [] : state.keywords };
}

/** 마지막이 답변 없는 질문이면 빼서 (질문·답변) 순서를 맞춥니다. */
function completeTurns(messages: ChatMessage[]): ChatMessage[] {
  const out = [...messages];
  while (out.length && out.at(-1)!.role === "assistant") out.pop();
  return out;
}

async function attachReasons(analysis: PreferenceAnalysis, recs: RecommendationsResponse) {
  const top = recs.items.filter((i) => i.rank !== null).slice(0, 8);
  if (analysis.provider !== "gemini" || top.length === 0) {
    update({ reasons: "skipped" });
    return;
  }
  update({ reasons: "running" });
  try {
    const res = await api.post<{ reasons: Record<string, string>; provider: string; fallbackReason: string | null }>("/api/recommendations/reasons", {
      personaLabel: analysis.personaLabel,
      summary: analysis.profile.summary,
      intentLabel: analysis.profile.intentLabel,
      taste: analysis.profile.categories,
      recent: analysis.focus,
      storeIds: top.map((i) => i.storeId),
    });
    const count = Object.keys(res.reasons).length;
    if (count > 0) {
      setState((s) => {
        if (s.recommendations?.forAnalysisId !== analysis.id) return s;
        const items = s.recommendations.items.map((i) => (res.reasons[i.storeId] ? { ...i, reason: res.reasons[i.storeId]!, reasonProvider: "gemini" as const } : i));
        return { ...s, recommendations: { ...s.recommendations, items, reasonProvider: "gemini" } };
      });
    }
    update({ reasons: count > 0 ? "done" : "failed" });
  } catch {
    update({ reasons: "failed" });
  }
}

/**
 * 분석 실행: /api/analyze → /api/recommendations → (Gemini) 추천 이유
 * 이미 분석 중이면 무시합니다. 성공하면 새 버전을 기록에 추가하고 활성 프로필로 지정합니다.
 */
export async function runAnalysis(input: AnalysisInput): Promise<PreferenceAnalysis | null> {
  if (run.status === "analyzing") return null;
  update({ status: "analyzing", step: "profile", error: null, reasons: "idle", startedAt: Date.now() });
  try {
    const analysis = await api.post<PreferenceAnalysis>("/api/analyze", {
      mode: input.mode,
      messages: input.messages,
      keywords: input.keywords,
      previousVersion: latestVersion(getState()),
    });
    setState((s) => ({
      ...s,
      analyses: [analysis, ...s.analyses.filter((a) => a.id !== analysis.id)].slice(0, MAX_HISTORY),
      activeAnalysisId: analysis.id,
    }));
    update({ step: "match" });
    let recs: RecommendationsResponse | null = null;
    try {
      recs = await fetchRecommendations(analysis);
      storeRecommendations(analysis.id, recs);
    } catch (err) {
      // 분석은 성공했으므로 결과는 유지하고, 추천은 화면에서 다시 계산합니다.
      console.warn("추천 계산 실패:", errorMessage(err));
    }
    update({ status: "success", step: null, lastAnalysisId: analysis.id });
    if (recs) void attachReasons(analysis, recs);
    return analysis;
  } catch (err) {
    update({ status: "error", step: null, error: errorMessage(err) });
    return null;
  }
}

/** 이전 분석 결과를 다시 활성 프로필로 지정 (서버 기록이 없어도 브라우저 기준으로 전환) */
export async function activateAnalysis(analysisId: string) {
  const target = getState().analyses.find((a) => a.id === analysisId);
  if (!target) return;
  setState((s) => ({ ...s, activeAnalysisId: analysisId, recommendations: s.recommendations?.forAnalysisId === analysisId ? s.recommendations : null }));
  try {
    await api.post("/api/profile", { analysisId });
  } catch {
    // 서버 저장소에 없는 결과(메모리 저장소 초기화 등)는 브라우저 기준으로만 전환합니다.
  }
}
