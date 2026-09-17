import { getRepository } from "@/lib/db";
import { assertSameOrigin, handle, ok } from "@/lib/http";
import { clearLegacyCookies, clearUserId, readUserId } from "@/lib/security/session";

/** 내 데이터 삭제: 서버에 저장된 취향 분석 기록·행동 기록을 지우고 쿠키를 초기화합니다. */
export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await readUserId();
  if (userId) await getRepository().deleteUserData(userId);
  await clearLegacyCookies();
  await clearUserId();
  return ok({ deleted: Boolean(userId) });
});
