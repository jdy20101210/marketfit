"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, EyeOff, Footprints, Heart, MapPinned, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { TasteBars } from "@/components/charts/TasteBars";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton, Spinner } from "@/components/ui/Button";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, Notice } from "@/components/ui/States";
import { StoreMiniCard, type StoreSummary } from "@/components/stores/StoreBits";
import { api, errorMessage } from "@/lib/client/api";
import { useRecommendations } from "@/lib/client/recommendations";
import { resetState, useMarketFit } from "@/lib/client/store";
import { INPUT_MODE_LABEL } from "@/lib/preferences/types";
import { RECOMMEND_MIN_SCORE } from "@/lib/recommendation/engine";
import { formatKstDateTime } from "@/lib/format";

const LISTS = [
  { key: "bookmarked", label: "저장한 점포", icon: Bookmark },
  { key: "liked", label: "좋아요", icon: Heart },
  { key: "visited", label: "방문 표시", icon: Footprints },
  { key: "dismissed", label: "관심 없음", icon: EyeOff },
] as const;

/** 내 기록: 활성 취향 프로필 · 추천 요약 · 저장/좋아요/방문 목록 · 데이터 삭제 */
export function ProfileClient({ stores }: { stores: StoreSummary[] }) {
  const router = useRouter();
  const { state, hydrated } = useMarketFit();
  const { analysis, recommendations, byId, interactions, loading, error, retry } = useRecommendations();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const storeById = new Map(stores.map((s) => [s.id, s]));

  if (!hydrated) {
    return (
      <div className="container-page max-w-4xl pt-10">
        <p className="flex items-center gap-2 text-ink-600">
          <Spinner /> 불러오는 중…
        </p>
      </div>
    );
  }

  const removeAll = async () => {
    if (!window.confirm("이 브라우저에 저장된 취향·기록과 서버에 저장된 분석 기록을 모두 삭제할까요? 되돌릴 수 없어요.")) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.post("/api/me/delete", {});
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeleting(false);
      return;
    }
    resetState();
    setDeleting(false);
    router.push("/");
  };

  const hasLists = LISTS.some((l) => interactions[l.key].length > 0);

  if (!analysis) {
    return (
      <div className="container-page max-w-3xl pt-10">
        <EmptyState
          icon={<Sparkles className="size-6" aria-hidden />}
          title="아직 취향 분석 기록이 없어요"
          description="AI와 대화하거나 키워드를 입력하면 나만의 중앙시장 취향이 만들어져요."
          action={<LinkButton href="/discover">취향 분석 시작하기</LinkButton>}
        />
        {hasLists ? (
          <Card className="mt-6 p-5">
            <CardHeader title="저장한 점포" description="분석 기록 없이 표시해 둔 점포예요." />
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {LISTS.flatMap((l) => interactions[l.key]).slice(0, 6).map((id) => {
                const store = storeById.get(id);
                return store ? (
                  <li key={id}>
                    <StoreMiniCard store={store} />
                  </li>
                ) : null;
              })}
            </ul>
          </Card>
        ) : null}
      </div>
    );
  }

  const ranked = (recommendations?.items ?? []).filter((i) => i.rank !== null);

  return (
    <div className="container-page max-w-4xl pt-6 sm:pt-10">
      <PageHeader eyebrow="내 기록" title="나의 중앙시장 취향" description="분석 결과와 표시해 둔 점포는 이 브라우저에 보관돼요. 대화 원문은 서버에 저장하지 않습니다.">
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton href="/discover" variant="secondary" icon={<RefreshCw className="size-4" aria-hidden />}>
            다시 분석하기
          </LinkButton>
          <LinkButton href="/market-map" icon={<MapPinned className="size-4" aria-hidden />}>
            추천 지도
          </LinkButton>
        </div>
      </PageHeader>

      <Card className="p-5 sm:p-6">
        <CardHeader
          title="현재 취향 프로필"
          description={analysis.profile.summary}
          action={
            <div className="flex flex-wrap justify-end gap-1.5">
              <Badge tone="market">v{analysis.analysisVersion}</Badge>
              <Badge tone="outline">{INPUT_MODE_LABEL[analysis.inputMode]}</Badge>
            </div>
          }
        />
        <div className="mt-4">
          <TasteBars vector={analysis.profile.categories} emphasize={5} minScore={0.05} limit={8} title="나의 취향 점수" />
        </div>
        <p className="mt-3 text-xs text-ink-500">{formatKstDateTime(analysis.createdAt)} 분석 · 좋아요/저장 기록이 쌓이면 이 값이 조금씩 조정돼요.</p>
        <LinkButton href="/analysis" variant="ghost" size="sm" className="mt-2 -ml-2">
          분석 결과 자세히 보기 ({state.analyses.length}개 기록)
        </LinkButton>
      </Card>

      {error ? (
        <ErrorState
          className="mt-4"
          title="추천을 불러오지 못했어요"
          message={error}
          action={
            <Button size="sm" onClick={retry} loading={loading}>
              다시 시도
            </Button>
          }
        />
      ) : null}

      {ranked.length ? (
        <Card className="mt-4 p-5 sm:p-6">
          <CardHeader
            title={`추천 점포 ${ranked.length}곳`}
            description={`추천 기준 ${recommendations?.threshold.applied ?? RECOMMEND_MIN_SCORE}점 이상`}
            action={
              <LinkButton href="/market-map" size="sm" variant="secondary">
                전체 보기
              </LinkButton>
            }
          />
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {ranked.slice(0, 6).map((rec) => {
              const store = storeById.get(rec.storeId);
              return store ? (
                <li key={rec.storeId}>
                  <StoreMiniCard store={store} rec={rec} />
                </li>
              ) : null;
            })}
          </ul>
        </Card>
      ) : loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-600">
          <Spinner /> 추천을 계산하는 중…
        </p>
      ) : null}

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        {LISTS.map((list) => {
          const ids = interactions[list.key];
          return (
            <Card key={list.key} className="p-5">
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-1.5">
                    <list.icon className="size-4" aria-hidden /> {list.label}
                  </span>
                }
                action={<Badge tone={ids.length ? "market" : "outline"}>{ids.length}</Badge>}
              />
              {ids.length ? (
                <ul className="mt-3 space-y-2">
                  {ids.slice(0, 5).map((id) => {
                    const store = storeById.get(id);
                    return store ? (
                      <li key={id}>
                        <StoreMiniCard store={store} rec={byId.get(id) ?? null} />
                      </li>
                    ) : null;
                  })}
                  {ids.length > 5 ? <li className="text-xs text-ink-500">외 {ids.length - 5}곳</li> : null}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink-500">아직 없어요.</p>
              )}
            </Card>
          );
        })}
      </section>

      <Card className="mt-4 p-5 sm:p-6">
        <CardHeader title="내 데이터 삭제" description="브라우저 저장값과 서버에 저장된 분석·행동 기록을 함께 지웁니다." />
        <Notice className="mt-3" tone="neutral">
          MarketFit은 이름·연락처 같은 개인정보를 수집하지 않고, 대화 원문도 저장하지 않아요. 저장되는 것은 익명 세션에 연결된 취향 값과 좋아요/저장 기록입니다.
        </Notice>
        {deleteError ? <ErrorState className="mt-3" title="삭제하지 못했어요" message={deleteError} /> : null}
        <Button className="mt-3" variant="danger" loading={deleting} onClick={() => void removeAll()} icon={<Trash2 className="size-4" aria-hidden />}>
          모든 기록 삭제
        </Button>
      </Card>
    </div>
  );
}
