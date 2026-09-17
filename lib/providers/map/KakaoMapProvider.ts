import "server-only";
import type { GeocodeResult, MapProvider } from "./MapProvider";

const ADDRESS_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/address.json";

export class KakaoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface KakaoAddressDocument {
  address_name: string;
  address_type: "REGION" | "ROAD" | "REGION_ADDR" | "ROAD_ADDR";
  x: string;
  y: string;
  road_address?: { building_name?: string; main_building_no?: string } | null;
}

/**
 * Kakao Local REST API (서버 전용)
 * 문서: https://developers.kakao.com/docs/latest/ko/local/dev-guide#address-coord
 * Authorization: KakaoAK {REST_API_KEY}
 */
export class KakaoMapProvider implements MapProvider {
  readonly mode = "real" as const;

  constructor(private readonly restApiKey: string) {}

  async geocodeAddress(query: string): Promise<GeocodeResult | null> {
    const url = new URL(ADDRESS_SEARCH_URL);
    url.searchParams.set("query", query);
    url.searchParams.set("analyze_type", "exact");
    url.searchParams.set("size", "1");
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${this.restApiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      let message = `Kakao Local API 오류 (HTTP ${res.status})`;
      try {
        const body = (await res.json()) as { message?: string; msg?: string; errorType?: string };
        message = body.message ?? body.msg ?? message;
        if (res.status === 401) message = `인증 실패: REST API 키 또는 [카카오맵] 사용 설정을 확인하세요. (${message})`;
        if (res.status === 403) message = `권한 없음: 카카오맵 활성화/호출 허용 IP 설정을 확인하세요. (${message})`;
      } catch {
        // ignore
      }
      throw new KakaoApiError(message, res.status);
    }
    const body = (await res.json()) as { documents?: KakaoAddressDocument[] };
    const doc = body.documents?.[0];
    if (!doc) return null;
    const lat = Number(doc.y);
    const lng = Number(doc.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // 건물 번호까지 일치한 주소(ROAD_ADDR/REGION_ADDR)만 정확한 좌표로 봅니다.
    const exact = doc.address_type === "ROAD_ADDR" || doc.address_type === "REGION_ADDR";
    return {
      lat,
      lng,
      accuracy: exact ? "exact" : "approximate",
      matchedAddress: doc.address_name,
      addressType: doc.address_type,
    };
  }
}
