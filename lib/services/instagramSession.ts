import "server-only";
import { getRepository } from "@/lib/db";
import { getInstagramProvider, MockInstagramDataProvider, toInterestData, type InstagramInterestData } from "@/lib/providers/instagram";
import { InstagramNotConnectedError } from "@/lib/providers/instagram/InstagramDataProvider";
import { readInstagramCookie, readUserId, type InstagramCookie } from "@/lib/security/session";

const INTERNAL_BASE = "http://marketfit.internal";

/**
 * OAuth 후 돌아갈 경로를 사이트 내부 경로로만 제한합니다 (open redirect 방지).
 * URL 파서는 탭·개행을 지우므로(`/\t/evil.com` → `//evil.com`) 제어문자와 역슬래시는 먼저 거부하고,
 * 파싱 결과의 origin이 내부 기준 주소와 같은지 한 번 더 확인합니다.
 */
export function sanitizeNextPath(value: string | null | undefined, fallback = "/onboarding"): string {
  if (!value || value.length > 300) return fallback;
  if (/[\u0000-\u001F\u007F\\]/.test(value)) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, INTERNAL_BASE);
    if (url.origin !== INTERNAL_BASE) return fallback;
    const path = `${url.pathname}${url.search}`;
    return path.length <= 200 ? path : fallback;
  } catch {
    return fallback;
  }
}

/** 현재 요청 사용자의 실제 Instagram 연결 스냅샷 (다른 사용자의 쿠키는 무시) */
export async function currentInstagramSnapshot(): Promise<InstagramCookie | null> {
  const [cookie, userId] = await Promise.all([readInstagramCookie(), readUserId()]);
  if (!cookie || !userId || cookie.uid !== userId) return null;
  return cookie;
}

export type InterestResolution = {
  data: InstagramInterestData;
  demoReason: "not_configured" | "not_connected" | "requested" | null;
};

/**
 * 분석에 사용할 Instagram 관심 신호를 결정합니다.
 * 실제 연결이 있으면 Real, 아니면 Mock(데모)로 대체합니다.
 */
export async function resolveInstagramInterests(opts: { personaId?: string | null; preferDemo?: boolean }): Promise<InterestResolution> {
  const provider = await getInstagramProvider();
  if (provider.mode === "real" && !opts.preferDemo) {
    const snapshot = await currentInstagramSnapshot();
    if (snapshot) {
      try {
        return { data: await provider.getProfileData(snapshot.uid), demoReason: null };
      } catch (err) {
        const persistent = getRepository().info().persistent;
        if (!(err instanceof InstagramNotConnectedError && persistent)) {
          // 메모리 저장소(서버리스)이거나 일시적인 API 오류 → 연결 시점 스냅샷 사용
          if (!(err instanceof InstagramNotConnectedError)) {
            console.warn("[instagram] 최신 신호 조회 실패, 연결 시점 스냅샷 사용:", err instanceof Error ? err.message : err);
          }
          return { data: toInterestData(snapshot), demoReason: null };
        }
        // 영구 저장소 기준으로 연결이 해제·만료된 경우 스냅샷을 쓰지 않고 데모로 대체합니다.
      }
    }
  }
  const data = await new MockInstagramDataProvider().getProfileData("demo", { personaId: opts.personaId });
  const demoReason = provider.mode === "mock" ? "not_configured" : opts.preferDemo ? "requested" : "not_connected";
  return { data, demoReason };
}
