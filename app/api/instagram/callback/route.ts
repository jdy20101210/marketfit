import { NextResponse, type NextRequest } from "next/server";
import { getInstagramConfig, resolveRedirectUri } from "@/lib/config/integrations";
import { getRequestOrigin, handle } from "@/lib/http";
import { RealInstagramDataProvider } from "@/lib/providers/instagram";
import { InstagramApiError } from "@/lib/providers/instagram/instagramApi";
import { consumeOAuthState, ensureUserId, writeInstagramCookie } from "@/lib/security/session";

export const maxDuration = 30;

/** Instagram 로그인 콜백: code → token 교환 → 본인 프로필·게시물 캡션 → 관심 신호 저장 */
export const GET = handle(async (request: NextRequest) => {
  const origin = getRequestOrigin(request);
  const params = request.nextUrl.searchParams;
  const saved = await consumeOAuthState();
  const next = saved?.next ?? "/onboarding";

  const back = (status: string, reason?: string) => {
    const url = new URL(next, origin);
    url.searchParams.set("instagram", status);
    if (reason) url.searchParams.set("reason", reason.slice(0, 120));
    return NextResponse.redirect(url);
  };

  if (params.get("error")) {
    return back("denied", params.get("error_reason") ?? params.get("error") ?? undefined);
  }
  const code = params.get("code");
  if (!saved || !params.get("state") || saved.state !== params.get("state")) {
    return back("error", "로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해주세요.");
  }
  if (!code) return back("error", "인증 코드가 없습니다.");

  const config = await getInstagramConfig();
  if (!config) return back("demo");

  const userId = await ensureUserId();
  const provider = new RealInstagramDataProvider(config);
  try {
    const result = await provider.completeAuthorization(userId, code, resolveRedirectUri(config.redirectUri, origin));
    await writeInstagramCookie({ ...result.signals, externalUserId: result.externalUserId, uid: userId });
    return back("connected");
  } catch (err) {
    if (err instanceof InstagramApiError) {
      console.warn("[instagram] 연결 실패:", err.status, err.code, err.message);
      const hint =
        err.status === 400 && /redirect/i.test(err.message)
          ? "리디렉션 URI가 Meta 앱 설정과 일치하지 않습니다."
          : err.isAuthError
            ? "Instagram 인증에 실패했습니다. 프로페셔널 계정·테스터 등록 여부를 확인해주세요."
            : "Instagram API 호출에 실패했습니다.";
      return back("error", hint);
    }
    console.error("[instagram] 콜백 처리 오류:", err);
    return back("error", "Instagram 연결 중 오류가 발생했습니다.");
  }
});
