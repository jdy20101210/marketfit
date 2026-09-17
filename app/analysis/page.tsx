import type { Metadata } from "next";
import { connection } from "next/server";
import { AnalysisResultClient } from "@/components/analysis/AnalysisResultClient";

export const metadata: Metadata = { title: "취향 분석 결과" };

export default async function AnalysisPage() {
  await connection();
  return <AnalysisResultClient />;
}
