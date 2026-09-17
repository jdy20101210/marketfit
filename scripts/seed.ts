/**
 * Supabase에 40개 점포(stores)와 추천 feature(store_features)를 넣습니다.
 * 실행: npm run seed   (사전 준비: .env.local에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY / 마이그레이션 SQL 실행)
 */
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { getRepository, isSupabaseConfigured } = await import("../lib/db");
  const { getSeedStores } = await import("../lib/stores/catalog");

  const stores = getSeedStores();
  console.log(`점포 seed 데이터 ${stores.length}개 (엑셀 원본 변환)`);

  if (!isSupabaseConfigured()) {
    console.log("Supabase 환경변수가 없어 로컬 모드로 동작합니다. data/stores/*.json이 곧 seed 데이터이므로 추가 작업이 필요 없습니다.");
    console.log("Supabase를 쓰려면 .env.local에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 설정한 뒤 다시 실행하세요.");
    return;
  }
  const result = await getRepository().seedStores(stores);
  console.log(`✓ Supabase 반영 완료: stores ${result.stores}개, store_features ${result.features}개`);
}

main().catch((err) => {
  console.error("✗ seed 실패:", err instanceof Error ? err.message : err);
  console.error("  supabase/migrations/0001_init.sql을 먼저 실행했는지 확인하세요.");
  process.exit(1);
});
