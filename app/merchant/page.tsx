import type { Metadata } from "next";
import { connection } from "next/server";
import { MerchantClient } from "@/components/merchant/MerchantClient";
import { getMerchantInsights } from "@/lib/services/merchantInsights";
import { getStores } from "@/lib/stores/catalog";
import { categoryPath } from "@/lib/stores/description";

export const metadata: Metadata = { title: "상인 인사이트" };

export default async function MerchantPage() {
  await connection();
  const [stores, initial] = await Promise.all([getStores(), getMerchantInsights(null)]);
  return (
    <MerchantClient
      stores={stores.map((s) => ({ id: s.id, name: s.name, storeType: s.storeType, category: categoryPath(s.mainCategory, s.subCategory) }))}
      initial={initial}
    />
  );
}
