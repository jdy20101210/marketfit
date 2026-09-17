/**
 * seed JSON → 점포 추천 feature JSON / 초기 위치 JSON 생성
 * 실행: npm run data:features
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildStoreFeatures } from "../lib/stores/featureRules";
import type { StoreLocation, StoreSeed } from "../lib/stores/types";

const root = process.cwd();
const seedPath = path.join(root, "data/stores/stores.seed.json");
const featuresPath = path.join(root, "data/stores/store-features.json");
const locationsPath = path.join(root, "data/stores/store-locations.json");

const seed = JSON.parse(readFileSync(seedPath, "utf8")) as { stores: StoreSeed[] };
const features = seed.stores.map(buildStoreFeatures);
writeFileSync(
  featuresPath,
  JSON.stringify(
    {
      meta: {
        generatedBy: "scripts/build-features.ts (lib/stores/featureRules.ts 규칙)",
        notice: "점포 유형·비고 기반 추정치입니다. 관리자 화면에서 확인할 수 있으며, DB 사용 시 store_features 테이블 값이 우선합니다.",
      },
      features,
    },
    null,
    2,
  ) + "\n",
);
console.log(`✓ feature ${features.length}개 → ${path.relative(root, featuresPath)}`);

// 위치 파일: 이미 지오코딩된 좌표가 있으면 유지하고, 없으면 unknown으로 초기화합니다(가짜 좌표 금지).
const existing: StoreLocation[] = existsSync(locationsPath)
  ? (JSON.parse(readFileSync(locationsPath, "utf8")).locations as StoreLocation[])
  : [];
const locations: StoreLocation[] = seed.stores.map((s) => {
  const prev = existing.find((l) => l.storeId === s.id && l.query === s.geocodeQuery);
  if (prev && prev.lat !== null) return prev;
  return {
    storeId: s.id,
    lat: null,
    lng: null,
    accuracy: "unknown",
    note: s.geocodeQuery ? "Kakao Local API로 좌표 확인 전" : "주소 정보가 없어 좌표를 확인할 수 없음",
    query: s.geocodeQuery,
    provider: null,
    geocodedAt: null,
  };
});
writeFileSync(
  locationsPath,
  JSON.stringify(
    {
      meta: {
        notice:
          "좌표는 Kakao Local API(서버)로만 채웁니다. `npm run geocode` 또는 관리자 화면의 [좌표 갱신]을 사용하세요. 확인되지 않은 좌표는 null로 둡니다.",
      },
      locations,
    },
    null,
    2,
  ) + "\n",
);
console.log(`✓ 위치 ${locations.length}개 → ${path.relative(root, locationsPath)} (좌표 확인: ${locations.filter((l) => l.lat !== null).length}개)`);
