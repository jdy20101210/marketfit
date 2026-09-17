import { getKakaoConfig } from "@/lib/config/integrations";
import { handle, ok } from "@/lib/http";
import { ensureStoreLocations } from "@/lib/providers/map";
import { toStoreDTO } from "@/lib/services/storeDto";
import { getStores } from "@/lib/stores/catalog";

export const maxDuration = 30;

/** 지도용 점포 목록. Kakao REST 키가 있으면 비어 있는 좌표를 서버에서 한 번 채웁니다. */
export const GET = handle(async () => {
  const geocode = await ensureStoreLocations();
  const [stores, kakao] = await Promise.all([getStores(), getKakaoConfig()]);
  return ok({
    mapMode: kakao.jsKey ? "kakao" : "mock",
    geocodingMode: kakao.restKey ? "kakao" : "mock",
    geocodeReport: geocode,
    stores: stores.map(toStoreDTO),
  });
});
