"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleDashed, Info, MapPinned, Minus, RefreshCw, Sparkles, UserRound, X } from "lucide-react";
import { Button, LinkButton, Spinner } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import type { ProfileResult, RecommendationItem } from "@/lib/api/schemas";
import { api, errorMessage } from "@/lib/client/api";
import { getState, setState, useMarketFit, type InstagramSummary } from "@/lib/client/store";
import { TASTE_META } from "@/lib/recommendation/dimensions";

type StepId = "instagram" | "analyze" | "profile" | "match" | "reasons";
type StepStatus = "pending" | "running" | "done" | "fallback" | "skipped" | "error";
type Step = { id: StepId; label: string; status: StepStatus; detail?: string; ms?: number };

const STORAGE_LABEL: Record<string, string> = {
  supabase: "Supabase DB",
  "local-file": "로컬 파일 DB",
  memory: "서버 메모리(임시) + 이 브라우저",
};

function initialSteps(mode: "instagram" | "manual" | "both"): Step[] {
  return [
    { id: "instagram", label: "Instagram 관심사 분석", status: mode === "manual" ? "skipped" : "pending", detail: mode === "manual" ? "직접 입력만 사용" : undefined },
    { id: "analyze", label: mode === "instagram" ? "관심사 AI 분석" : "관심 상품 분석", status: "pending" },
    { id: "profile", label: "취향 프로필 생성", status: "pending" },
    { id: "match", label: "중앙시장 점포와 매칭", status: "pending" },
    { id: "reasons", label: "추천 이유 작성", status: "pending" },
  ];
}

type AnalyzeResponse = ProfileResult & { instagramModeUsed: "real" | "mock" | "none" };

