import { fail, handle, ok, readJson } from "@/lib/http";
import { MerchantPromoRequestSchema } from "@/lib/api/schemas";
import { AI_ENGINE, generateMerchantPromo } from "@/lib/providers/ai";
import { getMerchantInsights } from "@/lib/services/merchantInsights";
import { getStoreById } from "@/lib/stores/catalog";
import { categoryPath } from "@/lib/stores/description";
import { ENTITY_KIND_LABEL } from "@/lib/stores/parse";

export const maxDuration = 30;

/**
 * 상인 AI 홍보 도우미 (집계 데이터 기반)
 * 원본 점포 목록에 있는 품목만 '확인된 정보'로 전달하고, 그 밖의 제안은 아이디어로 표시합니다.
 */
export const POST = handle(async (request: Request) => {
  const { storeId } = await readJson(request, MerchantPromoRequestSchema);
  const store = storeId ? await getStoreById(storeId) : null;
  if (storeId && !store) return fail(404, "not_found", "점포를 찾을 수 없습니다.");

  const insights = await getMerchantInsights(store?.id ?? null);
  const promo = await generateMerchantPromo({
    store: store
      ? {
          id: store.id,
          name: store.name,
          category: categoryPath(store.mainCategory, store.subCategory),
          entityLabel: ENTITY_KIND_LABEL[store.entityKind],
          confirmedItems: store.items,
          locationNote: store.location.note,
          tasteKeys: insights.storeTasteKeys,
        }
      : null,
    period: insights.period,
    // 점포를 고른 경우에는 시장 전체 순위가 아니라 '이 점포와 관련 있는' 관심 분포만 넘깁니다.
    // (귀금속 점포 홍보에 먹거리 아이디어가 끼어드는 문제를 막기 위해)
    interestTop: (store ? insights.storeInterest : insights.interest).slice(0, 3).map((i) => ({ key: i.key, label: i.label, share: i.share })),
    lowConversion: store ? insights.lowConversion.filter((g) => insights.storeTasteKeys.includes(g.key)) : insights.lowConversion,
    metrics: insights.metrics
      ? { interestUsers: insights.metrics.interestUsers, visits: insights.metrics.visits, likes: insights.metrics.likes, saves: insights.metrics.saves }
      : null,
  });

  return ok({ promo, engine: AI_ENGINE.label, isMock: insights.isMock, generatedAt: new Date().toISOString() });
});
