"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Bot, Camera, Footprints, Heart, MapPinned, PenLine, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { TasteBars } from "@/components/charts/TasteBars";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton, Spinner } from "@/components/ui/Button";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { StoreMiniCard, type StoreSummary } from "@/components/stores/StoreBits";
import { api, errorMessage } from "@/lib/client/api";
import { useRecommendations } from "@/lib/client/recommendations";
import { resetState, useMarketFit } from "@/lib/client/store";
import { TASTE_META, topTastes } from "@/lib/recommendation/dimensions";

export function ProfileClient({ stores }: { stores: StoreSummary[] }) {
  const router = useRouter();
  const { hydrated, profile, recommendations, interactions, loading, error, retry } = useRecommendations();
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

  if (!profile) {
    return (
      <div className="container-page max-w-3xl pt-10">
        <EmptyState
          icon={<Sparkles className="size-6" aria-hidden />}
          title="아직 취향 프로필이 없어요"
          description="Instagram 관심사나 관심 상품으로 1분 만에 나의 중앙시장 취향을 만들어보세요."
          action={<LinkButton href="/onboarding">취향 분석 시작하기</LinkButton>}
        />
      </div>
    );
  }

  const top = topTastes(profile.taste, 5, 0.05);
  const recItems = (recommendations?.items ?? []).filter((i) => i.recommendable && !i.dismissed);
  const savedLists: { key: keyof typeof interactions; label: string; icon: typeof Heart }[] = [
    { key: "bookmarked", label: "찜한 점포", icon: Bookmark },
    { key: "liked", label: "좋아요", icon: Heart },
    { key: "visited", label: "방문했어요", icon: Footprints },
  ];

  return (
    <div className="container-page max-w-5xl pt-6 sm:pt-10">
      <PageHeader eyebrow="STEP 4" title="나의 중앙시장 취향" description="AI가 분석한 취향 vector와 그 근거예요. 좋아요·찜·방문 기록에 따라 조금씩 업데이트돼요." />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card className="overflow-hidden">
          <div className="bg-market-700 p-5 text-white sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="sign" icon={<Bot className="size-3" aria-hidden />}>
                {profile.provider === "gemini" ? `Gemini · ${profile.model ?? ""}` : "데모 AI 분석"}
              </Badge>
              <Badge tone="outline" icon={<Camera className="size-3" aria-hidden />}>
                {profile.instagramModeUsed === "real" ? "실제 Instagram" : profile.instagramModeUsed === "mock" ? "데모 Instagram" : "Instagram 미사용"}
              </Badge>
            </div>
            <p className="mt-4 text-sm text-white/75">나의 시장 페르소나</p>
            <p className="text-3xl font-extrabold tracking-tight">{profile.personaLabel}</p>
            <p className="mt-2 leading-relaxed text-white/90">{profile.summary}</p>
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-sm font-bold text-ink-800">대표 취향 TOP {top.length}</p>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {top.map((t, i) => (
                <li key={t.key} className={i === 0 ? "col-span-2 sm:col-span-1" : undefined}>
                  <div className="flex items-center justify-between rounded-2xl border border-ink-200 bg-cream px-3.5 py-3">
                    <span className="flex items-center gap-2 font-semibold text-ink-800">
                      <span aria-hidden className="text-xl">
                        {TASTE_META[t.key].emoji}
                      </span>
                      {TASTE_META[t.key].label}
                    </span>
                    <span className="text-2xl font-extrabold text-market-700">{Math.round(t.score * 100)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {profile.fallbackReason ? (
              <p className="mt-3 text-xs text-sign-800">Gemini 호출이 실패해 데모 AI 결과를 사용했어요: {profile.fallbackReason}</p>
            ) : null}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <CardHeader
            title="취향 vector"
            description={profile.items.length ? "막대: 전체 취향 · 노란 눈금: 직접 입력한 최근 관심" : "17가지 취향 차원별 점수 (0~100)"}
          />
          <div className="mt-4">
            <TasteBars
              vector={profile.taste}
              emphasize={5}
              minScore={0.05}
              title="나의 취향 점수"
              compareWith={profile.items.length ? profile.recent : undefined}
              compareLabel="최근 관심"
            />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <CardHeader title="분석에 사용한 정보" description="AI에 전달된 입력과 해석 결과예요." />
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-800">
                <PenLine className="size-4" aria-hidden /> 직접 입력한 관심 상품
              </p>
              {profile.items.length ? (
                <ul className="space-y-1.5">
                  {profile.items.map((item) => {
                    const insight = profile.itemInsights.find((i) => i.input === item);
                    return (
                      <li key={item} className="rounded-xl bg-cream px-3 py-2 text-sm">
                        <span className="font-semibold text-ink-900">{item}</span>
                        {insight?.keys.length ? (
                          <span className="ml-2 text-ink-600">→ {insight.keys.map((k) => TASTE_META[k].label).join(", ")}</span>
                        ) : null}
                        {insight?.note ? <p className="mt-0.5 text-xs text-ink-500">{insight.note}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-ink-500">사용하지 않음</p>
              )}
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-800">
                <Camera className="size-4" aria-hidden /> Instagram 관심 키워드
              </p>
              {profile.instagramModeUsed !== "none" ? (
                <IgKeywords mode={profile.instagramModeUsed} />
              ) : (
                <p className="text-sm text-ink-500">사용하지 않음</p>
              )}
            </div>
            {profile.topCategories.some((c) => c.evidence) ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-ink-800">AI가 찾은 근거</p>
                <ul className="space-y-1 text-sm text-ink-700">
                  {profile.topCategories
                    .filter((c) => c.evidence)
                    .map((c) => (
                      <li key={c.key}>
                        <strong className="font-semibold">{TASTE_META[c.key].label}</strong> — {c.evidence}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <CardHeader
            title="나와 잘 맞는 점포"
            description="취향 적합도 순으로, 비슷한 유형이 겹치지 않게 골랐어요."
            action={
              <LinkButton href="/market-map" size="sm" icon={<MapPinned className="size-4" aria-hidden />}>
                지도
              </LinkButton>
            }
          />
          <div className="mt-4 space-y-2">
            {error ? (
              <ErrorState message={error} action={<Button size="sm" onClick={retry}>다시 시도</Button>} />
            ) : loading && !recommendations ? (
              <p className="flex items-center gap-2 text-sm text-ink-600">
                <Spinner /> 추천을 계산하는 중…
              </p>
            ) : recItems.length === 0 ? (
              <EmptyState
                title="지금 보여드릴 추천 점포가 없어요"
                description="모든 점포를 '관심 없음'으로 숨겼거나 추천이 아직 계산되지 않았어요. 지도에서 숨긴 점포를 다시 볼 수 있어요."
                action={
                  <Button size="sm" variant="secondary" onClick={retry}>
                    추천 다시 계산
                  </Button>
                }
              />
            ) : (
              recItems.slice(0, 4).map((rec, i) => {
                const store = storeById.get(rec.storeId);
                return store ? <StoreMiniCard key={rec.storeId} store={store} rec={rec} rank={i + 1} /> : null;
              })
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-5 sm:p-6">
        <CardHeader title="내가 표시한 점포" description="좋아요·찜·방문 기록은 추천 점수(interaction feedback)에 반영돼요." />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {savedLists.map((list) => {
            const ids = interactions[list.key];
            return (
              <div key={list.key}>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-800">
                  <list.icon className="size-4" aria-hidden /> {list.label} <span className="tabular text-ink-500">{ids.length}</span>
                </p>
                {ids.length ? (
                  <ul className="space-y-2">
                    {ids.map((id) => {
                      const store = storeById.get(id);
                      return store ? (
                        <li key={id}>
                          <StoreMiniCard store={store} rec={recommendations?.items.find((r) => r.storeId === id)} />
                        </li>
                      ) : null;
                    })}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-sm text-ink-500">아직 없어요</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mt-6 flex flex-wrap gap-2">
        <LinkButton href="/onboarding" variant="secondary" icon={<RefreshCw className="size-4" aria-hidden />}>
          다시 분석하기
        </LinkButton>
        <Button
          variant="danger"
          loading={deleting}
          icon={<Trash2 className="size-4" aria-hidden />}
          onClick={async () => {
            if (!window.confirm("이 브라우저와 서버에 저장된 내 취향·행동 기록을 삭제할까요?")) return;
            setDeleting(true);
            setDeleteError(null);
            try {
              await api.post("/api/me/delete");
              resetState();
              router.push("/");
            } catch (err) {
              setDeleteError(errorMessage(err));
            } finally {
              setDeleting(false);
            }
          }}
        >
          내 데이터 삭제
        </Button>
      </div>
      {deleteError ? <ErrorState className="mt-3" message={deleteError} /> : null}
    </div>
  );
}

function IgKeywords({ mode }: { mode: "real" | "mock" | "none" }) {
  const { state } = useMarketFit();
  const ig = state.instagram;
  if (!ig) return <p className="text-sm text-ink-500">정보 없음</p>;
  return (
    <div>
      <p className="mb-1.5 text-xs text-ink-500">
        {mode === "real" ? `@${ig.username ?? "instagram"} · 게시물 ${ig.mediaAnalyzed}개` : `데모 페르소나 · ${ig.personaLabel ?? ""}`}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {ig.interests.map((i) => (
          <li key={i.keyword} className="rounded-full bg-paper px-3 py-1 text-sm text-ink-700 ring-1 ring-ink-200">
            #{i.keyword} <span className="tabular text-ink-400">{Math.round(i.score * 100)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
