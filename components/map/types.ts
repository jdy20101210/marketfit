import type { RecommendationItem, StoreDTO } from "@/lib/api/schemas";
import type { LocationAccuracy } from "@/lib/stores/types";

export interface ResolvedLocation {
  lat: number;
  lng: number;
  accuracy: LocationAccuracy;
  note: string;
  source: "server" | "browser";
}

export interface MapStoreView {
  store: StoreDTO;
  rec: RecommendationItem;
  location: ResolvedLocation | null;
  rank: number;
}

/** 좌표 조회 전 초기 화면 중심(대전 중앙시장 일대의 근사값). 점포 좌표가 확인되면 그 범위로 이동합니다. */
export const MARKET_CENTER_APPROX = { lat: 36.3285, lng: 127.4305 };
