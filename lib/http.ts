import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { trustsProxyHeaders } from "@/lib/env";

import type { ApiResponse } from "./http-types";

export type { ApiError, ApiResponse } from "./http-types";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiResponse<T>>({ ok: true, data }, { ...init, headers: { "Cache-Control": "no-store", ...init?.headers } });
}

export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json<ApiResponse<never>>(
    { ok: false, error: { code, message, details } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const MAX_BODY_BYTES = 64 * 1024;

export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new HttpError(413, "payload_too_large", "요청 데이터가 너무 큽니다.");
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "payload_too_large", "요청 데이터가 너무 큽니다.");
    body = text ? JSON.parse(text) : {};
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "invalid_json", "JSON 형식이 올바르지 않습니다.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(422, "validation_error", parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.", z.treeifyError(parsed.error));
  }
  return parsed.data;
}

/** 라우트 핸들러 공통 에러 처리 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.code, err.message, err.details);
      if (err instanceof z.ZodError) return fail(422, "validation_error", err.issues[0]?.message ?? "입력값 오류");
      console.error("[api] 처리되지 않은 오류:", err);
      return fail(500, "internal_error", "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
  };
}

/** 프록시(Vercel 등) 뒤에서도 올바른 외부 origin을 계산합니다. */
export function getRequestOrigin(request: NextRequest | Request): string {
  const headers = request.headers;
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost ?? headers.get("host");
  const url = new URL(request.url);
  if (!host) return url.origin;
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** 관리자 변경 요청 등 쿠키 인증 요청의 CSRF 방어 */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = getRequestOrigin(request);
  if (!origin) {
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") {
      throw new HttpError(403, "forbidden_origin", "허용되지 않은 요청 출처입니다.");
    }
    return;
  }
  if (new URL(origin).host !== new URL(expected).host) {
    throw new HttpError(403, "forbidden_origin", "허용되지 않은 요청 출처입니다.");
  }
}

// ---------- 간단한 메모리 rate limit (인스턴스 단위, 남용 완화 목적) ----------
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retryAfter = Math.ceil((windowMs - (now - hits[0]!)) / 1000);
    throw new HttpError(429, "rate_limited", `요청이 너무 많습니다. ${retryAfter}초 후 다시 시도해주세요.`);
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t > windowMs)) buckets.delete(k);
  }
}

/**
 * rate limit용 클라이언트 식별자.
 * - Vercel / TRUST_PROXY=true: 프록시가 기록한 주소(X-Real-IP, X-Forwarded-For의 마지막 hop)를 사용합니다.
 * - 그 외(npm run start 단독 실행 등): 헤더는 위조할 수 있으므로 참고용 키로만 쓰고,
 *   실제 보호는 {@link rateLimitClient}의 전역 한도가 담당합니다.
 */
export function clientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  const hops = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (trustsProxyHeaders()) return (realIp || hops.at(-1) || "unknown").slice(0, 64);
  return `untrusted:${(hops[0] ?? realIp ?? "direct").slice(0, 64)}`;
}

/** 클라이언트별 한도 + 전역 한도 (클라이언트 식별자를 바꿔 우회해도 전체 호출량은 제한됩니다) */
export function rateLimitClient(request: Request, name: string, opts: { perClient: number; global: number; windowMs: number }) {
  rateLimit(`${name}:*`, opts.global, opts.windowMs);
  rateLimit(`${name}:${clientIp(request)}`, opts.perClient, opts.windowMs);
}
