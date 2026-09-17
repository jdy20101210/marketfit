import "server-only";

/**
 * Instagram API with Instagram Login — HTTP adapter (공식 엔드포인트만 사용)
 * 문서: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
 *
 * 필요 조건 (Meta 설정)
 * - Instagram 프로페셔널 계정(비즈니스/크리에이터)만 로그인·조회할 수 있습니다.
 * - 앱이 '개발' 모드이면 앱 역할(Instagram 테스터)에 등록된 계정만 연결됩니다.
 * - 일반 공개 운영은 instagram_business_basic 권한의 앱 검수(Advanced Access)가 필요합니다.
 *
 * 보안: access token이 담긴 URL은 로그로 남기지 않습니다.
 */

export const INSTAGRAM_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const INSTAGRAM_GRAPH_BASE = "https://graph.instagram.com";

const TIMEOUT_MS = 12_000;

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | number | null,
    readonly isAuthError: boolean,
  ) {
    super(message);
  }
}

async function parseError(res: Response): Promise<InstagramApiError> {
  let message = `Instagram API 오류 (HTTP ${res.status})`;
  let code: string | number | null = null;
  try {
    const body = (await res.json()) as {
      error?: { message?: string; code?: number; type?: string };
      error_message?: string;
      error_type?: string;
      code?: number;
    };
    if (body.error?.message) {
      message = body.error.message;
      code = body.error.code ?? body.error.type ?? null;
    } else if (body.error_message) {
      message = body.error_message;
      code = body.error_type ?? body.code ?? null;
    }
  } catch {
    // 본문이 JSON이 아닌 경우 기본 메시지 사용
  }
  const isAuthError = res.status === 401 || code === 190 || code === "OAuthException";
  return new InstagramApiError(message, res.status, code, isAuthError);
}

function graphUrl(path: string, version: string | null): URL {
  const prefix = version ? `/${version}` : "";
  return new URL(`${INSTAGRAM_GRAPH_BASE}${prefix}${path}`);
}

export function buildAuthorizeUrl(params: { appId: string; redirectUri: string; state: string; scopes: readonly string[] }): string {
  const url = new URL(INSTAGRAM_AUTHORIZE_URL);
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.scopes.join(","));
  url.searchParams.set("state", params.state);
  url.searchParams.set("enable_fb_login", "0");
  return url.toString();
}

/** 1단계: authorization code → 단기 토큰 (1시간) */
export async function exchangeCodeForToken(params: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ accessToken: string; userId: string | null; permissions: string[] }> {
  const body = new URLSearchParams({
    client_id: params.appId,
    client_secret: params.appSecret,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
    // 문서 안내: 리디렉션 URL 끝의 '#_'는 code의 일부가 아니므로 제거
    code: params.code.replace(/#_$/, ""),
  });
  const res = await fetch(INSTAGRAM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw await parseError(res);
  const text = await res.text();
  // user_id는 53비트를 넘을 수 있어 JSON 숫자 변환 전에 문자열로 추출합니다.
  const userIdMatch = text.match(/"user_id"\s*:\s*"?(\d+)"?/);
  const json = JSON.parse(text) as
    | { access_token?: string; permissions?: string[] | string; data?: { access_token?: string; permissions?: string[] | string }[] }
    | undefined;
  const entry = json?.data?.[0] ?? json;
  const accessToken = entry?.access_token;
  if (!accessToken) throw new InstagramApiError("토큰 응답에 access_token이 없습니다.", 502, null, false);
  const permissions = Array.isArray(entry?.permissions)
    ? entry.permissions
    : typeof entry?.permissions === "string"
      ? entry.permissions.split(",").map((p) => p.trim())
      : [];
  return { accessToken, userId: userIdMatch?.[1] ?? null, permissions };
}

/** 2단계: 단기 토큰 → 장기 토큰 (60일) */
export async function exchangeForLongLivedToken(params: { appSecret: string; accessToken: string }) {
  const url = graphUrl("/access_token", null);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", params.appSecret);
  url.searchParams.set("access_token", params.accessToken);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw await parseError(res);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? null };
}

/** 장기 토큰 갱신 (발급 후 24시간 이상 지난 유효 토큰만 가능) */
export async function refreshLongLivedToken(accessToken: string) {
  const url = graphUrl("/refresh_access_token", null);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw await parseError(res);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? null };
}

export interface InstagramProfile {
  id: string;
  userId: string | null;
  username: string | null;
  accountType: string | null;
  mediaCount: number | null;
}

export async function fetchProfile(params: { accessToken: string; version: string | null }): Promise<InstagramProfile> {
  const url = graphUrl("/me", params.version);
  url.searchParams.set("fields", "id,user_id,username,account_type,media_count");
  url.searchParams.set("access_token", params.accessToken);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw await parseError(res);
  const text = await res.text();
  const json = JSON.parse(text) as { id?: string | number; username?: string; account_type?: string; media_count?: number };
  const idMatch = text.match(/"id"\s*:\s*"?(\d+)"?/);
  const userIdMatch = text.match(/"user_id"\s*:\s*"?(\d+)"?/);
  return {
    id: idMatch?.[1] ?? String(json.id ?? ""),
    userId: userIdMatch?.[1] ?? null,
    username: json.username ?? null,
    accountType: json.account_type ?? null,
    mediaCount: typeof json.media_count === "number" ? json.media_count : null,
  };
}

export interface InstagramMedia {
  id: string;
  caption: string | null;
  mediaType: string | null;
  timestamp: string | null;
}

/** 본인 계정의 최근 게시물 캡션만 조회합니다 (좋아요·팔로우 등 비공개 활동은 조회하지 않음). */
export async function fetchRecentMedia(params: { accessToken: string; version: string | null; limit?: number }): Promise<InstagramMedia[]> {
  const url = graphUrl("/me/media", params.version);
  url.searchParams.set("fields", "id,caption,media_type,timestamp");
  url.searchParams.set("limit", String(Math.min(params.limit ?? 30, 50)));
  url.searchParams.set("access_token", params.accessToken);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw await parseError(res);
  const json = (await res.json()) as {
    data?: { id: string; caption?: string; media_type?: string; timestamp?: string }[];
  };
  return (json.data ?? []).map((m) => ({
    id: String(m.id),
    caption: m.caption ?? null,
    mediaType: m.media_type ?? null,
    timestamp: m.timestamp ?? null,
  }));
}
