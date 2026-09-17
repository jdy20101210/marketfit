import "server-only";
import interestJson from "@/data/mock/market-interest.json";
import { TASTE_META, type TasteKey } from "@/lib/recommendation/dimensions";

/**
 * 프로토타입 가상 시장 관심도 집계 (data/mock/market-interest.json, 고정값)
 * 개인 식별 정보는 전혀 포함하지 않고, 취향 차원별 일자 합계만 보관합니다.
 * 실제 이용 기록이 쌓이면 화면에서 이 값에 실제 집계를 더해 보여줍니다.
 */
export const MARKET_INTEREST_META = interestJson.meta;

const SERIES = interestJson.categories as { key: TasteKey; daily: number[] }[];

export interface InterestShare {
  key: TasteKey;
  label: string;
  emoji: string;
  /** 기간 합계 */
  total: number;
  /** 기간 점유율 0~1 */
  share: number;
  /** 직전 같은 길이 기간 대비 증감률 (-1~) — 이전 데이터가 없으면 null */
  change: number | null;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** 최근 N일 취향별 관심 점유율 (기본 7일) */
export function recentInterestShares(days = 7): InterestShare[] {
  const rows = SERIES.map((s) => {
    const recent = s.daily.slice(-days);
    const previous = s.daily.slice(-days * 2, -days);
    const total = sum(recent);
    const prevTotal = sum(previous);
    return { key: s.key, total, change: previous.length === days && prevTotal > 0 ? total / prevTotal - 1 : null };
  });
  const grandTotal = sum(rows.map((r) => r.total)) || 1;
  return rows
    .map((r) => ({ ...r, label: TASTE_META[r.key].label, emoji: TASTE_META[r.key].emoji, share: r.total / grandTotal }))
    .sort((a, b) => b.total - a.total);
}

/** 관심이 빠르게 늘고 있는 취향 (증감률 기준) */
export function risingInterests(days = 7, limit = 4): InterestShare[] {
  return recentInterestShares(days)
    .filter((r) => r.change !== null && r.change > 0)
    .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))
    .slice(0, limit);
}

/** 일자별 합계 추이 (스파크라인용) */
export function interestSeries(key: TasteKey): number[] {
  return SERIES.find((s) => s.key === key)?.daily ?? [];
}

export const INTEREST_DAYS = MARKET_INTEREST_META.days;
