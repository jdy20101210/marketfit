import { InteractionRequestSchema } from "@/lib/api/schemas";
import { getRepository } from "@/lib/db";
import { fail, handle, ok, rateLimitClient, readJson } from "@/lib/http";
import { updateTasteVector } from "@/lib/recommendation/feedback";
import { ensureUserId } from "@/lib/security/session";
import { getStoreById } from "@/lib/stores/catalog";

/** 사용자 행동 기록 (view/like/bookmark/dismiss/visit) + 간단한 취향 weight update (서버에도 저장) */
export const POST = handle(async (request: Request) => {
  rateLimitClient(request, "interactions", { perClient: 120, global: 3000, windowMs: 10 * 60 * 1000 });
  const body = await readJson(request, InteractionRequestSchema);
  const store = await getStoreById(body.storeId);
  if (!store) return fail(404, "not_found", "점포를 찾을 수 없습니다.");

  const userId = await ensureUserId();
  await getRepository().addInteraction({
    userId,
    storeId: store.id,
    type: body.type,
    active: body.type === "view" ? true : body.active,
    createdAt: new Date().toISOString(),
  });

  if (!body.active || body.type === "view") return ok({ recorded: true, taste: null });

  // 간단한 취향 weight update: 브라우저의 현재 취향(없으면 서버에 저장된 최신 취향)을 점포 성향 쪽으로 조금 이동
  const repo = getRepository();
  const latest = (await repo.latestPreferences([userId]).catch(() => []))[0] ?? null;
  const base = body.taste ?? latest?.tasteVector ?? null;
  if (!base) return ok({ recorded: true, taste: null });
  const taste = updateTasteVector(base, store.features.taste, body.type);
  if (latest) {
    // 갱신된 취향을 서버 기록에도 남깁니다 (상인 인사이트 집계·다음 방문 시 활용).
    await repo
      .savePreference({ ...latest, tasteVector: taste, createdAt: new Date().toISOString() })
      .catch((err) => console.warn("[interactions] 취향 업데이트 저장 실패:", err));
  }
  return ok({ recorded: true, taste });
});
