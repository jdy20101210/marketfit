"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Bot, RotateCcw, Send, Undo2, UserRound } from "lucide-react";
import { Button, Spinner } from "@/components/ui/Button";
import { ErrorState, Notice } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import { api, errorMessage } from "@/lib/client/api";
import { freshInterview, setState, useMarketFit } from "@/lib/client/store";
import {
  APPAREL_LABEL,
  budgetLabel,
  COMPANION_LABEL,
  DISCOVERY_LABEL,
  MAX_QUESTIONS,
  OCCASION_LABEL,
  STYLE_LABEL,
  type ChatMessage,
  type InterviewSlots,
  type InterviewTurn,
} from "@/lib/preferences/types";

const MAX_LENGTH = 300;

function slotChips(slots: InterviewSlots | null): string[] {
  if (!slots) return [];
  return [
    slots.intentLabel ?? slots.lookingFor,
    slots.wantsApparel && slots.apparelFor ? APPAREL_LABEL[slots.apparelFor] : null,
    budgetLabel(slots.budget) ?? (slots.budgetOpen ? "예산 상관없음" : null),
    ...slots.preferredStyle.map((s) => STYLE_LABEL[s]),
    slots.companion ? COMPANION_LABEL[slots.companion] : null,
    slots.occasion ? OCCASION_LABEL[slots.occasion] : null,
    slots.discoveryPreference
      ? DISCOVERY_LABEL[slots.discoveryPreference]
      : null,
  ].filter((v): v is string => Boolean(v));
}

/**
 * AI 인터뷰 (최대 6개 질문)
 * - 답변마다 /api/interview가 다음 질문을 정합니다(이미 답한 내용은 다시 묻지 않음).
 * - 대화는 이 브라우저에만 보관되고, 분석할 때 서버로 전송됩니다.
 */
