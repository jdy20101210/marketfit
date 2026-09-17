import type { Metadata } from "next";
import { connection } from "next/server";
import { OnboardingClient } from "@/components/onboarding/OnboardingClient";
import { getPublicModes } from "@/lib/config/integrations";

export const metadata: Metadata = { title: "취향 분석 시작" };

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  await connection();
  const params = await props.searchParams;
  const pick = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v : null;
  };
  const modeParam = pick("mode");
  const mode = modeParam === "instagram" || modeParam === "manual" || modeParam === "both" ? modeParam : null;
  const modes = await getPublicModes();
  return (
    <OnboardingClient
      initialMode={mode}
      instagramMode={modes.instagram}
      aiMode={modes.ai}
      callbackStatus={pick("instagram")}
      callbackReason={pick("reason")}
    />
  );
}
