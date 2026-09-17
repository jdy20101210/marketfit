import type { NextRequest } from "next/server";
import { fail, handle, ok } from "@/lib/http";
import { toStoreDTO } from "@/lib/services/storeDto";
import { getStoreById } from "@/lib/stores/catalog";

export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/stores/[id]">) => {
  const { id } = await ctx.params;
  const store = await getStoreById(id);
  if (!store) return fail(404, "not_found", "점포를 찾을 수 없습니다.");
  return ok({ store: toStoreDTO(store) });
});
