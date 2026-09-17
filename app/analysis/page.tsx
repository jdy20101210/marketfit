import type { Metadata } from "next";
import { connection } from "next/server";
import { AnalysisClient } from "@/components/analysis/AnalysisClient";
import { getPublicModes } from "@/lib/config/integrations";

export const metadata: Metadata = { title: "AI 취향 분석" };

export default async function AnalysisPage() {
  await connection();
  const modes = await getPublicModes();
  return <AnalysisClient aiMode={modes.ai} />;
}
