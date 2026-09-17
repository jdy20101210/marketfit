import type { GeocodeResult, MapProvider } from "./MapProvider";

/** Kakao 키가 없을 때 사용. 좌표를 임의로 만들지 않고 '위치 미확인'으로 둡니다. */
export class MockMapProvider implements MapProvider {
  readonly mode = "mock" as const;

  async geocodeAddress(_query: string): Promise<GeocodeResult | null> {
    return null;
  }
}
