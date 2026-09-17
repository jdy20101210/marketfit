import "server-only";
import { headers } from "next/headers";
import { getEnv } from "@/lib/env";

/** 서버 컴포넌트에서 현재 접속 origin 계산 (APP_URL이 있으면 우선) */
export async function getServerOrigin(): Promise<string> {
  const appUrl = getEnv().APP_URL;
  if (appUrl) return appUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() ?? h.get("host") ?? "localhost:3000";
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}
