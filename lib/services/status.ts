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
import { getStoreCatalog, MOCK_ACTIVITY_META, SEED_META } from "@/lib/stores/catalog";
import { MARKET_INTEREST_META } from "@/lib/mock/marketInterest";

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

const DISPLAYABLE: IntegrationKey[] = ["GEMINI_MODEL"];

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
  const mockTest = lastTest("mock");
  const dbTest = lastTest("database");

  const located = catalog.stores.filter((s) => s.location.lat !== null);

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
    mock: {
      /** Gemini가 없을 때 쓰이는 대체 provider와 프로토타입 가상 집계 데이터 상태 */
      aiFallback: v.GEMINI_API_KEY ? "STANDBY" : "ACTIVE",
      storeSeed: `${SEED_META.sourceFile} · ${SEED_META.storeCount}개 점포 (원본 ${SEED_META.rowCount}행)`,
      activityNotice: MOCK_ACTIVITY_META.notice,
      interestNotice: MARKET_INTEREST_META.notice,
      lastTest: mockTest,
    },
    map: {
      mode: v.KAKAO_JS_KEY ? "REAL" : "MOCK",
      geocoding: v.KAKAO_REST_API_KEY ? "REAL" : "MOCK",
      /** Kakao 개발자 콘솔에 등록해야 하는 현재 접속 도메인 (하드코딩하지 않고 요청에서 가져옴) */
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
