import { z } from "zod";
import { assertSameOrigin, fail, handle, ok, rateLimitClient, readJson } from "@/lib/http";
import { checkAdminPassword, getAdminMode, startAdminSession } from "@/lib/security/session";

const Body = z.object({ password: z.string().min(1).max(200) });

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  rateLimitClient(request, "admin-login", { perClient: 8, global: 20, windowMs: 10 * 60 * 1000 });
  const mode = getAdminMode();
  if (mode === "dev-open") return ok({ loggedIn: true, mode });
  if (mode === "locked") return fail(403, "admin_locked", "ADMIN_PASSWORD 환경변수를 먼저 설정해주세요.");
  const { password } = await readJson(request, Body);
  if (!checkAdminPassword(password)) return fail(401, "invalid_password", "비밀번호가 올바르지 않습니다.");
  await startAdminSession();
  return ok({ loggedIn: true, mode });
});
