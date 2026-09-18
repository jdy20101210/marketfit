import "server-only";
import { z } from "zod";

/**
 * 환경변수 검증.
 * - 모든 외부 연동 값은 선택 사항입니다(없으면 Mock/데모 모드).
 * - 형식이 잘못된 값은 무시하고 경고만 남겨 서비스가 중단되지 않게 합니다.
 */
const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: optionalString.pipe(z.url().optional()),
  APP_SECRET: optionalString.pipe(z.string().min(32, "APP_SECRET은 32자 이상이어야 합니다").optional()),
  ADMIN_PASSWORD: optionalString.pipe(z.string().min(8, "ADMIN_PASSWORD는 8자 이상이어야 합니다").optional()),

  NEXT_PUBLIC_KAKAO_JS_KEY: optionalString,
  KAKAO_REST_API_KEY: optionalString,

  SUPABASE_URL: optionalString.pipe(z.url().optional()),
  NEXT_PUBLIC_SUPABASE_URL: optionalString.pipe(z.url().optional()),
  /** 공개(anon) 키: 관리자 상태 점검에서 RLS가 개인 데이터를 막는지 확인하는 데 사용 */
  SUPABASE_ANON_KEY: optionalString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  /** service_role 키: 서버 전용 (NEXT_PUBLIC_ 접두사 금지) */
  SUPABASE_SERVICE_ROLE_KEY: optionalString,

  MARKETFIT_DATA_DIR: optionalString,
  VERCEL: optionalString,
  VERCEL_ENV: optionalString,
  VERCEL_URL: optionalString,
  VERCEL_PROJECT_PRODUCTION_URL: optionalString,
  /** nginx 등 리버스 프록시 뒤에서만 true — X-Forwarded-For/X-Real-IP를 신뢰합니다(Vercel은 자동). */
  TRUST_PROXY: optionalString.pipe(z.enum(["true", "false"]).optional()),
  COOKIE_SECURE: optionalString.pipe(z.enum(["true", "false"]).optional()),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: { env: Env; warnings: string[] } | null = null;

export function getEnv(): Env {
  return loadEnv().env;
}

export function getEnvWarnings(): string[] {
  return loadEnv().warnings;
}

function loadEnv(): { env: Env; warnings: string[] } {
  if (cached) return cached;
  const warnings: string[] = [];
  const raw: Record<string, string | undefined> = {};
  for (const key of Object.keys(EnvSchema.shape)) raw[key] = process.env[key];

  const parsed = EnvSchema.safeParse(raw);
  if (parsed.success) {
    cached = { env: parsed.data, warnings };
    return cached;
  }

  // 잘못된 항목만 제거하고 다시 검증합니다.
  const cleaned = { ...raw };
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    warnings.push(`${key}: ${issue.message}`);
    cleaned[key] = undefined;
  }
  const retry = EnvSchema.safeParse(cleaned);
  const env = retry.success ? retry.data : EnvSchema.parse({ NODE_ENV: process.env.NODE_ENV });
  for (const w of warnings) console.warn(`[env] 무시된 환경변수 → ${w}`);
  cached = { env, warnings };
  return cached;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}

export function isVercel(): boolean {
  return Boolean(getEnv().VERCEL);
}

/** 클라이언트 IP 헤더를 신뢰할 수 있는 환경인지 (Vercel 또는 TRUST_PROXY=true) */
export function trustsProxyHeaders(): boolean {
  const env = getEnv();
  return Boolean(env.VERCEL) || env.TRUST_PROXY === "true";
}
