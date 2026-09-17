import type { Metadata } from "next";
import { connection } from "next/server";
import { ProfileClient } from "@/components/profile/ProfileClient";
import { toSummary } from "@/components/stores/StoreBits";
import { toStoreDTO } from "@/lib/services/storeDto";
import { getStores } from "@/lib/stores/catalog";

export const metadata: Metadata = { title: "내 기록" };

export default async function ProfilePage() {
  await connection();
  const stores = (await getStores()).map((s) => toSummary(toStoreDTO(s)));
  return <ProfileClient stores={stores} />;
}
