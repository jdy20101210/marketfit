"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, FileText, MapPinned, Phone, Sparkles, Tag } from "lucide-react";
import { ScoreMeter, TasteBars } from "@/components/charts/TasteBars";
import { AccuracyBadge, ScorePill } from "@/components/stores/StoreBits";
import { StoreActions } from "@/components/stores/StoreActions";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton, Spinner, buttonClass } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorState, Notice } from "@/components/ui/States";
import type { StoreDTO } from "@/lib/api/schemas";
import { recordView, useRecommendations } from "@/lib/client/recommendations";
import { TASTE_META, toVector } from "@/lib/recommendation/dimensions";
import { matchHeadline, SCORE_COMPONENT_META, SCORE_WEIGHTS, scoreLabel, type ScoreComponentKey } from "@/lib/recommendation/engine";
import { matchSummary } from "@/lib/recommendation/reasons";
import { ENTITY_KIND_LABEL, MARKET_REPRESENTATIVE_ADDRESS, PHONE_STATUS_LABEL } from "@/lib/stores/parse";
import { MARKET_FEATURE_KEYS, MARKET_FEATURE_META } from "@/lib/stores/types";

export function StoreDetailClient({ store }: { store: StoreDTO }) {
  const { hydrated, profile, byId, loading, error, retry } = useRecommendations();
  const rec = byId.get(store.id) ?? null;

  useEffect(() => {
    recordView(store.id);
  }, [store.id]);

  const kakaoQuery = store.locationBasis === "market_zone" || !store.geocodeQuery ? `대전중앙시장 ${store.name}` : store.geocodeQuery;
  const storeTaste = toVector(store.inferred.taste);

  return (
    <div className="container-page max-w-5xl pt-4 sm:pt-6">
      <Link href={`/market-map?store=${store.id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-600 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> AI 시장 지도
      </Link>

      <header className="mb-5 animate-rise">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge tone="market">{store.primaryCategory}</Badge>
          <Badge tone="outline">{ENTITY_KIND_LABEL[store.entityKind]}</Badge>
          <AccuracyBadge accuracy={store.location.accuracy} />
        </div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-ink-900 sm:text-4xl">{store.name}</h1>
        <p className="mt-1 text-[15px] text-ink-600">{store.storeType}</p>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-800">
          {store.description.text}
          <span className="ml-1.5 inline-flex translate-y-[-1px] items-center rounded-full bg-paper px-2 py-0.5 align-middle text-[11px] font-semibold text-ink-500 ring-1 ring-ink-200">
            {store.description.provider === "gemini" ? "AI 소개 · 원본 데이터 기반" : "원본 데이터 기반 소개"}
          </span>
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div aria-hidden className="awning h-1.5" />
            <div className="p-5 sm:p-6">
              <h2 className="flex items-center gap-1.5 text-lg font-bold text-ink-900">
                <Sparkles className="size-5 text-sign-600" aria-hidden /> 왜 나에게 추천됐나요?
              </h2>
              {!hydrated || (loading && profile && !rec) ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-ink-600">
                  <Spinner /> 추천 정보를 불러오는 중…
                </p>
              ) : profile && !rec && error && store.recommendable ? (
                <ErrorState
                  className="mt-3"
                  title="추천 정보를 불러오지 못했어요"
                  message={error}
                  action={
                    <Button size="sm" onClick={retry}>
                      다시 시도
                    </Button>
                  }
                />
              ) : !store.recommendable ? (
                <p className="mt-3 text-sm leading-relaxed text-ink-700">시장 관리·고객 문의 창구로, 개인화 추천 점수를 계산하지 않아요.</p>
              ) : !profile || !rec ? (
                <div className="mt-3">
                  <p className="text-sm text-ink-700">취향 분석을 하면 이 점포와의 적합도와 추천 이유를 보여드려요.</p>
                  <LinkButton href="/onboarding" size="sm" className="mt-3">
                    취향 분석 시작
                  </LinkButton>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl font-extrabold text-market-800">{matchHeadline(rec.score)}</p>
                      <p className="text-sm font-semibold text-market-700">{scoreLabel(rec.score)}</p>
                    </div>
                    <ScorePill score={rec.score} className="text-lg" />
                  </div>
                  <div className="mt-3">
                    <ScoreMeter score={rec.score} />
                  </div>
                  <p className="mt-4 text-[15px] leading-relaxed text-ink-800">{rec.reason}</p>
                  <p className="mt-2 text-sm text-ink-600">{matchSummary(rec.matchedTastes)}</p>
                  <p className="mt-1 text-[11px] text-ink-500">{rec.reasonProvider === "gemini" ? "추천 이유: Gemini 작성 (확인된 품목 외 내용은 추정)" : "추천 이유: 점포 데이터 기반 템플릿"}</p>

                  {rec.matchedTastes.length ? (
                    <div className="mt-5">
                      <p className="mb-2 text-sm font-bold text-ink-800">나와 맞는 취향</p>
                      <ul className="grid gap-2 sm:grid-cols-3">
                        {rec.matchedTastes.map((m) => (
                          <li key={m.key} className="rounded-2xl border border-market-100 bg-market-50 px-3 py-2.5">
                            <p className="font-semibold text-market-800">
                              {TASTE_META[m.key].emoji} {TASTE_META[m.key].label}
                            </p>
                            <p className="tabular mt-0.5 text-xs text-ink-600">
                              나 {Math.round(m.user * 100)} · 점포 {Math.round(m.store * 100)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="mt-5">
                    <p className="mb-2 text-sm font-bold text-ink-800">점수 구성</p>
                    <ul className="space-y-2.5">
                      {(Object.keys(SCORE_WEIGHTS) as ScoreComponentKey[]).map((key) => {
                        const value = rec.components[key];
                        const isFeedback = key === "interaction_feedback";
                        const pct = Math.round((isFeedback ? (value + 1) / 2 : value) * 100);
                        return (
                          <li key={key} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-2 text-sm">
                            <span className="text-ink-700" title={SCORE_COMPONENT_META[key].hint}>
                              {SCORE_COMPONENT_META[key].label}
                              <span className="tabular ml-1 text-[11px] text-ink-400">×{SCORE_WEIGHTS[key].toFixed(2)}</span>
                            </span>
                            <span className="relative h-2 rounded-r-[4px] bg-ink-100" aria-hidden>
                              <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-market-500" style={{ width: `${Math.max(1, pct)}%` }} />
                            </span>
                            <span className="tabular text-right text-ink-600">
                              {isFeedback ? (value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2)) : Math.round(value * 100)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
                      raw {rec.raw.toFixed(3)} = Σ(가중치 × 값). 표시 점수는 0~100으로 보정한 값이에요. 추천 점수는 알고리즘이 계산하고 AI는 관여하지 않아요.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {store.recommendable ? (
            <Card className="p-5 sm:p-6">
              <CardHeader title="이 점포, 어땠나요?" description="표시한 내용은 다음 추천에 반영돼요." />
              <div className="mt-4">
                <StoreActions storeId={store.id} />
              </div>
            </Card>
          ) : null}

          <Card className="p-5 sm:p-6">
            <CardHeader
              title="이 점포의 추천 성향"
              description={profile ? "막대: 점포 성향(유형·비고 기반 추정) · 노란 눈금: 나의 취향" : "점포 유형과 비고의 품목을 바탕으로 추정한 값이에요."}
            />
            <div className="mt-4">
              <TasteBars vector={storeTaste} emphasize={3} minScore={0.2} title={`${store.name} 추천 성향`} compareWith={profile?.taste} compareLabel="나의 취향" />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">{store.inferred.rationale}</p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5 sm:p-6">
            <CardHeader title="점포 정보" description="엑셀 원본(대전중앙시장 점포·상권 40개)의 값을 그대로 보여줘요." />
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="flex items-center gap-1.5 font-semibold text-ink-800">
                  <MapPinned className="size-4" aria-hidden /> 위치
                </dt>
                <dd className="mt-1 text-ink-700">
                  {store.raw.addressRaw || "정보 없음"}
                  <p className="mt-1 text-xs text-ink-500">{store.location.note}</p>
                  {store.locationBasis === "market_zone" ? (
                    <p className="mt-1 text-xs text-ink-500">활성화구역 공식 대표 주소: {MARKET_REPRESENTATIVE_ADDRESS}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link href={`/market-map?store=${store.id}`} className={buttonClass("secondary", "sm")}>
                      AI 지도에서 보기
                    </Link>
                    <a
                      href={`https://map.kakao.com/link/search/${encodeURIComponent(kakaoQuery)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClass("secondary", "sm")}
                    >
                      카카오맵에서 검색 <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </div>
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 font-semibold text-ink-800">
                  <Phone className="size-4" aria-hidden /> 연락처
                </dt>
                <dd className="mt-1 text-ink-700">
                  {store.phone ? (
                    <a href={`tel:${store.phone}`} className="font-semibold text-market-700 underline-offset-2 hover:underline">
                      {store.phone}
                    </a>
                  ) : (
                    <span>{store.raw.phoneRaw || PHONE_STATUS_LABEL[store.phoneStatus]}</span>
                  )}
                </dd>
              </div>
              {store.productHints.length ? (
                <div>
                  <dt className="flex items-center gap-1.5 font-semibold text-ink-800">
                    <Tag className="size-4" aria-hidden /> 원본에 적힌 품목
                  </dt>
                  <dd className="mt-1.5 flex flex-wrap gap-1.5">
                    {store.productHints.map((h) => (
                      <span key={h} className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-ink-700 ring-1 ring-ink-200">
                        {h}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="flex items-center gap-1.5 font-semibold text-ink-800">
                  <FileText className="size-4" aria-hidden /> 확인 출처 · 비고
                </dt>
                <dd className="mt-1 text-ink-700">
                  {store.raw.source || "—"}
                  {store.note ? <span className="text-ink-500"> · {store.note}</span> : null}
                </dd>
              </div>
            </dl>
            <Notice tone="neutral" className="mt-4 text-xs">
              영업 여부·세부 호수·연락처는 변동될 수 있어요. 방문 전 전화 또는 현장 확인을 권장해요.
            </Notice>
          </Card>

          <Card className="p-5 sm:p-6">
            <CardHeader title="중앙시장 특성" description="추천에서 보조적으로만 반영돼요 (가중치 0.10)." />
            <ul className="mt-4 space-y-3">
              {MARKET_FEATURE_KEYS.map((key) => {
                const value = store.inferred.market[key] ?? 0;
                return (
                  <li key={key}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-ink-800">{MARKET_FEATURE_META[key].label}</span>
                      <span className="tabular text-ink-600">{Math.round(value * 100)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-r-[4px] bg-sign-100" aria-hidden>
                      <div className="h-2 rounded-r-[4px] bg-sign-500" style={{ width: `${Math.round(value * 100)}%` }} />
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">{MARKET_FEATURE_META[key].hint}</p>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
