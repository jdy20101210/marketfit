/**
 * Kakao Local API로 점포 주소 → 좌표를 조회하고 data/stores/store-locations.json에도 기록합니다.
 * DB 없이 배포해도 지도에 좌표가 보이도록, 조회 결과 파일을 커밋해 두면 됩니다.
 *
 * 실행: npm run geocode            (좌표가 비어 있는 점포만)
 *       npm run geocode -- --force (전체 다시 조회)
 * 필요: .env.local의 KAKAO_REST_API_KEY (또는 관리자 화면에서 저장한 값)
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const force = process.argv.includes("--force");
  const { geocodeStores } = await import("../lib/providers/map");
  const { getStores, invalidateStoreCache } = await import("../lib/stores/catalog");

  const report = await geocodeStores({ force });
  if (report.mode === "mock") {
    console.log("KAKAO_REST_API_KEY가 없어 조회하지 않았습니다. .env.local에 키를 넣고 다시 실행하세요.");
    return;
  }
  console.log(`주소 ${report.queried}건 조회 · 좌표 확인 ${report.located}곳 · 미확인 ${report.unknown}곳`);
  for (const e of report.errors) console.warn("  오류:", e);

  invalidateStoreCache();
  const stores = await getStores();
  const file = path.join(process.cwd(), "data/stores/store-locations.json");
  writeFileSync(
    file,
    JSON.stringify(
      {
        meta: {
          notice:
            "좌표는 Kakao Local API(서버)로만 채웁니다. `npm run geocode` 또는 관리자 화면의 [좌표 갱신]을 사용하세요. 확인되지 않은 좌표는 null로 둡니다.",
          updatedAt: new Date().toISOString(),
        },
        locations: stores.map((s) => s.location),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`✓ ${path.relative(process.cwd(), file)} 갱신 (좌표 ${stores.filter((s) => s.location.lat !== null).length}/${stores.length})`);
}

main().catch((err) => {
  console.error("✗ geocode 실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
