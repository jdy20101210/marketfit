import { getRepository } from "@/lib/db";
import { assertSameOrigin, handle, ok } from "@/lib/http";
import { clearInstagramCookie, readUserId } from "@/lib/security/session";

/** 연결 해제: 저장된 토큰과 관심 신호를 삭제합니다. */
export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const userId = await readUserId();
  if (userId) {
    const repo = getRepository();
    const connection = await repo.getSocialConnection(userId, "instagram");
    if (connection) {
      await repo.upsertSocialConnection({
        ...connection,
        status: "disconnected",
        signals: null,
        tokenEncrypted: null,
        tokenExpiresAt: null,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  await clearInstagramCookie();
  return ok({ disconnected: true });
});
