import { handle, ok } from "@/lib/http";
import { toStoreDTO } from "@/lib/services/storeDto";
import { getStoreCatalog, SEED_META } from "@/lib/stores/catalog";

export const GET = handle(async () => {
  const catalog = await getStoreCatalog();
  return ok({
    source: catalog.source,
    meta: SEED_META,
    stores: catalog.stores.map(toStoreDTO),
  });
});
