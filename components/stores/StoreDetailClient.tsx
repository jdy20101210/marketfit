"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bookmark, ExternalLink, Eye, FileText, Footprints, Heart, MapPinned, Phone, Sparkles, Tag } from "lucide-react";
import { ScoreMeter, TasteBars } from "@/components/charts/TasteBars";
import { AccuracyBadge, CategoryText, RankBadge, ScorePill } from "@/components/stores/StoreBits";
import { StoreActions } from "@/components/stores/StoreActions";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton, Spinner, buttonClass } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ErrorState, Notice } from "@/components/ui/States";
import type { RecommendationItem, RecommendationThreshold, StoreDTO } from "@/lib/api/schemas";
import { errorMessage } from "@/lib/client/api";
import { fetchRecommendations, recordView, useRecommendations } from "@/lib/client/recommendations";
import { TASTE_META, toVector } from "@/lib/recommendation/dimensions";
import { matchHeadline, SCORE_COMPONENT_META, SCORE_WEIGHTS, scoreLabel, type ScoreComponentKey } from "@/lib/recommendation/engine";
import { matchSummary } from "@/lib/recommendation/reasons";
import { LOCATION_BASIS_LABEL, MARKET_REPRESENTATIVE_ADDRESS, PHONE_STATUS_LABEL } from "@/lib/stores/parse";
import { MARKET_FEATURE_KEYS, MARKET_FEATURE_META } from "@/lib/stores/types";

