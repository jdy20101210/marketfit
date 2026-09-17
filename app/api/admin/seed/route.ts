import { isSupabaseConfigured, getRepository } from "@/lib/db";
import { fail, handle, ok } from "@/lib/http";
import { requireAdmin } from "@/lib/security/adminGuard";
import { getSeedStores, getStores, invalidateStoreCache } from "@/lib/stores/catalog";

export const maxDuration = 60;

/** 엑셀 기반 40개 점포를 Supabase stores/store_features에 반영 (npm run seed와 동일) */
export const POST = handle(async (request: Request) => {
  await requireAdmin(request, { mutating: true });
  if (!isSupabaseConfigured()) {
    return fail(400, "supabase_not_configured", "SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  }
  const current = await getStores();
  const seed = getSeedStores().map((s) => {
    const existing = current.find((c) => c.id === s.id);
    return existing && existing.location.lat !== null ? { ...s, location: existing.location } : s;
  });
  try {
    const result = await getRepository().seedStores(seed);
    invalidateStoreCache();
    return ok(result);
  } catch (err) {
    return fail(
      500,
      "seed_failed",
      `Seed 실패: ${err instanceof Error ? err.message : String(err)} — supabase/migrations/0001_init.sql을 먼저 실행했는지 확인하세요.`,
    );
  }
});
