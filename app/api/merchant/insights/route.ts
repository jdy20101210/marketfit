import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/http";
import { getMerchantInsights } from "@/lib/services/merchantInsights";
import { getStoreById } from "@/lib/stores/catalog";

/** 상인 인사이트: 익명 집계만 반환 (개인 식별 정보 없음, 최소 인원 미만이면 데모 데이터) */
export const GET = handle(async (request: NextRequest) => {
  const storeId = request.nextUrl.searchParams.get("storeId");
  if (storeId && !(await getStoreById(storeId))) return fail(404, "not_found", "점포를 찾을 수 없습니다.");
  const insights = await getMerchantInsights(storeId || null);
  return ok(insights);
});
