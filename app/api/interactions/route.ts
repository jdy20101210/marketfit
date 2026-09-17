import { InteractionRequestSchema } from "@/lib/api/schemas";
import { getRepository } from "@/lib/db";
import { fail, handle, ok, rateLimitClient, readJson } from "@/lib/http";
import { updateTasteVector } from "@/lib/recommendation/feedback";
import { ensureUserId } from "@/lib/security/session";
import { getStoreById } from "@/lib/stores/catalog";

/** 사용자 행동 기록 (view/like/bookmark/dismiss/visit) + 간단한 취향 weight update (서버에도 저장) */
export const POST = handle(async (request: Request) => {
  rateLimitClient(request, "interactions", { perClient: 150, global: 4000, windowMs: 10 * 60 * 1000 });
  const body = await readJson(request, InteractionRequestSchema);
  const store = await getStoreById(body.storeId);
  if (!store) return fail(404, "not_found", "점포를 찾을 수 없습니다.");

  const userId = await ensureUserId();
  const repo = getRepository();
  await repo.addInteraction({
    userId,
    storeId: store.id,
    type: body.type,
    active: body.type === "view" ? true : body.active,
    createdAt: new Date().toISOString(),
  });

  if (!body.active || body.type === "view") return ok({ recorded: true, taste: null });

  // 간단한 취향 weight update: 브라우저의 현재 취향(없으면 서버의 활성 분석 결과)을 점포 성향 쪽으로 조금 이동
  const active = (await repo.activePreferences([userId]).catch(() => []))[0] ?? null;
  const base = body.taste ?? active?.tasteVector ?? null;
  if (!base) return ok({ recorded: true, taste: null });
  const taste = updateTasteVector(base, store.features.taste, body.type);
  if (active) {
    // 새 분석 버전을 만들지 않고, 현재 활성 결과의 취향만 갱신합니다.
    await repo.updateActivePreferenceVector(userId, taste).catch((err) => console.warn("[interactions] 취향 업데이트 저장 실패:", err));
  }
  return ok({ recorded: true, taste });
});
