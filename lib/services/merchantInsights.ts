import "server-only";
import { getRepository } from "@/lib/db";
import type { InteractionType, MerchantInsightRecord } from "@/lib/db/types";
import { topTastes, type TasteKey, type TasteVector } from "@/lib/recommendation/dimensions";
import { cosineSimilarity } from "@/lib/recommendation/engine";
import { vectorFromKeywords } from "@/lib/recommendation/keywords";
import { MOCK_PERSONAS } from "@/lib/providers/instagram/personas";
import { getStores } from "@/lib/stores/catalog";

/** 개인을 특정할 수 없도록 이 인원 미만이면 실제 집계를 공개하지 않습니다. */
export const MIN_USERS_FOR_INSIGHTS = 5;

export interface MerchantInsights {
  scope: "market" | "store";
  storeId: string | null;
  isMock: boolean;
  distinctUsers: number | null;
  minUsers: number;
  tasteShare: { key: TasteKey; share: number }[];
  interactionCounts: Partial<Record<InteractionType, number>>;
  productIdeas: string[];
  generatedAt: string;
}

const IDEAS: Record<TasteKey, string> = {
  gift: "선물용 소포장·묶음 구성",
  traditional: "전통 품목을 소개하는 체험형 진열",
  camping: "캠핑·야외용 소형 구성 제안",
  coffee: "홈카페 테마 진열",
  travel: "여행객용 지역 기념품 패키지",
  local: "지역 특산품 체험형 패키지",
  family: "가족 단위 생활 묶음 구성",
  date: "커플·친구용 2인 구성",
  vintage: "레트로 감성 진열·포토존",
  craft: "자투리 원단 DIY 키트",
  food: "시장 먹거리 맛보기 소포장",
  dessert: "간식 소포장·테이크아웃 구성",
  fashion: "코디 제안 세트",
  accessory: "잡화 코디 추천 진열",
  living: "계절 인테리어 추천 진열",
  kitchen: "1~2인 가구 주방 스타터 구성",
  practical: "실속 묶음 구성",
  discovery: "처음 오는 손님을 위한 대표 품목 안내판",
  price_sensitive: "가격대별 추천 진열",
};

function shareFromVectors(vectors: TasteVector[]): { key: TasteKey; share: number }[] {
  const acc: Record<string, number> = {};
  for (const v of vectors) for (const t of topTastes(v, 3, 0.3)) acc[t.key] = (acc[t.key] ?? 0) + t.score;
  const top = Object.entries(acc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5) as [TasteKey, number][];
  const total = top.reduce((s, [, w]) => s + w, 0) || 1;
  const shares = top.map(([key, w]) => ({ key, share: Math.round((w / total) * 100) }));
  // 반올림 오차 보정 (합계 100)
  const diff = 100 - shares.reduce((s, x) => s + x.share, 0);
  if (shares[0]) shares[0].share += diff;
  return shares;
}

/**
 * 데모 데이터: 데모 페르소나 6종의 취향 vector를 점포 성향과의 유사도로 가중해 만든 가상 분포.
 * 실제 이용자 데이터가 최소 인원 이상 쌓이면 사용되지 않습니다.
 */
function mockInsights(storeTaste: TasteVector | null, storeId: string | null): Omit<MerchantInsights, "generatedAt"> {
  const personas = MOCK_PERSONAS.map((p) => vectorFromKeywords(p.interests).vector);
  const weighted: TasteVector[] = [];
  for (const v of personas) {
    const w = storeTaste ? cosineSimilarity(v, storeTaste) : 1;
    const copies = Math.max(1, Math.round(w * 4));
    for (let i = 0; i < copies; i++) weighted.push(v);
  }
  const tasteShare = shareFromVectors(weighted);
  const seed = [...(storeId ?? "market")].reduce((s, c) => s + c.charCodeAt(0), 0);
  return {
    scope: storeId ? "store" : "market",
    storeId,
    isMock: true,
    distinctUsers: null,
    minUsers: MIN_USERS_FOR_INSIGHTS,
    tasteShare,
    interactionCounts: { view: 40 + (seed % 60), like: 8 + (seed % 12), bookmark: 5 + (seed % 9), visit: 2 + (seed % 6) },
    productIdeas: [...new Set(tasteShare.slice(0, 3).map((t) => IDEAS[t.key]))],
  };
}

