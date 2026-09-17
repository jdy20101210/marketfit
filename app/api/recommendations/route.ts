import { RecommendationRequestSchema } from "@/lib/api/schemas";
import { getRepository } from "@/lib/db";
import { handle, ok, rateLimitClient, readJson } from "@/lib/http";
import { readUserId } from "@/lib/security/session";
import { computeRecommendations } from "@/lib/services/recommendationService";

/**
 * 중앙시장 점포 추천 (알고리즘 점수 계산 — AI 미사용)
 * 80점 이상 점포만 점수순으로 순위를 매기고(없으면 75점 이상), 지도와 목록이 같은 순위를 씁니다.
 */
export const POST = handle(async (request: Request) => {
  rateLimitClient(request, "recs", { perClient: 90, global: 2000, windowMs: 10 * 60 * 1000 });
  const body = await readJson(request, RecommendationRequestSchema);
  const userId = await readUserId();
  // 서버에 기록된 이 브라우저 사용자의 행동 이력(좋아요·저장·방문·관심 없음·조회)을 함께 반영합니다.
  const result = await computeRecommendations(body.profile, body.interactions, {
    userId,
    include: body.include,
    analysisVersion: body.analysisVersion ?? null,
  });

  if (userId && !body.include?.length) {
    const now = new Date().toISOString();
    await getRepository()
      .saveRecommendations(
        userId,
        result.items
          .filter((i) => i.rank !== null)
          .slice(0, 20)
          .map((i) => ({
            userId,
            storeId: i.storeId,
            score: i.score,
            rank: i.rank!,
            components: i.components,
            reason: i.reason,
            reasonProvider: i.reasonProvider,
            analysisVersion: result.analysisVersion,
            createdAt: now,
          })),
      )
      .catch((err) => console.warn("[recommendations] 저장 실패:", err));
  }
  return ok(result);
});