/** 점포 상세 — 원본 데이터와 추정 성향을 구분해 보여줍니다. */
export function StoreDetailClient({ store, mockNotice }: { store: StoreDTO; mockNotice: string }) {
  const { hydrated, analysis, recommendations, byId, loading, error, retry } = useRecommendations();
  const [extra, setExtra] = useState<{ item: RecommendationItem; threshold: RecommendationThreshold } | null>(null);
  const [extraError, setExtraError] = useState<string | null>(null);
  const rec = byId.get(store.id) ?? extra?.item ?? null;
  const threshold = recommendations?.threshold ?? extra?.threshold ?? null;

  useEffect(() => {
    recordView(store.id);
  }, [store.id]);

  // 추천 기준 미만이라 목록에 없는 점포는 이 점포만 따로 계산해 점수를 보여줍니다.
  useEffect(() => {
    if (!analysis || !recommendations || byId.has(store.id) || extra?.item.storeId === store.id) return;
    let cancelled = false;
    fetchRecommendations(analysis, [store.id])
      .then((res) => {
        const item = res.items.find((i) => i.storeId === store.id);
        if (!cancelled && item) setExtra({ item, threshold: res.threshold });
      })
      .catch((err) => {
        if (!cancelled) setExtraError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [analysis, recommendations, byId, store.id, extra]);

  const kakaoQuery = store.locationBasis === "market_zone" || !store.geocodeQuery ? `대전중앙시장 ${store.name}` : store.geocodeQuery;
  const storeTaste = toVector(store.inferred.taste);
  const belowThreshold = rec !== null && rec.rank === null && threshold?.applied !== null;

  return (
    <div className="container-page max-w-5xl pt-4 sm:pt-6">
      <Link href="/market-map" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-600 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> AI 추천 시장 지도
      </Link>

      <header className="mb-5 animate-rise">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge tone="market">
            <CategoryText main={store.mainCategory} sub={store.subCategory} />
          </Badge>
          <Badge tone="outline">{store.entityKind === "street_vendor" ? "노점" : "점포"}</Badge>
          <AccuracyBadge accuracy={store.location.accuracy} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {rec?.rank ? <RankBadge rank={rec.rank} className="size-11 text-base" /> : null}
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-ink-900 sm:text-4xl">{store.name}</h1>
        </div>
        <p className="mt-1 text-[15px] text-ink-600">{store.storeType}</p>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-800">
          {store.description.text}
          <span className="ml-1.5 inline-flex translate-y-[-1px] items-center rounded-full bg-paper px-2 py-0.5 align-middle text-[11px] font-semibold text-ink-500 ring-1 ring-ink-200">
            원본 데이터 기반 소개
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
              {!hydrated || (loading && analysis && !rec) ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-ink-600">
                  <Spinner /> 추천 정보를 불러오는 중…
                </p>
              ) : error || extraError ? (
                <ErrorState
                  className="mt-3"
                  title="추천 정보를 불러오지 못했어요"
                  message={error ?? extraError ?? ""}
                  action={
                    <Button size="sm" onClick={retry}>
                      다시 시도
                    </Button>
                  }
                />
              ) : !analysis ? (
                <div className="mt-3">
                  <p className="text-sm text-ink-700">취향 분석을 하면 이 점포와의 일치도와 추천 이유를 보여드려요.</p>
                  <LinkButton href="/discover" size="sm" className="mt-3">
                    취향 분석 시작
                  </LinkButton>
                </div>
              ) : !rec ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-ink-600">
                  <Spinner /> 이 점포의 점수를 계산하는 중…
                </p>
              ) : (
                <div className="mt-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl font-extrabold text-market-800">{matchHeadline(rec.score)}</p>
                      <p className="text-sm font-semibold text-market-700">
                        {scoreLabel(rec.score)}
                        {rec.rank ? ` · 추천 ${rec.rank}위` : ""}
                      </p>
                    </div>
                    <ScorePill score={rec.score} className="text-lg" />
                  </div>
                  <div className="mt-3">
                    <ScoreMeter score={rec.score} />
                  </div>
                  {belowThreshold ? (
                    <Notice className="mt-3">
                      이 점포는 추천 기준({threshold?.applied}점)보다 점수가 낮아 지도에는 표시되지 않아요. 점수를 올려서 보여주지 않습니다.
                    </Notice>
                  ) : null}
                  <p className="mt-4 text-[15px] leading-relaxed text-ink-800">{rec.reason}</p>
                  <p className="mt-2 text-sm text-ink-600">{matchSummary(rec.matchedTastes)}</p>
                  <p className="mt-1 text-[11px] text-ink-500">
                    추천 이유: 점포 원본 데이터 + 매칭 결과로 작성
                  </p>

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
                      raw {rec.raw.toFixed(3)} = Σ(가중치 × 값). 표시 점수는 고정된 변환으로 0~100으로 보정한 값이에요. 추천 점수와 순위는 알고리즘이 계산하고
                      AI는 관여하지 않아요.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <CardHeader title="이 점포, 어땠나요?" description="표시한 내용은 다음 추천 점수에 반영돼요." />
            <div className="mt-4">
              <StoreActions storeId={store.id} storeName={store.name} />
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <CardHeader
              title="이 점포의 추천 성향 (추정)"
              description={analysis ? "막대: 점포 성향(분류·품목 기반 추정) · 노란 눈금: 나의 취향" : "원본 분류와 품목을 바탕으로 규칙으로 추정한 값이에요."}
            />
            <div className="mt-4">
              <TasteBars
                vector={storeTaste}
                emphasize={3}
                minScore={0.2}
                title={`${store.name} 추천 성향`}
                compareWith={analysis?.profile.categories}
                compareLabel="나의 취향"
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">{store.inferred.rationale}</p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5 sm:p-6">
            <CardHeader title="점포 정보 (원본)" description="대전중앙시장 공식 점포 목록의 값을 그대로 보여줘요." />
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="flex items-center gap-1.5 font-semibold text-ink-800">
                  <MapPinned className="size-4" aria-hidden /> 위치
                </dt>
                <dd className="mt-1 text-ink-700">
                  {store.raw.addressRaw || "정보 없음"}
                  <p className="mt-1 text-xs text-ink-500">
                    {LOCATION_BASIS_LABEL[store.locationBasis]} · {store.location.note}
                  </p>
                  {store.locationBasis === "market_zone" ? (
                    <p className="mt-1 text-xs text-ink-500">구역 기준 대표 주소: {MARKET_REPRESENTATIVE_ADDRESS}</p>
                  ) : null}
                  {store.raw.zone ? <p className="mt-1 text-xs text-ink-500">구역: {store.raw.zone}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link href={`/market-map`} className={buttonClass("secondary", "sm")}>
                      추천 지도 열기
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
                    <span>
                      {PHONE_STATUS_LABEL[store.phoneStatus]}
                      {store.phoneStatus === "check" ? ` (원본: ${store.raw.phoneRaw})` : ""}
                    </span>
                  )}
                </dd>
              </div>
              {store.raw.items.length ? (
                <div>
                  <dt className="flex items-center gap-1.5 font-semibold text-ink-800">
                    <Tag className="size-4" aria-hidden /> 원본에 적힌 품목
                  </dt>
                  <dd className="mt-1.5 flex flex-wrap gap-1.5">
                    {store.raw.items.map((h) => (
                      <span key={h} className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-ink-700 ring-1 ring-ink-200">
                        {h}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="flex items-center gap-1.5 font-semibold text-ink-800">
                  <FileText className="size-4" aria-hidden /> 출처 · 비고
                </dt>
                <dd className="mt-1 break-all text-ink-700">
                  {store.raw.source || "—"}
                  <p className="mt-1 text-xs text-ink-500">
                    수집일 {store.raw.collectedAt || "—"} · 원본 번호 {store.raw.sourceIds.join(", ")} · 분류 원문 {store.raw.categoriesRaw}
                  </p>
                  {store.note ? <p className="mt-1 text-xs text-ink-500">{store.note}</p> : null}
                </dd>
              </div>
            </dl>
            <Notice tone="neutral" className="mt-4 text-xs">
              영업 여부·세부 호수·연락처·가격은 변동될 수 있어요. 방문 전 전화나 현장에서 확인해 주세요.
            </Notice>
          </Card>

          <Card className="p-5 sm:p-6">
            <CardHeader title="관심 지표" description={mockNotice} />
            <ul className="mt-4 grid grid-cols-2 gap-3">
              {[
                { key: "visit", label: "방문", value: store.activity.visitCount, icon: Footprints },
                { key: "like", label: "좋아요", value: store.activity.likeCount, icon: Heart },
                { key: "save", label: "저장", value: store.activity.saveCount, icon: Bookmark },
                { key: "interest", label: "관심 사용자", value: store.activity.interestUsers, icon: Eye },
              ].map((s) => (
                <li key={s.key} className="rounded-2xl bg-cream px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs text-ink-600">
                    <s.icon className="size-3.5" aria-hidden /> {s.label}
                  </p>
                  <p className="tabular mt-0.5 text-2xl font-extrabold text-ink-900">{s.value}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5 sm:p-6">
            <CardHeader title="중앙시장 특성 (추정)" description="추천에서 보조적으로만 반영돼요 (가중치 0.10)." />
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
