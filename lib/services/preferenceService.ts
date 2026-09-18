import "server-only";
import { randomUUID } from "node:crypto";
import { getRepository } from "@/lib/db";
import { extractSlots, interviewState, ruleInterviewTurn } from "@/lib/preferences/extract";
import {
  MAX_QUESTIONS,
  MIN_ANSWERS,
  type ChatMessage,
  type InputMode,
  type InterviewTurn,
  type PreferenceAnalysis,
} from "@/lib/preferences/types";
import { analyzePreferences, interviewTurn } from "@/lib/providers/ai";

/**
 * AI 인터뷰 한 턴 (서비스 내장 챗봇 엔진)
 * - 질문 수(최대 6)·최소 답변 수(3)·중복 질문 방지는 서버가 최종 결정합니다.
 * - 대화 원문은 저장하지 않고, 파악한 상황 정보(슬롯)만 화면으로 돌려줍니다.
 */
export async function runInterviewTurn(messages: ChatMessage[]): Promise<InterviewTurn> {
  const state = interviewState(messages);
  const questionCount = state.askedCount;
  if (state.done) {
    const closing = ruleInterviewTurn(messages);
    return { reply: closing.reply, slot: null, done: true, suggestions: [], slots: state.slots, questionCount, provider: "rule" };
  }

  const draft = await interviewTurn({
    messages,
    known: state.slots,
    answeredCount: state.answeredCount,
    askedSlots: state.askedSlots,
    maxQuestions: MAX_QUESTIONS,
    minAnswers: MIN_ANSWERS,
  });

  return {
    reply: draft.reply,
    slot: draft.slot,
    done: draft.done,
    suggestions: draft.suggestions,
    slots: state.slots,
    questionCount: questionCount + (draft.done ? 0 : 1),
    provider: "builtin",
  };
}

/**
 * 대화·키워드 → UserPreferenceProfile (내장 챗봇 엔진) → 새 분석 버전으로 저장
 * 저장에 실패해도 분석 결과는 돌려주고, 브라우저에 보관된 결과로 흐름을 이어갑니다.
 */
export async function runPreferenceAnalysis(args: {
  userId: string;
  mode: InputMode;
  messages: ChatMessage[];
  keywords: string[];
  previousVersion?: number;
}): Promise<PreferenceAnalysis> {
  const messages = args.mode === "keywords" ? [] : args.messages;
  const keywords = args.mode === "chat" ? [] : args.keywords;
  const known = extractSlots(messages);
  const draft = await analyzePreferences({ mode: args.mode, messages, keywords, known });

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const repo = getRepository();
  let analysisVersion = (args.previousVersion ?? 0) + 1;
  let storage: PreferenceAnalysis["storage"] = "browser-only";
  try {
    const saved = await repo.savePreference(
      {
        id,
        userId: args.userId,
        inputMode: args.mode,
        tasteVector: draft.profile.categories,
        recentVector: draft.focus,
        topCategories: draft.topCategories.map((c) => ({ key: c.key, score: c.score })),
        keywords,
        context: {
          intent: draft.profile.intent,
          intentLabel: draft.profile.intentLabel,
          budget: draft.profile.budget,
          companion: draft.profile.companion,
          occasion: draft.profile.occasion,
          preferredStyle: draft.profile.preferredStyle,
          discoveryPreference: draft.profile.discoveryPreference,
        },
        personaLabel: draft.personaLabel,
        summary: draft.profile.summary,
        aiProvider: "builtin",
        aiModel: null,
        createdAt,
      },
      { minVersion: (args.previousVersion ?? 0) + 1 },
    );
    analysisVersion = saved.analysisVersion;
    storage = repo.info().kind;
  } catch (err) {
    console.warn("[analyze] 분석 결과 저장 실패 — 브라우저에만 보관합니다:", err);
  }

  return {
    id,
    analysisVersion,
    inputMode: args.mode,
    profile: draft.profile,
    focus: draft.focus,
    personaLabel: draft.personaLabel,
    topCategories: draft.topCategories,
    keywordInsights: draft.keywordInsights,
    inputs: { keywords, answers: messages.filter((m) => m.role === "user").length },
    provider: "builtin",
    storage,
    createdAt,
  };
}
