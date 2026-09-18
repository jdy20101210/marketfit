import "server-only";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getRepository } from "@/lib/db";
import { decryptString, encryptString } from "@/lib/security/crypto";

/**
 * 외부 연동 설정 (현재는 Kakao 지도뿐입니다 — AI는 서비스 내장 엔진이라 키가 없습니다).
 * 우선순위: 환경변수 > 관리자 화면 입력값(서버에 암호화 저장)
 * 비밀 값은 절대로 클라이언트로 내려보내지 않습니다.
 */

const lenientKey = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^[A-Za-z0-9_\\-]{${min},${max}}$`), "키 형식이 올바르지 않습니다 (공백·특수문자 확인)");

export const INTEGRATION_FIELDS = {
  KAKAO_JS_KEY: {
    group: "kakao",
    label: "Kakao JavaScript 키",
    secret: false,
    envNames: ["NEXT_PUBLIC_KAKAO_JS_KEY", "KAKAO_JS_KEY"],
    schema: lenientKey(16, 64),
    help: "지도 표시용 (브라우저에서 사용되는 공개 키, 도메인 등록 필수)",
  },
  KAKAO_REST_API_KEY: {
    group: "kakao",
    label: "Kakao REST API 키",
    secret: true,
    envNames: ["KAKAO_REST_API_KEY"],
    schema: lenientKey(16, 64),
    help: "주소→좌표 변환(Kakao Local)용, 서버에서만 사용",
  },
} as const;

export type IntegrationKey = keyof typeof INTEGRATION_FIELDS;
export type IntegrationGroup = (typeof INTEGRATION_FIELDS)[IntegrationKey]["group"];
export const INTEGRATION_KEYS = Object.keys(INTEGRATION_FIELDS) as IntegrationKey[];

export type ValueSource = "env" | "admin" | "default" | null;

export interface ResolvedIntegrations {
  values: Partial<Record<IntegrationKey, string>>;
  sources: Record<IntegrationKey, ValueSource>;
  updatedAt: string | null;
}

const SETTINGS_PREFIX = "integration:";
const CACHE_MS = 15_000;
let cache: { at: number; value: ResolvedIntegrations } | null = null;

function envValue(key: IntegrationKey): string | undefined {
  const env = getEnv() as Record<string, string | undefined>;
  for (const name of INTEGRATION_FIELDS[key].envNames) {
    const v = env[name] ?? process.env[name];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export function invalidateIntegrationCache() {
  cache = null;
}

export async function getIntegrations(): Promise<ResolvedIntegrations> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  let stored: Record<string, string> = {};
  try {
    stored = await getRepository().readSettings();
  } catch (err) {
    console.error("[integrations] 저장된 설정을 읽지 못했습니다:", err);
  }
  const values: Partial<Record<IntegrationKey, string>> = {};
  const sources = {} as Record<IntegrationKey, ValueSource>;
  for (const key of INTEGRATION_KEYS) {
    const fromEnv = envValue(key);
    if (fromEnv) {
      values[key] = fromEnv;
      sources[key] = "env";
      continue;
    }
    const enc = stored[SETTINGS_PREFIX + key];
    const dec = enc ? decryptString(enc, "settings") : null;
    if (dec) {
      values[key] = dec;
      sources[key] = "admin";
      continue;
    }
    if (enc && !dec) console.warn(`[integrations] ${key} 값을 복호화하지 못했습니다(APP_SECRET 변경 여부 확인).`);
    sources[key] = null;
  }
  const value: ResolvedIntegrations = { values, sources, updatedAt: stored["integration:__updatedAt"] ?? null };
  cache = { at: Date.now(), value };
  return value;
}

export type SettingsPatch = Partial<Record<IntegrationKey, string | null>>;

export async function saveIntegrations(patch: SettingsPatch): Promise<{ saved: IntegrationKey[]; cleared: IntegrationKey[]; skippedEnv: IntegrationKey[] }> {
  const toWrite: Record<string, string | null> = {};
  const saved: IntegrationKey[] = [];
  const cleared: IntegrationKey[] = [];
  const skippedEnv: IntegrationKey[] = [];
  for (const [rawKey, value] of Object.entries(patch)) {
    const key = rawKey as IntegrationKey;
    if (!(key in INTEGRATION_FIELDS)) continue;
    if (envValue(key)) {
      skippedEnv.push(key);
      continue;
    }
    if (value === null) {
      toWrite[SETTINGS_PREFIX + key] = null;
      cleared.push(key);
      continue;
    }
    if (value === undefined || value.trim() === "") continue;
    const parsed = INTEGRATION_FIELDS[key].schema.parse(value);
    toWrite[SETTINGS_PREFIX + key] = encryptString(parsed, "settings");
    saved.push(key);
  }
  if (Object.keys(toWrite).length) {
    toWrite["integration:__updatedAt"] = new Date().toISOString();
    await getRepository().writeSettings(toWrite);
  }
  invalidateIntegrationCache();
  return { saved, cleared, skippedEnv };
}

export function validateIntegrationValue(key: IntegrationKey, value: string): string | null {
  const result = INTEGRATION_FIELDS[key].schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "형식 오류");
}

// ---------- 모드 판단 ----------

export async function getKakaoConfig(): Promise<{ jsKey: string | null; restKey: string | null }> {
  const { values } = await getIntegrations();
  return { jsKey: values.KAKAO_JS_KEY ?? null, restKey: values.KAKAO_REST_API_KEY ?? null };
}

export interface PublicModes {
  /** AI는 항상 서비스 내장 챗봇 엔진입니다 (외부 API 없음) */
  ai: "builtin";
  map: "kakao" | "mock";
  geocoding: "kakao" | "mock";
}

export async function getPublicModes(): Promise<PublicModes> {
  const kakao = await getKakaoConfig();
  return {
    ai: "builtin",
    map: kakao.jsKey ? "kakao" : "mock",
    geocoding: kakao.restKey ? "kakao" : "mock",
  };
}
