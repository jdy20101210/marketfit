import { NextResponse, type NextRequest } from "next/server";
import { getInstagramConfig, resolveRedirectUri } from "@/lib/config/integrations";
import { getRequestOrigin, handle, rateLimitClient } from "@/lib/http";
import { RealInstagramDataProvider } from "@/lib/providers/instagram";
import { randomToken } from "@/lib/security/crypto";
import { ensureUserId, writeOAuthState } from "@/lib/security/session";
import { sanitizeNextPath } from "@/lib/services/instagramSession";

/**
 * Instagram 로그인 시작 (Instagram API with Instagram Login)
 * Meta 앱 정보가 없으면 데모 모드로 돌아갑니다.
 */
export const GET = handle(async (request: NextRequest) => {
  const origin = getRequestOrigin(request);
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  const back = (status: string) => {
    const url = new URL(next, origin);
    url.searchParams.set("instagram", status);
    return NextResponse.redirect(url);
  };

  const config = await getInstagramConfig();
  if (!config) return back("demo");

  rateLimitClient(request, "ig-auth", { perClient: 20, global: 300, windowMs: 10 * 60 * 1000 });
  await ensureUserId();
  const state = randomToken();
  await writeOAuthState(state, next);

  const provider = new RealInstagramDataProvider(config);
  const redirectUri = resolveRedirectUri(config.redirectUri, origin);
  return NextResponse.redirect(provider.authorizeUrl(redirectUri, state));
});
