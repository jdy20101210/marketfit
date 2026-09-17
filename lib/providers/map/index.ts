import "server-only";
import { getKakaoConfig } from "@/lib/config/integrations";
import { getRepository } from "@/lib/db";
import { getStores, invalidateStoreCache } from "@/lib/stores/catalog";
import type { Store, StoreLocation } from "@/lib/stores/types";
import { KakaoMapProvider } from "./KakaoMapProvider";
import type { MapProvider } from "./MapProvider";
import { MockMapProvider } from "./MockMapProvider";

export type { MapProvider, GeocodeResult } from "./MapProvider";

export async function getMapProvider(): Promise<MapProvider> {
  const { restKey } = await getKakaoConfig();
  return restKey ? new KakaoMapProvider(restKey) : new MockMapProvider();
}

export interface GeocodeReport {
  mode: "real" | "mock";
  queried: number;
  located: number;
  unknown: number;
  errors: string[];
}

const globalForGeo = globalThis as unknown as { __marketfitGeocodeAttempt?: number };
const LAZY_RETRY_MS = 10 * 60 * 1000;

function locationFor(store: Store, result: Awaited<ReturnType<MapProvider["geocodeAddress"]>>, now: string): StoreLocation {
  if (!result) {
    return {
      storeId: store.id,
      lat: null,
      lng: null,
      accuracy: "unknown",
      note: "Kakao Local에서 주소를 찾지 못해 위치를 표시하지 않습니다.",
      query: store.geocodeQuery,
      provider: "kakao-local",
      geocodedAt: now,
    };
  }
  let accuracy = result.accuracy;
  let note = `Kakao Local 주소 검색 결과(${result.matchedAddress})`;
  if (store.locationBasis === "near_road_address") {
    accuracy = "approximate";
    note = `${store.addressDetail ?? "인근"} — 건물 주소 기준 근사 위치`;
  } else if (store.locationBasis === "market_zone") {
    accuracy = "approximate";
    note = `${store.zone ?? store.addressRaw} — 구역명만 있어 중앙시장 대표 주소(대전로 783) 기준 대략적 위치`;
  } else if (store.locationBasis === "road_only") {
    accuracy = "approximate";
    note = `${store.geocodeQuery} 도로 기준 대략적 위치 (건물 번호 없음)`;
  } else if (store.locationBasis === "parcel_address" && accuracy === "exact") {
    note = `Kakao Local 지번 주소 검색 결과(${result.matchedAddress})`;
  }
  return {
    storeId: store.id,
    lat: result.lat,
    lng: result.lng,
    accuracy,
    note,
    query: store.geocodeQuery,
    provider: "kakao-local",
    geocodedAt: now,
  };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * 주소가 있는 점포의 좌표를 Kakao Local API로 조회해 저장합니다.
 * - 기본: 좌표가 없는 점포 (이전에 '주소 없음'으로 확인된 곳도 다시 조회)
 * - onlyNew: 아직 한 번도 조회하지 않은 점포만
 * - force: 전체 다시 조회
 */
export async function geocodeStores(options: { force?: boolean; onlyNew?: boolean } = {}): Promise<GeocodeReport> {
  const provider = await getMapProvider();
  const stores = await getStores();
  const targets = stores.filter(
    (s) => s.geocodeQuery && (options.force || (s.location.lat === null && (!options.onlyNew || s.location.geocodedAt === null))),
  );
  const report: GeocodeReport = { mode: provider.mode, queried: 0, located: 0, unknown: 0, errors: [] };
  if (provider.mode === "mock" || targets.length === 0) return report;

  const queries = [...new Set(targets.map((s) => s.geocodeQuery!))];
  const results = new Map<string, Awaited<ReturnType<MapProvider["geocodeAddress"]>>>();
  await mapWithConcurrency(queries, 3, async (q) => {
    try {
      results.set(q, await provider.geocodeAddress(q));
      report.queried += 1;
    } catch (err) {
      report.errors.push(`${q}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  const now = new Date().toISOString();
  const locations: StoreLocation[] = [];
  for (const store of targets) {
    if (!results.has(store.geocodeQuery!)) continue;
    const loc = locationFor(store, results.get(store.geocodeQuery!) ?? null, now);
    locations.push(loc);
    if (loc.lat !== null) report.located += 1;
    else report.unknown += 1;
  }
  if (locations.length) {
    await getRepository().saveStoreLocations(locations);
    invalidateStoreCache();
  }
  return report;
}

let lazyRun: Promise<GeocodeReport | null> | null = null;

/**
 * 지도 조회 시 아직 조회하지 않은 점포의 좌표를 한 번 채웁니다(인스턴스당 10분 간격, 동시 실행 1회).
 * '주소를 찾지 못함'으로 확인된 점포는 다시 조회하지 않습니다(관리자 화면에서 수동 재조회).
 */
export async function ensureStoreLocations(): Promise<GeocodeReport | null> {
  if (lazyRun) return lazyRun;
  const last = globalForGeo.__marketfitGeocodeAttempt ?? 0;
  if (Date.now() - last < LAZY_RETRY_MS) return null;
  const provider = await getMapProvider();
  if (provider.mode === "mock") return null;
  const stores = await getStores();
  if (!stores.some((s) => s.geocodeQuery && s.location.lat === null && s.location.geocodedAt === null)) return null;
  globalForGeo.__marketfitGeocodeAttempt = Date.now();
  lazyRun = geocodeStores({ onlyNew: true })
    .catch((err) => {
      console.error("[map] 자동 좌표 조회 실패:", err);
      return null;
    })
    .finally(() => {
      lazyRun = null;
    });
  return lazyRun;
}
