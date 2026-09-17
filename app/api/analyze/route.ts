import { AnalyzeRequestSchema, type ProfileResult } from "@/lib/api/schemas";
import { getRepository } from "@/lib/db";
import { handle, HttpError, ok, rateLimitClient, readJson } from "@/lib/http";
import { analyzeProfileWithFallback } from "@/lib/providers/ai";
import type { ProfileAnalysisInput } from "@/lib/providers/ai/types";
import { ensureUserId } from "@/lib/security/session";
import { currentInstagramSnapshot } from "@/lib/services/instagramSession";

export const maxDuration = 60;

/** 실제 연결 사용자의 관심 신호 (추가 API 호출 없이 저장된 최신 신호 사용) */
async function realSignals(userId: string) {
  const snapshot = await currentInstagramSnapshot();
  if (!snapshot) return null;
  try {
    const connection = await getRepository().getSocialConnection(userId, "instagram");
    if (connection?.status === "connected" && connection.signals) return connection.signals;
  } catch {
    // 저장소 오류 시 쿠키 스냅샷 사용
  }
  return snapshot;
}

/** STEP 3-2: Instagram 관심사 + 직접 입력 상품 → Gemini(또는 Mock) 취향 분석 */
export const POST = handle(async (request: Request) => {
  rateLimitClient(request, "analyze", { perClient: 15, global: 200, windowMs: 10 * 60 * 1000 });
  const body = await readJson(request, AnalyzeRequestSchema);
  const userId = await ensureUserId();

  if (body.items.length > 0 && body.items.length < 3) {
    throw new HttpError(422, "validation_error", "관심 상품은 3~5개를 입력해주세요.");
  }

  let instagram: ProfileAnalysisInput["instagram"] = null;
  if (body.instagram) {
    const real = body.instagram.mode === "real" ? await realSignals(userId) : null;
    instagram = real
      ? { mode: "real", interests: real.interests, captionsSample: real.captionsSample }
      : { mode: "mock", interests: body.instagram.interests, captionsSample: [] };
  }
  if (!instagram && body.items.length === 0) {
    throw new HttpError(422, "validation_error", "Instagram 연결 또는 관심 상품 입력 중 하나는 필요해요.");
  }

  const analysis = await analyzeProfileWithFallback({ instagram, items: body.items });
  const data: ProfileResult = {
    personaLabel: analysis.result.personaLabel,
    summary: analysis.result.summary,
    taste: analysis.result.tasteVector,
    recent: analysis.result.recentVector,
    topCategories: analysis.result.topCategories,
    itemInsights: analysis.result.itemInsights,
    provider: analysis.provider,
    model: analysis.model,
    fallbackReason: analysis.fallbackReason,
  };
  return ok({ ...data, instagramModeUsed: instagram?.mode ?? "none" });
});
