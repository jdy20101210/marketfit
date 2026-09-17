import "server-only";
import { getRepository } from "@/lib/db";
import { describeStoresWithFallback } from "@/lib/providers/ai";
import { getStores, invalidateStoreCache } from "@/lib/stores/catalog";
import { storeDescriptionInput } from "@/lib/stores/description";
import type { StoreDescription } from "@/lib/stores/types";

export interface StoreDescriptionReport {
  provider: "gemini" | "mock";
  model: string | null;
  total: number;
  gemini: number;
  template: number;
  fallbackReason: string | null;
}

/** (관리자) 40개 점포의 소개 문장을 생성해 저장합니다. Gemini가 없거나 실패하면 원본 데이터 기반 템플릿을 저장합니다. */
export async function generateStoreDescriptions(): Promise<StoreDescriptionReport> {
  const stores = await getStores();
  const res = await describeStoresWithFallback(stores.map(storeDescriptionInput));
  const now = new Date().toISOString();
  const records: StoreDescription[] = stores.map((s) => {
    const d = res.result[s.id]!;
    return { storeId: s.id, text: d.text, provider: d.provider, model: d.provider === "gemini" ? res.model : null, updatedAt: now };
  });
  await getRepository().saveStoreDescriptions(records);
  invalidateStoreCache();
  const gemini = records.filter((r) => r.provider === "gemini").length;
  return {
    provider: res.provider,
    model: res.model,
    total: records.length,
    gemini,
    template: records.length - gemini,
    fallbackReason: res.fallbackReason,
  };
}
