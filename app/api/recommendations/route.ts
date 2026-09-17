import { RecommendationRequestSchema } from "@/lib/api/schemas";
import { getRepository } from "@/lib/db";
import { handle, ok, rateLimitClient, readJson } from "@/lib/http";
import { readUserId } from "@/lib/security/session";
import { computeRecommendations } from "@/lib/services/recommendationService";

/** STEP 3-4: 중앙시장 점포와 매칭 (알고리즘 점수 계산 — AI 미사용) */
export const POST = handle(async (request: Request) => {
  rateLimitClient(request, "recs", { perClient: 60, global: 1500, windowMs: 10 * 60 * 1000 });
  const body = await readJson(request, RecommendationRequestSchema);
  const userId = await readUserId();
  // 서버에 기록된 이 브라우저 사용자의 행동 이력(좋아요·찜·방문·관심 없음·조회)을 함께 반영합니다.
  const { items, interactions } = await computeRecommendations(body.profile, body.interactions, { userId });

  if (userId) {
    const now = new Date().toISOString();
    await getRepository()
      .saveRecommendations(
        userId,
        items
          .filter((i) => i.recommendable)
          .slice(0, 10)
          .map((i, rank) => ({
            userId,
            storeId: i.storeId,
            score: i.score,
            rank: rank + 1,
            components: i.components,
            reason: i.reason,
            reasonProvider: i.reasonProvider,
            createdAt: now,
          })),
      )
      .catch((err) => console.warn("[recommendations] 저장 실패:", err));
  }
  return ok({ items, interactions, generatedAt: new Date().toISOString() });
});
