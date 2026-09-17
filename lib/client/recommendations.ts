"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RecommendationItem } from "@/lib/api/schemas";
import type { TasteVector } from "@/lib/recommendation/dimensions";
import { api, errorMessage } from "./api";
import { getState, setState, toggleInList, updateProfileTaste, useMarketFit, type InteractionList, type MarketFitState } from "./store";

let inflight: Promise<void> | null = null;

type InteractionState = MarketFitState["interactions"];

function mergeLists(local: InteractionState, server: InteractionState): InteractionState {
  const union = (a: string[], b: string[]) => (b.every((id) => a.includes(id)) ? a : [...new Set([...a, ...b])]);
  const next = {
    liked: union(local.liked, server.liked),
    bookmarked: union(local.bookmarked, server.bookmarked),
    visited: union(local.visited, server.visited),
    dismissed: union(local.dismissed, server.dismissed),
  };
  const same = (Object.keys(next) as (keyof InteractionState)[]).every((k) => next[k] === local[k]);
  return same ? local : next;
}

/** 현재 취향·행동 상태로 추천을 다시 계산합니다 (Gemini 이유는 기존 값을 유지). */
export function refreshRecommendations(): Promise<void> {
  if (inflight) return inflight;
  const { profile, interactions, recommendations } = getState();
  if (!profile) return Promise.resolve();
  inflight = api
    .post<{ items: RecommendationItem[]; generatedAt: string; interactions?: InteractionState }>("/api/recommendations", {
      profile: { taste: profile.taste, recent: profile.recent },
      interactions,
    })
    .then((res) => {
      const previous = new Map((recommendations?.items ?? []).map((i) => [i.storeId, i]));
      const items = res.items.map((item) => {
        const prev = previous.get(item.storeId);
        return prev?.reasonProvider === "gemini" ? { ...item, reason: prev.reason, reasonProvider: "gemini" as const } : item;
      });
      setState((s) => ({
        ...s,
        // 서버에 기록된 행동(다른 탭·저장소 초기화 이전 기록 포함)을 브라우저 목록에 합칩니다.
        interactions: res.interactions ? mergeLists(s.interactions, res.interactions) : s.interactions,
        recommendations: {
          items,
          generatedAt: res.generatedAt,
          reasonProvider: items.some((i) => i.reasonProvider === "gemini") ? "gemini" : "template",
        },
      }));
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** 저장된 추천을 반환하고, 프로필은 있는데 추천이 없으면 자동으로 계산합니다. */
export function useRecommendations() {
  const { state, hydrated } = useMarketFit();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const attempted = useRef(false);
  const needsFetch = hydrated && Boolean(state.profile) && !state.recommendations;

  useEffect(() => {
    if (!needsFetch || attempted.current) return;
    attempted.current = true;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true);
        return refreshRecommendations();
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needsFetch]);

  const byId = useMemo(() => new Map((state.recommendations?.items ?? []).map((i) => [i.storeId, i])), [state.recommendations]);
  return {
    hydrated,
    profile: state.profile,
    recommendations: state.recommendations,
    byId,
    interactions: state.interactions,
    // 자동 계산이 실패하면(error) 더 이상 로딩으로 보지 않습니다 — 화면이 오류 상태와 '다시 시도'를 보여줍니다.
    loading: loading || (needsFetch && !error),
    error,
    retry: () => {
      setError(null);
      setLoading(true);
      refreshRecommendations()
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setLoading(false));
    },
  };
}

const LIST_BY_TYPE: Record<"like" | "bookmark" | "visit" | "dismiss", InteractionList> = {
  like: "liked",
  bookmark: "bookmarked",
  visit: "visited",
  dismiss: "dismissed",
};

/** 좋아요/찜/방문/관심 없음 토글 → 서버 기록 + 간단한 취향 업데이트 + 추천 재계산 */
export async function recordInteraction(storeId: string, type: "like" | "bookmark" | "visit" | "dismiss", active: boolean) {
  toggleInList(LIST_BY_TYPE[type], storeId, active);
  const taste: TasteVector | null = getState().profile?.taste ?? null;
  try {
    const res = await api.post<{ recorded: boolean; taste: TasteVector | null }>("/api/interactions", { storeId, type, active, taste });
    if (res.taste) updateProfileTaste(res.taste);
  } catch (err) {
    // 서버 기록 실패 시에도 브라우저 상태는 유지합니다.
    console.warn("행동 기록 실패:", errorMessage(err));
  }
  if (getState().profile) await refreshRecommendations().catch(() => undefined);
}

const viewed = new Set<string>();
export function recordView(storeId: string) {
  if (viewed.has(storeId)) return;
  viewed.add(storeId);
  void api.post("/api/interactions", { storeId, type: "view", active: true }).catch(() => undefined);
}
