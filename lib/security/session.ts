import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getEnv, isProduction } from "@/lib/env";
import { decryptJson, encryptJson, safeEqual, signPayload, verifyPayload } from "./crypto";
import type { InstagramSignals } from "@/lib/db/types";

export const COOKIE_NAMES = {
  uid: "mf_uid",
  admin: "mf_admin",
  instagram: "mf_ig",
  instagramState: "mf_ig_state",
} as const;

const UID_MAX_AGE = 60 * 60 * 24 * 365;
const ADMIN_MAX_AGE = 60 * 60 * 8;
const IG_MAX_AGE = 60 * 60 * 24 * 30;

/** 배포(HTTPS) 환경에서는 Secure 쿠키. http로 사내망 테스트 시에만 COOKIE_SECURE=false로 끌 수 있습니다. */
function secureCookies(): boolean {
  return isProduction() && getEnv().COOKIE_SECURE !== "false";
}

function baseCookie(maxAge: number) {
  return { httpOnly: true, secure: secureCookies(), sameSite: "lax" as const, path: "/", maxAge };
}

// ---------- 익명 사용자 ----------

type UidPayload = { id: string; iat: number };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readUserId(): Promise<string | null> {
  const store = await cookies();
  const payload = verifyPayload<UidPayload>(store.get(COOKIE_NAMES.uid)?.value, "uid");
  return payload && UUID_RE.test(payload.id) ? payload.id : null;
}

/** Route Handler / Server Action 안에서만 호출하세요 (쿠키를 쓸 수 있는 곳). */
export async function ensureUserId(): Promise<string> {
  const existing = await readUserId();
  if (existing) return existing;
  const id = randomUUID();
  const store = await cookies();
  store.set(COOKIE_NAMES.uid, signPayload({ id, iat: Date.now() } satisfies UidPayload, "uid"), baseCookie(UID_MAX_AGE));
  return id;
}

export async function clearUserId() {
  (await cookies()).delete(COOKIE_NAMES.uid);
}

// ---------- 관리자 ----------

type AdminPayload = { exp: number; fp: string };

function passwordFingerprint(password: string): string {
  return createHash("sha256").update(`marketfit-admin:${password}`).digest("base64url").slice(0, 16);
}

export type AdminMode = "password" | "dev-open" | "locked";

/** 관리자 인증 방식: ADMIN_PASSWORD가 있으면 비밀번호, 없으면 개발 환경만 개방, 배포 환경은 잠금 */
export function getAdminMode(): AdminMode {
  if (getEnv().ADMIN_PASSWORD) return "password";
  return isProduction() ? "locked" : "dev-open";
}

export function checkAdminPassword(input: string): boolean {
  const password = getEnv().ADMIN_PASSWORD;
  if (!password) return false;
  return safeEqual(input, password);
}

export async function startAdminSession() {
  const password = getEnv().ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD가 설정되지 않았습니다.");
  const store = await cookies();
  store.set(
    COOKIE_NAMES.admin,
    signPayload({ exp: Date.now() + ADMIN_MAX_AGE * 1000, fp: passwordFingerprint(password) } satisfies AdminPayload, "admin"),
    { ...baseCookie(ADMIN_MAX_AGE), sameSite: "strict" },
  );
}

export async function endAdminSession() {
  (await cookies()).delete(COOKIE_NAMES.admin);
}

export async function isAdmin(): Promise<boolean> {
  const mode = getAdminMode();
  if (mode === "dev-open") return true;
  if (mode === "locked") return false;
  const password = getEnv().ADMIN_PASSWORD!;
  const payload = verifyPayload<AdminPayload>((await cookies()).get(COOKIE_NAMES.admin)?.value, "admin");
  return Boolean(payload && payload.exp > Date.now() && payload.fp === passwordFingerprint(password));
}

// ---------- Instagram 연결 스냅샷 (암호화 HttpOnly 쿠키) ----------
// access token은 여기에 넣지 않습니다. 관심 신호(비민감 요약)만 담아 DB 없이도 흐름이 이어지게 합니다.

export interface InstagramCookie extends InstagramSignals {
  v: 1;
  externalUserId: string | null;
  uid: string;
}

export async function readInstagramCookie(): Promise<InstagramCookie | null> {
  const value = (await cookies()).get(COOKIE_NAMES.instagram)?.value;
  const data = decryptJson<InstagramCookie>(value, "instagram-cookie");
  return data && data.v === 1 ? data : null;
}

export async function writeInstagramCookie(data: Omit<InstagramCookie, "v">) {
  const compact: InstagramCookie = {
    ...data,
    v: 1,
    interests: data.interests.slice(0, 15),
    captionsSample: data.captionsSample.slice(0, 5).map((c) => c.slice(0, 80)),
  };
  (await cookies()).set(COOKIE_NAMES.instagram, encryptJson(compact, "instagram-cookie"), baseCookie(IG_MAX_AGE));
}

export async function clearInstagramCookie() {
  (await cookies()).delete(COOKIE_NAMES.instagram);
}

type OAuthState = { state: string; next: string; exp: number };

export async function writeOAuthState(state: string, next: string) {
  (await cookies()).set(
    COOKIE_NAMES.instagramState,
    signPayload({ state, next, exp: Date.now() + 10 * 60 * 1000 } satisfies OAuthState, "oauth-state"),
    baseCookie(10 * 60),
  );
}

export async function consumeOAuthState(): Promise<OAuthState | null> {
  const store = await cookies();
  const payload = verifyPayload<OAuthState>(store.get(COOKIE_NAMES.instagramState)?.value, "oauth-state");
  store.delete(COOKIE_NAMES.instagramState);
  if (!payload || payload.exp < Date.now()) return null;
  return payload;
}
