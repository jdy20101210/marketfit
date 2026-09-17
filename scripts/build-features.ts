/**
 * seed JSON → 점포 추천 feature JSON / 초기 위치 JSON / 프로토타입 가상 집계 JSON 생성
 * 실행: npm run data:features
 *
 * - feature는 원본 소분류·품목 기반 규칙 추정치입니다(원본 정보와 분리 보관).
 * - 가상 집계는 점포 id로 시드를 고정해 항상 같은 값이 나옵니다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mockMarketInterest, mockStoreActivity, MOCK_ACTIVITY_NOTICE } from "../lib/mock/activity";
import { buildStoreFeatures, unmatchedItems } from "../lib/stores/featureRules";
import type { StoreLocation, StoreSeed } from "../lib/stores/types";

const root = process.cwd();
const seedPath = path.join(root, "data/stores/stores.seed.json");
const featuresPath = path.join(root, "data/stores/store-features.json");
const locationsPath = path.join(root, "data/stores/store-locations.json");
const activityPath = path.join(root, "data/mock/store-activity.json");
const interestPath = path.join(root, "data/mock/market-interest.json");

const seed = JSON.parse(readFileSync(seedPath, "utf8")) as { stores: StoreSeed[] };

// 1) 가상 집계 (고정)
const activities = seed.stores.map((s) => mockStoreActivity(s));
const sortedVisits = activities.map((a) => a.visitCount).sort((a, b) => a - b);
const percentile = (v: number) => {
  const below = sortedVisits.filter((x) => x < v).length;
  const equal = sortedVisits.filter((x) => x === v).length;
  return (below + equal / 2) / sortedVisits.length;
};

// 2) 같은 주소(또는 구역) 안의 같은 소분류 점포 수 → 특화 거리 정도
const clusterKey = (s: StoreSeed) => `${s.geocodeQuery ?? s.zone ?? "-"}|${s.subCategory}`;
const clusterSizes = new Map<string, number>();
for (const s of seed.stores) clusterSizes.set(clusterKey(s), (clusterSizes.get(clusterKey(s)) ?? 0) + 1);

const unmatched = new Map<string, number>();
const features = seed.stores.map((s, i) => {
  for (const word of unmatchedItems(s.items)) unmatched.set(word, (unmatched.get(word) ?? 0) + 1);
  return buildStoreFeatures(s, {
    clusterSize: clusterSizes.get(clusterKey(s)) ?? 1,
    activity: activities[i]!,
    visitPercentile: percentile(activities[i]!.visitCount),
  });
});
if (unmatched.size) {
  console.warn(`⚠ 성향 규칙이 없는 품목 ${unmatched.size}개 (소분류 기본값만 사용): ${[...unmatched.keys()].join(", ")}`);
}

writeFileSync(
  featuresPath,
  JSON.stringify(
    {
      meta: {
        generatedBy: "scripts/build-features.ts (lib/stores/featureRules.ts 규칙)",
        notice: "원본 소분류·품목 기반 추정치입니다(inferredBy: rule). 관리자 화면에서 확인할 수 있으며, DB 사용 시 store_features 테이블 값이 우선합니다.",
      },
      features,
    },
    null,
    2,
  ) + "\n",
);
console.log(`✓ feature ${features.length}개 → ${path.relative(root, featuresPath)}`);

mkdirSync(path.dirname(activityPath), { recursive: true });
writeFileSync(activityPath, JSON.stringify({ meta: { notice: MOCK_ACTIVITY_NOTICE, period: "최근 7일 기준 가상값" }, activities }, null, 2) + "\n");
writeFileSync(
  interestPath,
  JSON.stringify({ meta: { notice: MOCK_ACTIVITY_NOTICE, days: 14, order: "마지막 값이 오늘" }, categories: mockMarketInterest(14) }, null, 2) + "\n",
);
console.log(`✓ 가상 집계 → ${path.relative(root, activityPath)}, ${path.relative(root, interestPath)}`);

// 3) 위치 파일: 이미 지오코딩된 좌표가 있으면 유지하고, 없으면 unknown으로 초기화합니다(가짜 좌표 금지).
const existing: StoreLocation[] = existsSync(locationsPath)
  ? (JSON.parse(readFileSync(locationsPath, "utf8")).locations as StoreLocation[])
  : [];
const locations: StoreLocation[] = seed.stores.map((s) => {
  const prev = existing.find((l) => l.storeId === s.id && l.query === s.geocodeQuery);
  if (prev && (prev.lat !== null || prev.geocodedAt !== null)) return prev;
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
          "좌표는 Kakao Local API(서버)로만 채웁니다. `npm run geocode` 또는 관리자 화면의 [좌표 채우기]를 사용하세요. 확인되지 않은 좌표는 null로 둡니다.",
      },
      locations,
    },
    null,
    2,
  ) + "\n",
);
console.log(`✓ 위치 ${locations.length}개 → ${path.relative(root, locationsPath)} (좌표 확인: ${locations.filter((l) => l.lat !== null).length}개)`);
