import "server-only";
import { createHash } from "node:crypto";
import { getInstagramConfig } from "@/lib/config/integrations";
import { getRepository } from "@/lib/db";
import { parseMetaSignedRequest, signPayload, verifyPayload } from "@/lib/security/crypto";
import { HttpError } from "@/lib/http";

type SignedRequestPayload = { user_id?: string | number; algorithm?: string; issued_at?: number };

export async function readSignedRequest(request: Request): Promise<string> {
  const config = await getInstagramConfig();
  if (!config) throw new HttpError(400, "not_configured", "Instagram 연동이 설정되지 않았습니다.");
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  if (typeof signed !== "string" || signed.length > 4096) throw new HttpError(400, "invalid_request", "signed_request가 없습니다.");
  const payload = parseMetaSignedRequest<SignedRequestPayload>(signed, config.appSecret);
  if (!payload?.user_id) throw new HttpError(400, "invalid_signature", "서명을 확인할 수 없습니다.");
  // user_id가 큰 숫자일 수 있으므로 원문에서 문자열로 다시 추출
  const raw = Buffer.from(signed.split(".")[1] ?? "", "base64url").toString("utf8");
  return raw.match(/"user_id"\s*:\s*"?(\d+)"?/)?.[1] ?? String(payload.user_id);
}

/** 사용자가 Instagram에서 앱 권한을 제거했을 때 */
export async function handleDeauthorize(externalUserId: string) {
  await getRepository().revokeSocialByExternalId("instagram", externalUserId);
}

/** 데이터 삭제 요청: 연결 정보·토큰과 해당 익명 사용자의 취향/행동 데이터를 삭제합니다. */
export async function handleDataDeletion(externalUserId: string): Promise<string> {
  const repo = getRepository();
  const affected = await repo.revokeSocialByExternalId("instagram", externalUserId);
  for (const userId of affected) await repo.deleteUserData(userId);
  const ref = createHash("sha256").update(externalUserId).digest("base64url").slice(0, 10);
  return signPayload({ ref, at: Date.now(), n: affected.length }, "deletion-code");
}

export function readDeletionCode(code: string | null): { at: number } | null {
  const payload = verifyPayload<{ ref: string; at: number }>(code, "deletion-code");
  return payload ? { at: payload.at } : null;
}