export function AnalysisClient({ aiMode }: { aiMode: "gemini" | "mock" }) {
  const { state, hydrated } = useMarketFit();
  const onboarding = state.onboarding;
  const [steps, setSteps] = useState<Step[]>([]);
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const mark = useCallback((id: StepId, patch: Partial<Step>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const run = useCallback(async () => {
    const ob = getState().onboarding;
    if (!ob) return;
    setError(null);
    setPhase("running");
    setSteps(initialSteps(ob.mode));
    const useIg = ob.mode !== "manual";
    const items = ob.mode === "instagram" ? [] : ob.items;
    let current: StepId = "instagram";

    const timed = async <T,>(id: StepId, runningDetail: string | undefined, fn: () => Promise<T>) => {
      current = id;
      mark(id, { status: "running", detail: runningDetail });
      const t0 = performance.now();
      const result = await fn();
      return { result, ms: Math.round(performance.now() - t0) };
    };

    try {
      // 1) Instagram 관심사 (실제 API 또는 데모 페르소나)
      let ig: InstagramSummary | null = null;
      if (useIg) {
        const { result, ms } = await timed("instagram", undefined, () =>
          api.post<InstagramSummary>("/api/instagram/interests", { personaId: ob.personaId, preferDemo: ob.preferDemo }),
        );
        ig = result;
        const keywords = result.interests.slice(0, 4).map((i) => i.keyword).join(", ");
        mark("instagram", {
          status: result.mode === "real" ? "done" : "fallback",
          ms,
          detail:
            result.mode === "real"
              ? `@${result.username ?? "instagram"} · 게시물 ${result.mediaAnalyzed}개 · 키워드: ${keywords || "없음"}`
              : `현재 데모 모드로 취향을 분석합니다 · ${result.personaLabel} (${keywords})`,
        });
      }

      // 2) Gemini(또는 데모 AI) 취향 분석
      const { result: profile, ms: analyzeMs } = await timed(
        "analyze",
        aiMode === "gemini" ? "Gemini API 호출 중 (보통 3~10초)" : "데모 AI(키워드 규칙)로 분석 중",
        () =>
          api.post<AnalyzeResponse>("/api/analyze", {
            items,
            instagram: ig ? { mode: ig.mode, personaId: ig.personaId, interests: ig.interests } : null,
          }),
      );
      const top = profile.topCategories
        .slice(0, 3)
        .map((c) => `${TASTE_META[c.key].label} ${Math.round(c.score * 100)}`)
        .join(" · ");
      mark("analyze", {
        status: profile.provider === "gemini" ? "done" : "fallback",
        ms: analyzeMs,
        detail:
          profile.provider === "gemini"
            ? `Gemini(${profile.model}) · ${top}`
            : profile.fallbackReason
              ? `Gemini 응답 오류로 데모 AI 사용 (${profile.fallbackReason}) · ${top}`
              : `데모 AI(키워드 규칙) 분석 · ${top}`,
      });

      // 3) 취향 프로필 저장
      const { result: saved, ms: saveMs } = await timed("profile", undefined, async () => {
        try {
          return await api.post<{ storage: string; persistent: boolean }>("/api/profile", {
            taste: profile.taste,
            recent: profile.recent,
            topCategories: profile.topCategories.map((c) => ({ key: c.key, score: c.score })),
            items,
            instagramKeywords: ig?.interests ?? [],
            instagramMode: ig ? ig.mode : "none",
            personaLabel: profile.personaLabel,
            summary: profile.summary,
            aiProvider: profile.provider,
          });
        } catch (err) {
          return { storage: "browser-only", persistent: false, error: errorMessage(err) };
        }
      });
      setState((prev) => ({
        ...prev,
        instagram: ig,
        profile: { ...profile, items, createdAt: new Date().toISOString() },
        recommendations: null,
      }));
      mark("profile", {
        status: "error" in saved ? "fallback" : "done",
        ms: saveMs,
        detail:
          "error" in saved
            ? `서버 저장 실패 → 이 브라우저에만 저장 (${String(saved.error)})`
            : `${profile.personaLabel} · 저장: ${STORAGE_LABEL[saved.storage] ?? saved.storage}`,
      });

      // 4) 점포 매칭 (알고리즘)
      const { result: recs, ms: matchMs } = await timed("match", undefined, () =>
        api.post<{ items: RecommendationItem[]; generatedAt: string }>("/api/recommendations", {
          profile: { taste: profile.taste, recent: profile.recent },
          interactions: getState().interactions,
        }),
      );
      const recommendable = recs.items.filter((i) => i.recommendable && !i.dismissed);
      const best = recommendable.reduce((m, i) => Math.max(m, i.score), 0);
      mark("match", {
        status: "done",
        ms: matchMs,
        detail: `${recs.items.length}곳 점수 계산 · 70점 이상 ${recommendable.filter((i) => i.score >= 70).length}곳 · 최고 ${best}점`,
      });

      // 점수 결과는 먼저 저장합니다 (이유 작성이 실패해도 추천은 그대로 사용).
      setState((prev) => ({ ...prev, recommendations: { items: recs.items, generatedAt: recs.generatedAt, reasonProvider: "template" } }));

      // 5) 추천 이유 (Gemini) — 점수 계산에는 관여하지 않는 선택 단계
      if (aiMode === "gemini" && recommendable.length > 0) {
        const topIds = recommendable.slice(0, 8).map((i) => i.storeId);
        try {
          const { result: reasons, ms: reasonMs } = await timed("reasons", `Gemini가 상위 ${topIds.length}곳의 이유를 작성 중`, () =>
            api.post<{ reasons: Record<string, string>; provider: "gemini" | "mock"; model: string | null; fallbackReason: string | null }>(
              "/api/recommendations/reasons",
              { personaLabel: profile.personaLabel, taste: profile.taste, recent: profile.recent, storeIds: topIds },
            ),
          );
          const count = Object.keys(reasons.reasons).length;
          if (count > 0) {
            const finalItems = recs.items.map((i) =>
              reasons.reasons[i.storeId] ? { ...i, reason: reasons.reasons[i.storeId]!, reasonProvider: "gemini" as const } : i,
            );
            setState((prev) => ({ ...prev, recommendations: { items: finalItems, generatedAt: recs.generatedAt, reasonProvider: "gemini" } }));
          }
          mark("reasons", {
            status: count > 0 ? "done" : "fallback",
            ms: reasonMs,
            detail: count > 0 ? `Gemini가 상위 ${count}곳의 추천 이유 작성` : `템플릿 이유 사용${reasons.fallbackReason ? ` (${reasons.fallbackReason})` : ""}`,
          });
        } catch (err) {
          mark("reasons", { status: "fallback", detail: `추천 이유 작성 실패 → 점포 데이터 기반 템플릿 이유 사용 (${errorMessage(err)})` });
        }
      } else {
        mark("reasons", {
          status: "skipped",
          detail: aiMode === "gemini" ? "추천할 점포가 없어 건너뜀" : "데모 모드 · 점포 데이터 기반 템플릿 이유 사용",
        });
      }

      setPhase("done");
    } catch (err) {
      mark(current, { status: "error", detail: errorMessage(err) });
      setError(errorMessage(err));
      setPhase("error");
    }
  }, [aiMode, mark]);

  useEffect(() => {
    if (!hydrated || !onboarding || started.current) return;
    started.current = true;
    // 외부 API 호출 흐름 시작 (결과에 따라 단계별 상태가 갱신됨)
    void run();
  }, [hydrated, onboarding, run]);

  if (!hydrated) {
    return (
      <div className="container-page max-w-2xl pt-10">
        <p className="flex items-center gap-2 text-ink-600">
          <Spinner /> 준비 중…
        </p>
      </div>
    );
  }

  if (!onboarding) {
    return (
      <div className="container-page max-w-2xl pt-10">
        <EmptyState
          title="분석할 정보가 없어요"
          description="먼저 Instagram을 연결하거나 관심 상품을 입력해주세요."
          action={<LinkButton href="/onboarding">취향 분석 시작하기</LinkButton>}
        />
      </div>
    );
  }

  const profile = state.profile;
  const doneCount = steps.filter((s) => ["done", "fallback", "skipped"].includes(s.status)).length;

  return (
    <div className="container-page max-w-2xl pt-6 sm:pt-10">
      <PageHeader
        eyebrow="STEP 3"
        title={phase === "done" ? "취향 분석이 끝났어요" : phase === "error" ? "분석 중 문제가 생겼어요" : "AI가 취향을 분석하고 있어요"}
        description="각 단계는 실제 API 호출 결과에 따라 갱신돼요."
      />

      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between text-sm">
          <span className="font-semibold text-ink-800">진행 상황</span>
          <span className="tabular text-ink-500" aria-live="polite">
            {doneCount}/{steps.length} 단계
          </span>
        </div>
        <ol className="space-y-1" aria-label="분석 단계">
          {steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </ol>
      </Card>

      {phase === "error" ? (
        <ErrorState
          className="mt-4"
          title="분석을 완료하지 못했어요"
          message={error ?? "잠시 후 다시 시도해주세요."}
          action={
            <>
              <Button
                type="button"
                size="sm"
                icon={<RefreshCw className="size-4" aria-hidden />}
                onClick={() => {
                  void run();
                }}
              >
                다시 시도
              </Button>
              <LinkButton href="/onboarding" size="sm" variant="secondary">
                입력 수정
              </LinkButton>
            </>
          }
        />
      ) : null}

      {phase === "done" && profile ? (
        <Card className="mt-4 animate-rise overflow-hidden">
          <div aria-hidden className="awning h-1.5" />
          <div className="p-5 sm:p-6">
            <p className="flex items-center gap-1.5 text-sm font-bold text-market-700">
              <Sparkles className="size-4" aria-hidden /> 분석 완료
            </p>
            <p className="mt-1 text-2xl font-extrabold text-ink-900">{profile.personaLabel}</p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink-700">{profile.summary}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {profile.topCategories.slice(0, 5).map((c) => (
                <li key={c.key} className="rounded-full bg-market-50 px-3 py-1 text-sm font-semibold text-market-800 ring-1 ring-market-100">
                  {TASTE_META[c.key].emoji} {TASTE_META[c.key].label} <span className="tabular">{Math.round(c.score * 100)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <LinkButton href="/profile" size="lg" icon={<UserRound className="size-5" aria-hidden />}>
                나의 취향 프로필 보기
              </LinkButton>
              <LinkButton href="/market-map" size="lg" variant="secondary" icon={<MapPinned className="size-5" aria-hidden />}>
                AI 시장 지도 열기
              </LinkButton>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="mt-6 space-y-2 text-xs leading-relaxed text-ink-500">
        <p className="flex items-start gap-1.5">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          추천 점수는 알고리즘(cosine 유사도 + 가중치)으로 계산하고, AI는 취향 분석과 추천 이유 작성에만 사용해요.
        </p>
        <Link href="/onboarding" className="inline-flex items-center gap-0.5 pl-5 font-semibold text-ink-700 underline-offset-2 hover:underline">
          입력 다시 하기 <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}초`;
}

function StepRow({ step }: { step: Step }) {
  const icon = {
    pending: <CircleDashed className="size-5 text-ink-300" aria-hidden />,
    running: <Spinner className="size-5 text-market-600" />,
    done: (
      <span className="grid size-5 place-items-center rounded-full bg-market-600 text-white">
        <Check className="size-3.5" aria-hidden />
      </span>
    ),
    fallback: (
      <span className="grid size-5 place-items-center rounded-full bg-sign-400 text-ink-900">
        <Info className="size-3.5" aria-hidden />
      </span>
    ),
    skipped: (
      <span className="grid size-5 place-items-center rounded-full bg-ink-200 text-ink-600">
        <Minus className="size-3.5" aria-hidden />
      </span>
    ),
    error: (
      <span className="grid size-5 place-items-center rounded-full bg-brick-500 text-white">
        <X className="size-3.5" aria-hidden />
      </span>
    ),
  }[step.status];
  const statusText = { pending: "대기", running: "진행 중", done: "완료", fallback: "데모/대체", skipped: "건너뜀", error: "오류" }[step.status];

  return (
    <li className={cn("flex gap-3 rounded-2xl px-3 py-3 transition-colors", step.status === "running" && "bg-market-50")}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("font-semibold", step.status === "pending" ? "text-ink-400" : "text-ink-900")}>
            {step.status === "running" ? `${step.label} 중...` : step.label}
          </p>
          <span className="tabular shrink-0 text-xs text-ink-500">
            <span className="sr-only">상태: </span>
            {statusText}
            {step.ms !== undefined ? ` · ${formatMs(step.ms)}` : ""}
          </span>
        </div>
        {step.detail ? (
          <p
            className={cn(
              "mt-0.5 text-sm leading-relaxed",
              step.status === "error" ? "text-brick-600" : step.status === "running" ? "animate-pulse-soft text-market-700" : "text-ink-600",
            )}
          >
            {step.detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}
