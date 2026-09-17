import "server-only";
import seedJson from "@/data/stores/stores.seed.json";
import featuresJson from "@/data/stores/store-features.json";
import locationsJson from "@/data/stores/store-locations.json";
import { getRepository } from "@/lib/db";
import { toVector } from "@/lib/recommendation/dimensions";
import { toMarketFeatures, type Store, type StoreFeatures, type StoreLocation, type StoreSeed } from "./types";

export const SEED_META = seedJson.meta;

const seedStores = seedJson.stores as StoreSeed[];
const seedFeatures = (featuresJson.features as unknown as StoreFeatures[]).map((f) => ({ ...f, taste: toVector(f.taste) }));
const seedLocations = locationsJson.locations as StoreLocation[];

function unknownLocation(store: StoreSeed): StoreLocation {
  return {
    storeId: store.id,
    lat: null,
    lng: null,
    accuracy: "unknown",
    note: store.geocodeQuery ? "좌표 확인 전" : "주소 정보가 없어 좌표를 확인할 수 없음",
    query: store.geocodeQuery,
    provider: null,
    geocodedAt: null,
  };
}

const CACHE_MS = 30_000;
let cache: { at: number; stores: Store[]; source: "seed" | "database" } | null = null;

export function invalidateStoreCache() {
  cache = null;
}

/** 점포 목록: DB에 seed가 있으면 DB 값, 없으면 엑셀 변환 JSON을 사용합니다. */
export async function getStores(): Promise<Store[]> {
  return (await getStoreCatalog()).stores;
}

export async function getStoreCatalog(): Promise<{ stores: Store[]; source: "seed" | "database" }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  let overrides: Awaited<ReturnType<ReturnType<typeof getRepository>["loadStoreOverrides"]>> = {
    stores: null,
    features: null,
    locations: [],
    descriptions: [],
  };
  try {
    overrides = await getRepository().loadStoreOverrides();
  } catch (err) {
    console.error("[stores] DB 점포 데이터를 불러오지 못해 seed 데이터를 사용합니다:", err);
  }
  const baseStores = overrides.stores ?? seedStores;
  const features = overrides.features ?? seedFeatures;
  const stores: Store[] = baseStores
    .map((s) => {
      const seedFeature = seedFeatures.find((x) => x.storeId === s.id);
      const found = features.find((x) => x.storeId === s.id) ?? seedFeature;
      if (!found) return null;
      const f: StoreFeatures = { ...found, market: toMarketFeatures(found.market, seedFeature?.market) };
      // 저장된 조회 결과(좌표 또는 '주소를 찾지 못함')는 현재 주소와 같을 때만 사용합니다.
      const loc =
        overrides.locations.find((l) => l.storeId === s.id && l.query === s.geocodeQuery && (l.lat !== null || l.geocodedAt !== null)) ??
        seedLocations.find((l) => l.storeId === s.id && l.lat !== null && l.query === s.geocodeQuery) ??
        unknownLocation(s);
      const description = overrides.descriptions.find((d) => d.storeId === s.id) ?? null;
      return { ...s, features: f, location: loc, description } satisfies Store;
    })
    .filter((s): s is Store => s !== null);
  cache = { at: Date.now(), stores, source: overrides.stores ? "database" : "seed" };
  return cache;
}

export async function getStoreById(id: string): Promise<Store | null> {
  const stores = await getStores();
  return stores.find((s) => s.id === id) ?? null;
}

/** 초기 seed(엑셀 변환 JSON) 기준 목록 — DB seed 스크립트에서 사용 */
export function getSeedStores(): Store[] {
  return seedStores.map((s) => ({
    ...s,
    features: seedFeatures.find((f) => f.storeId === s.id)!,
    location: seedLocations.find((l) => l.storeId === s.id && l.query === s.geocodeQuery) ?? unknownLocation(s),
    description: null,
  }));
}
