"use client";

import { useState } from "react";
import { ArrowRight, Bot, Check, History, Info, MapPinned, RefreshCw, Sparkles, Tags } from "lucide-react";
import { TasteBars } from "@/components/charts/TasteBars";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton, Spinner } from "@/components/ui/Button";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, Notice } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import { activateAnalysis, currentInput, runAnalysis, useAnalysisRun } from "@/lib/client/analysis";
import { useRecommendations } from "@/lib/client/recommendations";
import { activeAnalysis, useMarketFit } from "@/lib/client/store";
import {
  budgetLabel,
  COMPANION_LABEL,
  DISCOVERY_LABEL,
  INPUT_MODE_LABEL,
  OCCASION_LABEL,
  STYLE_LABEL,
  type PreferenceAnalysis,
} from "@/lib/preferences/types";
import { TASTE_META } from "@/lib/recommendation/dimensions";
import { formatKstDateTime } from "@/lib/format";

function contextChips(analysis: PreferenceAnalysis): { label: string; value: string }[] {
  const p = analysis.profile;
  const chips: { label: string; value: string }[] = [];
  if (p.intentLabel) chips.push({ label: "목적", value: p.intentLabel });
  const budget = budgetLabel(p.budget);
  if (budget) chips.push({ label: "예산", value: budget });
  if (p.companion) chips.push({ label: "함께·대상", value: COMPANION_LABEL[p.companion] });
  if (p.occasion) chips.push({ label: "상황", value: OCCASION_LABEL[p.occasion] });
  for (const s of p.preferredStyle) chips.push({ label: "선호", value: STYLE_LABEL[s] });
  if (p.discoveryPreference) chips.push({ label: "발견", value: DISCOVERY_LABEL[p.discoveryPreference] });
  return chips;
}

