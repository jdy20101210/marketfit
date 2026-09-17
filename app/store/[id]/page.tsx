import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { StoreDetailClient } from "@/components/stores/StoreDetailClient";
import { toStoreDTO } from "@/lib/services/storeDto";
import { getStoreById, MOCK_ACTIVITY_META } from "@/lib/stores/catalog";

export async function generateMetadata(props: PageProps<"/store/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const store = await getStoreById(id);
  return store ? { title: `${store.name} (${store.storeType})` } : { title: "점포를 찾을 수 없음" };
}

export default async function StorePage(props: PageProps<"/store/[id]">) {
  await connection();
  const { id } = await props.params;
  const store = await getStoreById(id);
  if (!store) notFound();
  return <StoreDetailClient store={toStoreDTO(store)} mockNotice={MOCK_ACTIVITY_META.notice} />;
}