export function ChatInterview() {
  const { state, hydrated } = useMarketFit();
  const interview = state.interview;
  const messages = interview.messages;
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const logRef = useRef<HTMLOListElement>(null);
  const answers = messages.filter((m) => m.role === "user").length;
  const awaitingReply = messages.at(-1)?.role === "user";
  const canType =
    hydrated &&
    !sending &&
    !interview.done &&
    !awaitingReply &&
    answers < MAX_QUESTIONS;

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  const requestTurn = async (conversation: ChatMessage[]) => {
    setSending(true);
    setError(null);
    try {
      const turn = await api.post<InterviewTurn>("/api/interview", {
        messages: conversation,
      });
      setState((prev) => {
        // 응답을 기다리는 동안 대화를 초기화했다면 무시합니다.
        if (prev.interview.messages.length !== conversation.length) return prev;
        return {
          ...prev,
          interview: {
            messages: [
              ...conversation,
              { role: "assistant", text: turn.reply, slot: turn.slot },
            ],
            done: turn.done,
            suggestions: turn.suggestions,
            slots: turn.slots,
            provider: turn.provider,
            questionCount: turn.questionCount,
          },
        };
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const send = (raw: string) => {
    const text = raw.trim().replace(/\s+/g, " ");
    if (!text || !canType) return;
    if (/[<>{}]/.test(text)) {
      setError("사용할 수 없는 문자(<, >, {, })가 있어요.");
      return;
    }
    const conversation: ChatMessage[] = [
      ...messages,
      { role: "user", text: text.slice(0, MAX_LENGTH) },
    ];
    setState((prev) => ({
      ...prev,
      interview: { ...prev.interview, messages: conversation, suggestions: [] },
    }));
    setValue("");
    void requestTurn(conversation);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(value);
  };

  const undoLast = () => {
    const msgs = [...messages];
    // 마지막 답변(과 그 뒤의 질문)을 지웁니다.
    while (msgs.length > 1 && msgs.at(-1)!.role === "assistant") msgs.pop();
    const last = msgs.pop();
    if (!last || last.role !== "user") return;
    const previousQuestion = msgs.at(-1);
    setError(null);
    setValue(last.text);
    setState((prev) => ({
      ...prev,
      interview: {
        ...prev.interview,
        messages: msgs,
        done: false,
        suggestions: [],
        questionCount: Math.max(
          1,
          msgs.filter((m) => m.role === "assistant").length,
        ),
        slots: previousQuestion ? prev.interview.slots : null,
      },
    }));
  };

  const chips = slotChips(interview.slots);

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
        <span className="tabular" aria-live="polite">
          질문 {Math.min(interview.questionCount, MAX_QUESTIONS)}/
          {MAX_QUESTIONS} · 답변 {answers}개
        </span>
        <span>필요한 질문만 골라서 물어봐요</span>
      </div>

      <ol
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="AI 인터뷰 대화"
        className="max-h-[52dvh] min-h-[260px] space-y-3 overflow-y-auto rounded-2xl bg-cream/70 p-3 sm:p-4"
      >
        {messages.map((m, i) => (
          <li
            key={i}
            className={cn(
              "flex items-end gap-2",
              m.role === "user" && "flex-row-reverse",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full",
                m.role === "assistant"
                  ? "bg-market-700 text-white"
                  : "bg-sign-400 text-ink-900",
              )}
            >
              {m.role === "assistant" ? (
                <Bot className="size-4" />
              ) : (
                <UserRound className="size-4" />
              )}
            </span>
            <p
              className={cn(
                "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-card",
                m.role === "assistant"
                  ? "rounded-bl-md bg-paper text-ink-900"
                  : "rounded-br-md bg-market-700 text-white",
              )}
            >
              <span className="sr-only">
                {m.role === "assistant" ? "AI: " : "나: "}
              </span>
              {m.text}
            </p>
          </li>
        ))}
        {sending ? (
          <li className="flex items-center gap-2 text-sm text-ink-500">
            <Spinner className="text-market-600" />{" "}
            다음 질문을 고르는 중…
          </li>
        ) : null}
      </ol>

      {chips.length ? (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold text-ink-500">
            지금까지 파악한 내용
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <li
                key={c}
                className="rounded-full bg-market-50 px-2.5 py-1 text-xs font-semibold text-market-800 ring-1 ring-market-100"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error || (awaitingReply && !sending) ? (
        <ErrorState
          className="mt-3"
          title="답변을 보내지 못했어요"
          message={
            error ??
            "이전 답변에 대한 질문을 아직 받지 못했어요. 다시 보내 주세요."
          }
          action={
            awaitingReply ? (
              <>
                <Button
                  size="sm"
                  onClick={() => void requestTurn(messages)}
                  loading={sending}
                >
                  다시 보내기
                </Button>
                <Button size="sm" variant="secondary" onClick={undoLast}>
                  답변 고치기
                </Button>
              </>
            ) : null
          }
        />
      ) : null}

      {interview.done ? (
        <Notice tone="market" className="mt-3">
          필요한 내용을 모두 들었어요. 아래 <strong>취향 분석하기</strong>를
          눌러 주세요.
        </Notice>
      ) : null}

      {!interview.done && interview.suggestions.length && canType ? (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold text-ink-500">
            이렇게 답해도 돼요
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label="빠른 답변">
            {interview.suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-market-200 bg-paper px-3 py-1.5 text-sm font-semibold text-market-800 hover:border-market-500 hover:bg-market-50"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          답변 입력
        </label>
        <input
          id={inputId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={MAX_LENGTH}
          disabled={!canType}
          autoComplete="off"
          placeholder={
            interview.done
              ? "대화가 끝났어요"
              : answers >= MAX_QUESTIONS
                ? "질문을 모두 마쳤어요"
                : "자유롭게 답해 주세요 (예: 2만원 정도요)"
          }
          className="h-12 min-w-0 flex-1 rounded-2xl border border-ink-200 bg-white px-4 text-[15px] outline-none placeholder:text-ink-400 focus:border-market-600 focus:ring-4 focus:ring-market-400/40 disabled:bg-ink-50"
        />
        <Button
          type="submit"
          className="h-12"
          disabled={!canType || !value.trim()}
          icon={<Send className="size-4" aria-hidden />}
        >
          보내기
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {answers > 0 && !sending ? (
          <button
            type="button"
            onClick={undoLast}
            className="inline-flex items-center gap-1 font-semibold text-ink-600 hover:text-ink-900"
          >
            <Undo2 className="size-3.5" aria-hidden /> 마지막 답변 고치기
          </button>
        ) : null}
        {answers > 0 ? (
          <button
            type="button"
            onClick={() => {
              if (
                !window.confirm(
                  "대화를 처음부터 다시 시작할까요? (이미 분석한 결과는 그대로 남아요)",
                )
              )
                return;
              setError(null);
              setValue("");
              setState((prev) => ({ ...prev, interview: freshInterview() }));
            }}
            className="inline-flex items-center gap-1 font-semibold text-ink-600 hover:text-ink-900"
          >
            <RotateCcw className="size-3.5" aria-hidden /> 대화 새로 시작
          </button>
        ) : null}
        <span className="text-ink-400">
          이름·연락처 같은 개인정보는 적지 마세요.
        </span>
      </div>
    </div>
  );
}
