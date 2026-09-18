import type { Metadata } from "next";
import { after, connection } from "next/server";
import { RoutePlannerClient } from "@/components/route/RoutePlannerClient";
import { getKakaoConfig } from "@/lib/config/integrations";
import { ensureStoreLocations } from "@/lib/providers/map";
import { toStoreDTO } from "@/lib/services/storeDto";
import { getStores } from "@/lib/stores/catalog";

export const metadata: Metadata = {
  title: "동선 계획",
  description: "추천받은 대전 중앙시장 점포를 몇 곳, 몇 시간 동안 돌지 정하면 걷는 순서와 시간표를 만들어 드려요.",
};
export const maxDuration = 30;

export default async function PlanPage() {
  await connection();
  // 지도와 같은 좌표를 씁니다 — REST 키가 있으면 비어 있는 좌표를 서버에서 채웁니다.
  const geocoding = ensureStoreLocations().catch(() => null);
  const finished = await Promise.race([geocoding.then(() => true), new Promise<boolean>((resolve) => setTimeout(resolve, 2500, false))]);
  if (!finished) after(() => geocoding);
  const [stores, kakao] = await Promise.all([getStores(), getKakaoConfig()]);
  return <RoutePlannerClient stores={stores.map(toStoreDTO)} kakaoJsKey={kakao.jsKey} />;
}