/** 실제 집계 스냅샷을 재사용하는 시간 (merchant_insights 테이블) */
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;

function fromSnapshot(r: MerchantInsightRecord): MerchantInsights {
  return {
    scope: r.storeId ? "store" : "market",
    storeId: r.storeId,
    isMock: r.isMock,
    distinctUsers: r.distinctUsers,
    minUsers: MIN_USERS_FOR_INSIGHTS,
    tasteShare: r.tasteDistribution,
    interactionCounts: r.interactionCounts,
    productIdeas: r.productIdeas,
    generatedAt: r.createdAt,
  };
}

const toDate = (iso: string) => iso.slice(0, 10);

/**
 * 상인 인사이트 (익명 집계)
 * 1) 5분 이내의 실제 집계 스냅샷이 있으면 재사용
 * 2) 긍정 행동(좋아요·찜·방문)을 남긴 서로 다른 이용자가 5명 이상이면 취향 분포를 집계해 merchant_insights에 저장
 * 3) 그 미만이면 데모 데이터(저장하지 않음)
 */
export async function getMerchantInsights(storeId: string | null): Promise<MerchantInsights> {
  const repo = getRepository();
  const stores = await getStores();
  const store = storeId ? stores.find((s) => s.id === storeId) ?? null : null;
  if (storeId && !store) throw new Error("존재하지 않는 점포입니다.");

  const snapshot = await repo.latestMerchantInsight(storeId).catch(() => null);
  if (snapshot && !snapshot.isMock && Date.now() - Date.parse(snapshot.createdAt) < SNAPSHOT_TTL_MS) {
    return fromSnapshot(snapshot);
  }

  let positives: Awaited<ReturnType<typeof repo.listPositiveInteractions>> = [];
  let counts: Partial<Record<InteractionType, number>> = {};
  try {
    positives = (await repo.listPositiveInteractions(5000)).filter((i) => !storeId || i.storeId === storeId);
    const byStore = await repo.countInteractionsByStore();
    if (storeId) counts = byStore[storeId] ?? {};
    else
      for (const c of Object.values(byStore))
        for (const [t, n] of Object.entries(c) as [InteractionType, number][]) counts[t] = (counts[t] ?? 0) + n;
  } catch (err) {
    console.warn("[merchant] 집계 데이터를 불러오지 못했습니다:", err);
  }

  const userIds = [...new Set(positives.map((p) => p.userId))];
  const generatedAt = new Date().toISOString();
  if (userIds.length < MIN_USERS_FOR_INSIGHTS) {
    return { ...mockInsights(store?.features.taste ?? null, storeId), generatedAt };
  }
  const prefs = await repo.latestPreferences(userIds).catch(() => []);
  if (prefs.length < MIN_USERS_FOR_INSIGHTS) {
    return { ...mockInsights(store?.features.taste ?? null, storeId), generatedAt };
  }
  const tasteShare = shareFromVectors(prefs.map((p) => p.tasteVector));
  const dates = positives.map((p) => p.createdAt).sort();
  const record: MerchantInsightRecord = {
    storeId,
    periodStart: dates[0] ? toDate(dates[0]) : null,
    periodEnd: dates.at(-1) ? toDate(dates.at(-1)!) : null,
    distinctUsers: prefs.length,
    tasteDistribution: tasteShare,
    interactionCounts: counts,
    productIdeas: [...new Set(tasteShare.slice(0, 3).map((t) => IDEAS[t.key]))],
    isMock: false,
    createdAt: generatedAt,
  };
  await repo.saveMerchantInsight(record).catch((err) => console.warn("[merchant] 인사이트 스냅샷 저장 실패:", err));
  return fromSnapshot(record);
}
