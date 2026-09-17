import { ActivateAnalysisRequestSchema } from "@/lib/api/schemas";
import { getRepository } from "@/lib/db";
import { assertSameOrigin, fail, handle, ok, rateLimitClient, readJson } from "@/lib/http";
import { readUserId } from "@/lib/security/session";

/** 서버에 저장된 내 분석 기록 (버전 목록, 개인 식별 정보 없음) */
export const GET = handle(async (request: Request) => {
  rateLimitClient(request, "profile-history", { perClient: 60, global: 1500, windowMs: 10 * 60 * 1000 });
  const userId = await readUserId();
  if (!userId) return ok({ history: [] });
  const history = await getRepository().listPreferenceHistory(userId, 20);
  return ok({
    history: history.map((p) => ({
      id: p.id,
      analysisVersion: p.analysisVersion,
      inputMode: p.inputMode,
      personaLabel: p.personaLabel,
      summary: p.summary,
      isActive: p.isActive,
      createdAt: p.createdAt,
    })),
  });
});

/** 이전 분석 결과를 다시 활성 프로필로 지정 */
export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  rateLimitClient(request, "profile-activate", { perClient: 30, global: 600, windowMs: 10 * 60 * 1000 });
  const { analysisId } = await readJson(request, ActivateAnalysisRequestSchema);
  const userId = await readUserId();
  if (!userId) return ok({ activated: false, reason: "no_user" });
  const activated = await getRepository()
    .activatePreference(userId, analysisId)
    .catch((err) => {
      console.warn("[profile] 활성 분석 변경 실패:", err);
      return false;
    });
  if (!activated) return fail(404, "not_found", "서버에서 해당 분석 결과를 찾지 못했어요. 이 브라우저에 저장된 결과로 계속 사용할 수 있어요.");
  return ok({ activated: true });
});