/** 분석 결과 화면: 취향 시각화 + [추천 시장 보기] + [다시 분석하기] */
export function AnalysisResultClient() {
  const { state, hydrated } = useMarketFit();
  const run = useAnalysisRun();
  const { recommendations, loading, error: recError, retry } = useRecommendations();
  const [switching, setSwitching] = useState<string | null>(null);
  const analysis = activeAnalysis(state);
  const analyzing = run.status === "analyzing";

  if (!hydrated) {
    return (
      <div className="container-page max-w-3xl pt-10">
        <p className="flex items-center gap-2 text-ink-600">
          <Spinner /> 불러오는 중…
        </p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="container-page max-w-2xl pt-10">
        <EmptyState
          icon={<Sparkles className="size-6" aria-hidden />}
          title={analyzing ? "취향을 분석하고 있어요" : "아직 분석 결과가 없어요"}
          description={analyzing ? "잠시만 기다려 주세요." : "AI와 대화하거나 키워드를 입력하면 나만의 중앙시장 취향을 만들 수 있어요."}
          action={analyzing ? <Spinner /> : <LinkButton href="/discover">취향 분석 시작하기</LinkButton>}
        />
      </div>
    );
  }

  const top = analysis.topCategories.slice(0, 5);
  const chips = contextChips(analysis);
  const threshold = recommendations?.threshold;
  const ranked = recommendations?.items.filter((i) => i.rank !== null) ?? [];
  const reanalyze = async () => {
    const input = currentInput(analysis.inputMode);
    if (!input) return;
    await runAnalysis(input);
  };

  return (
    <div className="container-page max-w-4xl pt-6 sm:pt-10">
      <PageHeader
        eyebrow="STEP 2"
        title="AI가 분석한 나의 중앙시장 취향"
        description="입력한 내용에서 찾은 취향 점수와 상황 정보예요. 다시 분석하면 새 버전으로 저장돼요."
      />

      <Card className="overflow-hidden">
        <div aria-hidden className="awning h-1.5" />
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="market">분석 v{analysis.analysisVersion}</Badge>
            <Badge tone="outline">{INPUT_MODE_LABEL[analysis.inputMode]}</Badge>
            <Badge tone={analysis.provider === "gemini" ? "market" : "sign"} icon={<Bot className="size-3" aria-hidden />}>
              {analysis.provider === "gemini" ? `Gemini${analysis.model ? ` · ${analysis.model}` : ""}` : "데모 AI(규칙 기반)"}
            </Badge>
            <span className="text-xs text-ink-500">{formatKstDateTime(analysis.createdAt)}</span>
          </div>
          <p className="mt-3 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">{analysis.personaLabel}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{analysis.profile.summary}</p>
          {analysis.fallbackReason ? (
            <p className="mt-2 text-xs text-sign-800">Gemini 호출이 실패해 데모 AI 결과를 사용했어요: {analysis.fallbackReason}</p>
          ) : null}

          {chips.length ? (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="분석한 상황 정보">
              {chips.map((c) => (
                <li key={`${c.label}-${c.value}`} className="rounded-full bg-cream px-3 py-1 text-sm ring-1 ring-ink-200">
                  <span className="text-ink-500">{c.label}</span> <span className="font-semibold text-ink-900">{c.value}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="대표 취향 점수">
            {top.map((t) => (
              <li key={t.key} className="rounded-2xl border border-ink-200 bg-cream px-3 py-3 text-center">
                <span aria-hidden className="text-xl">
                  {TASTE_META[t.key].emoji}
                </span>
                <p className="mt-0.5 text-sm font-semibold text-ink-700">{TASTE_META[t.key].label}</p>
                <p className="tabular text-2xl font-extrabold text-market-700">{Math.round(t.score * 100)}</p>
              </li>
            ))}
          </ul>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <LinkButton href="/market-map" size="lg" icon={<MapPinned className="size-5" aria-hidden />}>
              추천 시장 보기
            </LinkButton>
            <Button
              type="button"
              size="lg"
              variant="secondary"
              loading={analyzing}
              disabled={analyzing || !currentInput(analysis.inputMode)}
              onClick={() => void reanalyze()}
              icon={<RefreshCw className="size-5" aria-hidden />}
            >
              {analyzing ? "다시 분석 중…" : "다시 분석하기"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            다시 분석하면 v{analysis.analysisVersion + 1} 결과가 새로 만들어지고, 이전 결과도 그대로 남아요.{" "}
            <a href="/discover" className="font-semibold text-market-700 underline-offset-2 hover:underline">
              입력 수정하기
            </a>
          </p>
          {run.status === "error" && run.error ? <ErrorState className="mt-3" title="다시 분석하지 못했어요" message={run.error} /> : null}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <CardHeader title="취향 vector" description="막대: 전체 취향 · 노란 눈금: 지금 찾는 것" />
          <div className="mt-4">
            <TasteBars
              vector={analysis.profile.categories}
              emphasize={5}
              minScore={0.05}
              title="나의 취향 점수"
              compareWith={analysis.focus}
              compareLabel="지금 찾는 것"
            />
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5 sm:p-6">
            <CardHeader title="추천 결과 요약" description="추천 점수는 알고리즘이 계산해요 (AI는 관여하지 않음)." />
            <div className="mt-4">
              {recError ? (
                <ErrorState message={recError} action={<Button size="sm" onClick={retry}>다시 시도</Button>} />
              ) : loading || !recommendations || !threshold ? (
                <p className="flex items-center gap-2 text-sm text-ink-600">
                  <Spinner /> 433개 점포와 매칭 중…
                </p>
              ) : threshold.applied === null ? (
                <Notice>
                  <strong>현재 취향과 높은 수준으로 일치하는 점포가 없습니다.</strong>
                  <br />가장 높은 점수는 {recommendations.bestScore}점이에요. 관심사를 조금 더 알려주고 다시 분석해 보세요.
                </Notice>
              ) : (
                <div>
                  <p className="text-[15px] text-ink-800">
                    <strong className="text-market-700">
                      {threshold.applied}점 이상 {ranked.length}곳
                    </strong>
                    을 순위로 보여드려요.
                  </p>
                  {threshold.usedFallback ? (
                    <p className="mt-1 text-xs text-sign-800">
                      {threshold.primary}점 이상인 점포가 없어 기준을 {threshold.fallback}점으로 한 단계 낮췄어요(점수는 그대로예요).
                    </p>
                  ) : null}
                  <ul className="mt-3 space-y-1.5">
                    {ranked.slice(0, 3).map((i) => (
                      <li key={i.storeId} className="flex items-center gap-2 text-sm text-ink-700">
                        <span className="tabular font-extrabold text-ink-900">{String(i.rank).padStart(2, "0")}</span>
                        <span className="tabular font-bold text-market-700">{i.score}점</span>
                        <span className="truncate">{i.reason}</span>
                      </li>
                    ))}
                  </ul>
                  <LinkButton href="/market-map" size="sm" variant="secondary" className="mt-3" icon={<ArrowRight className="size-4" aria-hidden />}>
                    지도에서 보기
                  </LinkButton>
                </div>
              )}
            </div>
          </Card>

          {analysis.keywordInsights.length ? (
            <Card className="p-5 sm:p-6">
              <CardHeader title="키워드 해석" description="입력한 키워드를 어떤 취향으로 읽었는지 보여줘요." />
              <ul className="mt-4 space-y-2">
                {analysis.keywordInsights.map((k) => (
                  <li key={k.input} className="rounded-xl bg-cream px-3 py-2 text-sm">
                    <span className="inline-flex items-center gap-1 font-semibold text-ink-900">
                      <Tags className="size-3.5" aria-hidden /> {k.input}
                    </span>
                    {k.keys.length ? <span className="ml-2 text-market-800">{k.keys.map((key) => TASTE_META[key].label).join(", ")}</span> : null}
                    {k.note ? <p className="mt-0.5 text-xs text-ink-500">{k.note}</p> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      {analysis.topCategories.some((c) => c.evidence) ? (
        <Card className="mt-4 p-5 sm:p-6">
          <CardHeader title="AI가 찾은 근거" description="어떤 말과 키워드에서 이 취향을 읽었는지 보여줘요." />
          <ul className="mt-3 space-y-1 text-sm text-ink-700">
            {analysis.topCategories
              .filter((c) => c.evidence)
              .map((c) => (
                <li key={c.key}>
                  <strong className="font-semibold">{TASTE_META[c.key].label}</strong> — {c.evidence}
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      {state.analyses.length > 1 ? (
        <Card className="mt-4 p-5 sm:p-6">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-1.5">
                <History className="size-4" aria-hidden /> 분석 기록
              </span>
            }
            description="다시 분석할 때마다 새 버전이 쌓여요. 이전 결과로 되돌릴 수도 있어요."
          />
          <ul className="mt-4 divide-y divide-ink-100">
            {state.analyses.map((a) => {
              const active = a.id === state.activeAnalysisId;
              return (
                <li key={a.id} className={cn("flex flex-wrap items-center gap-2 py-2.5", active && "font-semibold")}>
                  <span className="tabular w-12 shrink-0 text-sm text-ink-500">v{a.analysisVersion}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                    {a.personaLabel} · {a.profile.summary}
                  </span>
                  <span className="text-xs text-ink-400">{formatKstDateTime(a.createdAt)}</span>
                  {active ? (
                    <Badge tone="market" icon={<Check className="size-3" aria-hidden />}>
                      사용 중
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={switching === a.id}
                      onClick={async () => {
                        setSwitching(a.id);
                        try {
                          await activateAnalysis(a.id);
                        } finally {
                          setSwitching(null);
                        }
                      }}
                    >
                      이 결과 사용
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <p className="mt-6 flex items-start gap-1.5 text-xs leading-relaxed text-ink-500">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        저장 위치: {analysis.storage === "browser-only" ? "이 브라우저 (서버 저장 실패)" : `${analysis.storage} + 이 브라우저`} · 대화 원문은 서버에 저장하지 않아요.
      </p>
    </div>
  );
}
