import { handle, ok } from "@/lib/http";
import { requireAdmin } from "@/lib/security/adminGuard";
import { generateStoreDescriptions } from "@/lib/services/storeDescriptions";

export const maxDuration = 60;

/** (선택 기능) Gemini로 점포 소개 문장 생성·저장 — 키가 없으면 원본 데이터 기반 템플릿 */
export const POST = handle(async (request: Request) => {
  await requireAdmin(request, { mutating: true });
  return ok(await generateStoreDescriptions());
});
