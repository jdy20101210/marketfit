import type { LocationAccuracy } from "@/lib/stores/types";

export interface GeocodeResult {
  lat: number;
  lng: number;
  accuracy: LocationAccuracy;
  matchedAddress: string;
  addressType: string;
}

/**
 * 지도/좌표 공급자 (서버)
 * - KakaoMapProvider: Kakao Local REST API로 주소 → 좌표
 * - MockMapProvider: 좌표를 만들어내지 않음(항상 null) → 위치 미확인으로 표시
 */
export interface MapProvider {
  readonly mode: "real" | "mock";
  geocodeAddress(query: string): Promise<GeocodeResult | null>;
}
