import { AnalyzeRequestSchema } from "@/lib/api/schemas";
import { handle, ok, rateLimitClient, readJson } from "@/lib/http";
import { ensureUserId } from "@/lib/security/session";
import { runPreferenceAnalysis } from "@/lib/services/preferenceService";

export const maxDuration = 60;

/**
 * 취향 분석: AI 인터뷰 대화 / 빠른 키워드 / 둘 다 → UserPreferenceProfile
 * 매번 새 분석 버전(analysisVersion)으로 저장하고, 성공한 결과를 활성 프로필로 지정합니다.
 */
export const POST = handle(async (request: Request) => {
  rateLimitClient(request, "analyze", { perClient: 20, global: 300, windowMs: 10 * 60 * 1000 });
  const body = await readJson(request, AnalyzeRequestSchema);
  const userId = await ensureUserId();
  const analysis = await runPreferenceAnalysis({
    userId,
    mode: body.mode,
    messages: body.messages,
    keywords: body.keywords,
    previousVersion: body.previousVersion,
  });
  return ok(analysis);
});
