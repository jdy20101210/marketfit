import { ReasonsRequestSchema } from "@/lib/api/schemas";
import { handle, ok, rateLimitClient, readJson } from "@/lib/http";
import { generateReasons } from "@/lib/services/recommendationService";

export const maxDuration = 60;

/** 계산된 상위 추천에 대한 자연어 이유 (Gemini, 실패 시 템플릿 유지) — 순위·점수는 바꾸지 않습니다. */
export const POST = handle(async (request: Request) => {
  rateLimitClient(request, "reasons", { perClient: 20, global: 300, windowMs: 10 * 60 * 1000 });
  const body = await readJson(request, ReasonsRequestSchema);
  const result = await generateReasons(body);
  return ok({
    reasons: result.result,
    provider: result.provider,
    model: result.model,
    fallbackReason: result.fallbackReason,
  });
});
