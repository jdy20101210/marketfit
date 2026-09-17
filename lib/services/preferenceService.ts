import "server-only";
import { randomUUID } from "node:crypto";
import { getRepository } from "@/lib/db";
import { extractSlots, interviewState, isSlotFilled, RULE_QUESTIONS, ruleInterviewTurn } from "@/lib/preferences/extract";
import {
  MAX_QUESTIONS,
  MIN_ANSWERS,
  type ChatMessage,
  type InputMode,
  type InterviewSlots,
  type InterviewTurn,
  type PreferenceAnalysis,
} from "@/lib/preferences/types";
import { analyzePreferencesWithFallback, interviewWithFallback } from "@/lib/providers/ai";
import type { InterviewDraft } from "@/lib/providers/ai/types";

const normalizeQuestion = (text: string) => text.replace(/[\s?!.,~]/g, "");

/** AI가 파악한 내용은 규칙이 비워 둔 항목에만 보탭니다(예산 숫자는 규칙 파싱 결과만 사용). */
function mergeSlots(rule: InterviewSlots, extracted: InterviewDraft["extracted"]): InterviewSlots {
  return {
    ...rule,
    lookingFor: rule.lookingFor ?? extracted.lookingFor ?? null,
    intent: rule.intent ?? extracted.intent ?? null,
    intentLabel: rule.intentLabel ?? extracted.intentLabel ?? null,
    companion: rule.companion ?? extracted.companion ?? null,
    occasion: rule.occasion ?? extracted.occasion ?? null,
    preferredStyle: rule.preferredStyle.length ? rule.preferredStyle : (extracted.preferredStyle ?? []),
    discoveryPreference: rule.discoveryPreference ?? extracted.discoveryPreference ?? null,
  };
}

const UNSAFE_REPLY = /https?:\/\/|\d{2,4}-\d{3,4}-\d{4}/;

/**
 * AI 인터뷰 한 턴
 * - 질문 수(최대 6)·최소 답변 수(3)·중복 질문 방지는 서버 규칙이 최종 결정합니다.
 * - Gemini 응답이 규칙에 맞지 않으면 규칙 기반 질문으로 바꿉니다.
 */
export async function runInterviewTurn(messages: ChatMessage[]): Promise<InterviewTurn> {
  const state = interviewState(messages);
  const questionCount = state.askedCount;
  if (state.done) {
    const closing = ruleInterviewTurn(messages);
    return {
      reply: closing.reply,
      slot: null,
      done: true,
      suggestions: [],
      slots: state.slots,
      questionCount,
      provider: "rule",
      model: null,
      fallbackReason: null,
    };
  }

  const res = await interviewWithFallback({
    messages,
    known: state.slots,
    answeredCount: state.answeredCount,
    askedSlots: state.askedSlots,
    maxQuestions: MAX_QUESTIONS,
    minAnswers: MIN_ANSWERS,
  });
  const draft = res.result;
  const slots = mergeSlots(state.slots, draft.extracted);

  if (res.provider === "mock") {
    return {
      reply: draft.reply,
      slot: draft.slot,
      done: draft.done,
      suggestions: draft.suggestions,
      slots,
      questionCount: questionCount + (draft.done ? 0 : 1),
      provider: "mock",
      model: null,
      fallbackReason: res.fallbackReason,
    };
  }

  const previous = new Set(messages.filter((m) => m.role === "assistant").map((m) => normalizeQuestion(m.text)));
  const earlyDone = draft.done && state.answeredCount < MIN_ANSWERS && !state.finishRequested;
  const repeatsSlot = !draft.done && draft.slot !== null && (state.askedSlots.includes(draft.slot) || isSlotFilled(slots, draft.slot));
  const repeatsText = !draft.done && previous.has(normalizeQuestion(draft.reply));
  const invalid = earlyDone || repeatsSlot || repeatsText || UNSAFE_REPLY.test(draft.reply);

  if (invalid) {
    // 규칙이 고른 다음 질문을 쓰되, 문장만 자연스럽게 맞춥니다.
    const rule = ruleInterviewTurn(messages);
    return {
      reply: rule.reply,
      slot: rule.slot,
      done: rule.done,
      suggestions: rule.suggestions,
      slots,
      questionCount: questionCount + (rule.done ? 0 : 1),
      // 화면에 보이는 질문은 서버 규칙이 고른 것이므로 그대로 표시합니다.
      provider: "rule",
      model: res.model,
      fallbackReason: null,
    };
  }
  const suggestions = draft.done ? [] : draft.suggestions.length ? draft.suggestions : draft.slot ? RULE_QUESTIONS[draft.slot].suggestions : [];
  return {
    reply: draft.reply,
    slot: draft.done ? null : draft.slot,
    done: draft.done,
    suggestions,
    slots,
    questionCount: questionCount + (draft.done ? 0 : 1),
    provider: "gemini",
    model: res.model,
    fallbackReason: null,
  };
}

/**
 * 대화·키워드 → UserPreferenceProfile (Gemini, 실패 시 Mock) → 새 분석 버전으로 저장
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
  const res = await analyzePreferencesWithFallback({ mode: args.mode, messages, keywords, known });
  const draft = res.result;

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
        aiProvider: res.provider,
        aiModel: res.model,
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
    provider: res.provider,
    model: res.model,
    fallbackReason: res.fallbackReason,
    storage,
    createdAt,
  };
}
