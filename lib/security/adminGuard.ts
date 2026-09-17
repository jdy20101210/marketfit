import "server-only";
import { assertSameOrigin, HttpError } from "@/lib/http";
import { getAdminMode, isAdmin } from "./session";

/** 관리자 API 공통 검사: 인증 + (변경 요청이면) 동일 출처 */
export async function requireAdmin(request: Request, options: { mutating?: boolean } = {}) {
  if (options.mutating) assertSameOrigin(request);
  const mode = getAdminMode();
  if (mode === "locked") {
    throw new HttpError(403, "admin_locked", "배포 환경에서는 ADMIN_PASSWORD 환경변수를 설정해야 관리자 기능을 사용할 수 있습니다.");
  }
  if (!(await isAdmin())) throw new HttpError(401, "unauthorized", "관리자 로그인이 필요합니다.");
}
