import type { Metadata } from "next";
import { connection } from "next/server";
import { DiscoverClient } from "@/components/discover/DiscoverClient";
import { getPublicModes } from "@/lib/config/integrations";

export const metadata: Metadata = {
  title: "취향 분석",
  description: "AI와 대화하거나 키워드를 입력해 대전 중앙시장에서 나와 맞는 점포를 찾아보세요.",
};

export default async function DiscoverPage(props: PageProps<"/discover">) {
  await connection();
  const [params, modes] = await Promise.all([props.searchParams, getPublicModes()]);
  const raw = typeof params.mode === "string" ? params.mode : null;
  const initialTab = raw === "chat" || raw === "keywords" ? raw : null;
  return <DiscoverClient initialTab={initialTab} aiMode={modes.ai} />;
}
