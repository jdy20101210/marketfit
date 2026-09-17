import "server-only";
import { getEnvWarnings, isProduction, isVercel } from "@/lib/env";
import {
  getIntegrations,
  INTEGRATION_FIELDS,
  INTEGRATION_KEYS,
  type IntegrationGroup,
  type IntegrationKey,
  type ValueSource,
} from "@/lib/config/integrations";
import { getRepository, getRepositoryHealth, isSupabaseConfigured } from "@/lib/db";
import { getAppSecret } from "@/lib/security/crypto";
import { getAdminMode } from "@/lib/security/session";
import { getStoreCatalog } from "@/lib/stores/catalog";

export interface FieldStatus {
  key: IntegrationKey;
  group: IntegrationGroup;
  label: string;
  help: string;
  secret: boolean;
  configured: boolean;
  source: ValueSource;
  /** 비밀이 아닌 설정만 값 표시 (API 키 값은 절대 포함하지 않음) */
  displayValue: string | null;
}

export interface TestResult {
  ok: boolean;
  message: string;
  at: string;
  details?: string[];
}

const globalForTests = globalThis as unknown as { __marketfitTests?: Partial<Record<string, TestResult>> };
export function recordTestResult(target: string, result: TestResult) {
  globalForTests.__marketfitTests = { ...(globalForTests.__marketfitTests ?? {}), [target]: result };
}
function lastTest(target: string): TestResult | null {
  return globalForTests.__marketfitTests?.[target] ?? null;
}

const DISPLAYABLE: IntegrationKey[] = ["GEMINI_MODEL", "INSTAGRAM_REDIRECT_URI", "INSTAGRAM_GRAPH_API_VERSION"];

export async function getSystemStatus(requestOrigin: string) {
  const integrations = await getIntegrations();
  const repo = getRepository();
  const repoInfo = repo.info();
  const catalog = await getStoreCatalog();
  const v = integrations.values;

  const fields: FieldStatus[] = INTEGRATION_KEYS.map((key) => ({
    key,
    group: INTEGRATION_FIELDS[key].group,
    label: INTEGRATION_FIELDS[key].label,
    help: INTEGRATION_FIELDS[key].help,
    secret: INTEGRATION_FIELDS[key].secret,
    configured: Boolean(v[key]) && integrations.sources[key] !== "default",
    source: integrations.sources[key],
    displayValue: DISPLAYABLE.includes(key) ? (v[key] ?? null) : null,
  }));

  const geminiTest = lastTest("gemini");
  const kakaoTest = lastTest("kakao");
  const igTest = lastTest("instagram");
  const dbTest = lastTest("database");

  const located = catalog.stores.filter((s) => s.location.lat !== null);
  const redirectUri = v.INSTAGRAM_REDIRECT_URI ?? `${requestOrigin}/api/instagram/callback`;

  return {
    environment: {
      production: isProduction(),
      vercel: isVercel(),
      warnings: getEnvWarnings(),
      secretSource: getAppSecret().source,
      adminMode: getAdminMode(),
      settingsUpdatedAt: integrations.updatedAt,
    },
    gemini: {
      status: v.GEMINI_API_KEY ? (geminiTest && !geminiTest.ok ? "ERROR" : "CONNECTED") : "NOT CONFIGURED",
      model: v.GEMINI_MODEL ?? null,
      lastTest: geminiTest,
    },
    instagram: {
      mode: v.META_APP_ID && v.META_APP_SECRET ? "REAL" : "MOCK",
      missing: (["META_APP_ID", "META_APP_SECRET"] as const).filter((k) => !v[k]),
      redirectUri,
      redirectUriSource: v.INSTAGRAM_REDIRECT_URI ? "설정값" : "현재 접속 주소 기준 자동",
      deauthorizeUrl: `${requestOrigin}/api/instagram/deauthorize`,
      dataDeletionUrl: `${requestOrigin}/api/instagram/data-deletion`,
      privacyPolicyUrl: `${requestOrigin}/privacy`,
      lastTest: igTest,
    },
    map: {
      mode: v.KAKAO_JS_KEY ? "REAL" : "MOCK",
      geocoding: v.KAKAO_REST_API_KEY ? "REAL" : "MOCK",
      siteDomain: requestOrigin,
      locatedStores: located.length,
      exactStores: located.filter((s) => s.location.accuracy === "exact").length,
      totalStores: catalog.stores.length,
      lastTest: kakaoTest,
    },
    database: {
      kind: repoInfo.kind,
      persistent: repoInfo.persistent,
      detail: repoInfo.detail,
      supabaseConfigured: isSupabaseConfigured(),
      storeSource: catalog.source,
      health: getRepositoryHealth(),
      lastTest: dbTest,
    },
    fields,
  };
}

export type SystemStatus = Awaited<ReturnType<typeof getSystemStatus>>;
