"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, MessageSquare, RefreshCw, Sparkles, Tags } from "lucide-react";
import { ChatInterview } from "@/components/discover/ChatInterview";
import { KeywordPanel } from "@/components/discover/KeywordPanel";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton, Spinner } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { ErrorState, Notice } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import { currentInput, runAnalysis, useAnalysisRun } from "@/lib/client/analysis";
import { setInputMode, useMarketFit } from "@/lib/client/store";
import type { InputMode } from "@/lib/preferences/types";

const TABS = [
  { value: "chat", label: "AI와 대화하며 찾기", icon: MessageSquare },
  { value: "keywords", label: "키워드로 빠르게 분석하기", icon: Tags },
] as const;

/**
 * 취향 입력 화면 — AI 인터뷰와 빠른 키워드 두 가지 방식 (둘 다 쓰면 하나로 통합해 분석)
 * 분석 버튼은 analyzing 상태에서만 비활성화되고, 끝나면 언제든 다시 분석할 수 있습니다.
 */
export function DiscoverClient({ initialTab }: { initialTab: "chat" | "keywords" | null }) {
  const router = useRouter();
  const { state, hydrated } = useMarketFit();
  const run = useAnalysisRun();
  const [userTab, setUserTab] = useState<"chat" | "keywords" | null>(null);
  const tab = userTab ?? initialTab ?? state.tab;

  const answers = state.interview.messages.filter((m) => m.role === "user").length;
  const keywords = state.keywords;
  const [useChat, setUseChat] = useState(true);
  const [useKeywords, setUseKeywords] = useState(true);
  const hasChat = answers > 0;
  const hasKeywords = keywords.length > 0;
  const bothAvailable = hasChat && hasKeywords;
  const mode: InputMode | null =
    bothAvailable && useChat && useKeywords ? "both" : (hasChat && useChat) || (hasChat && !bothAvailable) ? "chat" : hasKeywords ? "keywords" : null;
  const input = mode ? currentInput(mode) : null;
  const analyzing = run.status === "analyzing";
  const buttonLabel = analyzing ? "분석 중…" : run.status === "error" ? "다시 시도" : state.analyses.length ? "다시 분석하기" : "취향 분석하기";

  const start = async () => {
    if (!input || analyzing) return;
    const analysis = await runAnalysis(input);
    if (analysis) router.push("/analysis");
  };

  return (
    <div className="container-page max-w-3xl pt-6 sm:pt-10">
      <PageHeader
        eyebrow="STEP 1"
        title="지금 어떤 곳이나 상품을 찾고 있나요?"
        description="AI와 대화하거나 키워드를 입력하면, 대전 중앙시장 433개 점포 중 나와 맞는 곳을 찾아드려요."
      />

      <div role="tablist" aria-label="취향 입력 방법" className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-ink-200 bg-paper p-1 shadow-card">
        {TABS.map((t) => {
          const selected = tab === t.value;
          return (
            <button
              key={t.value}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => {
                setUserTab(t.value);
                setInputMode(t.value);
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-semibold transition-colors",
                selected ? "bg-market-700 text-white" : "text-ink-600 hover:bg-ink-100",
              )}
            >
              <t.icon className="size-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      <Card className="p-4 sm:p-6">
        {tab === "chat" ? <ChatInterview /> : <KeywordPanel />}
      </Card>

      {tab === "chat" && hasKeywords ? (
        <Notice className="mt-3" icon={<Tags className="size-4" aria-hidden />}>
          입력해 둔 키워드 {keywords.length}개도 함께 분석할 수 있어요.
        </Notice>
      ) : null}
      {tab === "keywords" && hasChat ? (
        <Notice className="mt-3" icon={<MessageSquare className="size-4" aria-hidden />}>
          AI 대화 답변 {answers}개도 함께 분석할 수 있어요.
        </Notice>
      ) : null}

      <div className="sticky bottom-16 z-30 mt-5 md:bottom-4">
        <div className="rounded-3xl border border-ink-200 bg-paper/95 p-3 shadow-float backdrop-blur">
          {bothAvailable ? (
            <div className="mb-2 flex flex-wrap gap-3 px-2 text-sm">
              <label className="flex items-center gap-1.5 font-semibold text-ink-700">
                <input type="checkbox" className="size-4 accent-market-700" checked={useChat} onChange={(e) => setUseChat(e.target.checked || !useKeywords)} />
                대화 답변 {answers}개
              </label>
              <label className="flex items-center gap-1.5 font-semibold text-ink-700">
                <input
                  type="checkbox"
                  className="size-4 accent-market-700"
                  checked={useKeywords}
                  onChange={(e) => setUseKeywords(e.target.checked || !useChat)}
                />
                키워드 {keywords.length}개
              </label>
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="px-2 text-sm text-ink-600" aria-live="polite">
              {analyzing ? (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner className="text-market-600" />
                  {run.step === "match" ? "433개 점포와 매칭 중…" : "AI가 취향을 분석하는 중…"}
                </span>
              ) : !hydrated ? (
                "준비 중…"
              ) : !input ? (
                "대화에 답하거나 키워드를 입력하면 분석할 수 있어요."
              ) : (
                <>
                  {mode === "both" ? "대화 + 키워드" : mode === "chat" ? "대화 내용" : "키워드"}로 분석해요 ·{" "}
                  <Badge tone="market">서비스 내장 AI</Badge>
                </>
              )}
            </p>
            <div className="flex gap-2">
              {run.status === "success" && state.analyses.length ? (
                <LinkButton href="/analysis" variant="secondary" size="lg" icon={<ArrowRight className="size-5" aria-hidden />}>
                  결과 보기
                </LinkButton>
              ) : null}
              <Button
                type="button"
                size="lg"
                disabled={!input || analyzing}
                loading={analyzing}
                onClick={() => void start()}
                icon={run.status === "success" ? <RefreshCw className="size-5" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
              >
                {buttonLabel}
              </Button>
            </div>
          </div>
          {run.status === "error" && run.error ? <ErrorState className="mt-3" title="분석하지 못했어요" message={run.error} /> : null}
        </div>
      </div>

      <p className="mt-6 flex items-start gap-1.5 text-xs leading-relaxed text-ink-500">
        <Bot className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        AI는 취향 해석과 설명 문장만 담당하고, 추천 점수·순위는 알고리즘이 계산해요. 대화 원문은 서버에 저장하지 않고 분석할 때만 전송해요.
      </p>
    </div>
  );
}
