import type { Metadata } from "next";
import { after, connection } from "next/server";
import { MarketMapClient } from "@/components/map/MarketMapClient";
import { getKakaoConfig } from "@/lib/config/integrations";
import { ensureStoreLocations } from "@/lib/providers/map";
import { toStoreDTO } from "@/lib/services/storeDto";
import { getStores } from "@/lib/stores/catalog";

export const metadata: Metadata = { title: "AI 시장 지도" };
export const maxDuration = 30;

export default async function MarketMapPage(props: PageProps<"/market-map">) {
  await connection();
  const params = await props.searchParams;
  // Kakao REST 키가 있으면 비어 있는 좌표를 서버에서 한 번 채웁니다.
  // 최대 2.5초만 기다리고, 더 걸리면 응답 뒤(after)에 마저 저장해 다음 방문부터 반영합니다.
  const geocoding = ensureStoreLocations().catch(() => null);
  const finished = await Promise.race([geocoding.then(() => true), new Promise<boolean>((resolve) => setTimeout(resolve, 2500, false))]);
  if (!finished) after(() => geocoding);
  const [stores, kakao] = await Promise.all([getStores(), getKakaoConfig()]);
  const storeParam = typeof params.store === "string" ? params.store : null;
  return (
    <MarketMapClient
      stores={stores.map(toStoreDTO)}
      kakaoJsKey={kakao.jsKey}
      geocodingMode={kakao.restKey ? "kakao" : "mock"}
      initialStoreId={storeParam}
    />
  );
}
