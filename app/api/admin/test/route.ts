import { z } from "zod";
import { getGeminiConfig, getKakaoConfig } from "@/lib/config/integrations";
import { checkAnonAccess, getRepository, isSupabaseConfigured } from "@/lib/db";
import { handle, ok, readJson } from "@/lib/http";
import { listGeminiModels } from "@/lib/providers/ai";
import { KakaoMapProvider } from "@/lib/providers/map/KakaoMapProvider";
import { MockGeminiProvider } from "@/lib/providers/ai/MockGeminiProvider";
import { requireAdmin } from "@/lib/security/adminGuard";
import { recordTestResult, type TestResult } from "@/lib/services/status";
import { getStoreCatalog, MOCK_ACTIVITY_META, SEED_META } from "@/lib/stores/catalog";
import { MARKET_INTEREST_META, recentInterestShares } from "@/lib/mock/marketInterest";
import { MARKET_REPRESENTATIVE_ADDRESS } from "@/lib/stores/parse";
import { extractSlots } from "@/lib/preferences/extract";
import { INTERVIEW_GREETING, MAX_QUESTIONS, MIN_ANSWERS, type ChatMessage } from "@/lib/preferences/types";

export const maxDuration = 30;

const Body = z.object({ target: z.enum(["gemini", "kakao", "mock", "database"]) });

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function testGemini(): Promise<TestResult> {
  const config = await getGeminiConfig();
  if (!config) return { ok: false, message: "Gemini API 키가 설정되지 않았습니다.", at: new Date().toISOString() };
  try {
    const models = await listGeminiModels(config.apiKey);
    const isAlias = config.model.endsWith("-latest");
    const found = models.includes(config.model);
    return {
      ok: found || isAlias,
      message: found
        ? `API 키 확인 완료 · 모델 ${config.model} 사용 가능`
        : isAlias
          ? `API 키 확인 완료 · 별칭 모델 ${config.model} 사용 (최신 Flash로 자동 연결)`
          : `API 키는 유효하지만 모델 ${config.model}을(를) 찾을 수 없습니다. 아래 목록에서 선택하세요.`,
      details: models.slice(0, 30),
      at: new Date().toISOString(),
    };
  } catch (err) {
    return { ok: false, message: message(err), at: new Date().toISOString() };
  }
}

async function testKakao(): Promise<TestResult> {
  const { jsKey, restKey } = await getKakaoConfig();
  const notes = [jsKey ? "JavaScript 키: 설정됨 (브라우저 테스트 버튼으로 지도 로딩 확인)" : "JavaScript 키: 없음 → 데모 안내도 표시"];
  if (!restKey) {
    return { ok: Boolean(jsKey), message: "REST API 키가 없어 좌표 변환은 데모 모드입니다.", details: notes, at: new Date().toISOString() };
  }
  try {
    const result = await new KakaoMapProvider(restKey).geocodeAddress(MARKET_REPRESENTATIVE_ADDRESS);
    return {
      ok: Boolean(result),
      message: result
        ? `REST API 확인 완료 · ${MARKET_REPRESENTATIVE_ADDRESS} → (${result.lat.toFixed(5)}, ${result.lng.toFixed(5)})`
        : "REST API 호출은 성공했지만 대표 주소를 찾지 못했습니다.",
      details: notes,
      at: new Date().toISOString(),
    };
  } catch (err) {
    return { ok: false, message: message(err), details: notes, at: new Date().toISOString() };
  }
}

/** Gemini 없이도 서비스가 도는지(MockGeminiProvider) + 가상 집계 데이터가 로드되는지 확인 */
async function testMock(): Promise<TestResult> {
  try {
    const provider = new MockGeminiProvider();
    const messages: ChatMessage[] = [INTERVIEW_GREETING, { role: "user", text: "친구 생일 선물을 찾고 있어요" }];
    const known = extractSlots(messages);
    const turn = await provider.interviewTurn({ messages, known, answeredCount: 1, askedSlots: [], maxQuestions: MAX_QUESTIONS, minAnswers: MIN_ANSWERS });
    const analysis = await provider.analyzePreferences({ mode: "keywords", messages: [], keywords: ["선물", "커피"], known: extractSlots([]) });
    const shares = recentInterestShares(7).slice(0, 3);
    return {
      ok: Boolean(turn.reply) && analysis.topCategories.length > 0,
      message: "Mock provider 정상 · Gemini 실패 시에도 인터뷰·분석이 동작합니다.",
      details: [
        `점포 seed: ${SEED_META.sourceFile} · ${SEED_META.storeCount}개 (원본 ${SEED_META.rowCount}행)`,
        `가상 활동 집계: ${MOCK_ACTIVITY_META.notice}`,
        `가상 관심도 집계: 최근 ${MARKET_INTEREST_META.days}일 · 상위 ${shares.map((s) => `${s.label} ${Math.round(s.share * 100)}%`).join(", ")}`,
        `대체 질문 예시: ${turn.reply}`,
      ],
      at: new Date().toISOString(),
    };
  } catch (err) {
    return { ok: false, message: message(err), at: new Date().toISOString() };
  }
}

async function testDatabase(): Promise<TestResult> {
  const repo = getRepository();
  try {
    await repo.readSettings();
    const catalog = await getStoreCatalog();
    const info = repo.info();
    const rls = isSupabaseConfigured() ? await checkAnonAccess() : null;
    return {
      ok: rls ? !rls.checked || rls.personalBlocked : true,
      message: `${info.kind} 연결 확인 · 점포 데이터 출처: ${catalog.source === "database" ? "DB" : "seed JSON"} (${catalog.stores.length}개)`,
      details: [info.detail, ...(rls ? [rls.detail] : [])],
      at: new Date().toISOString(),
    };
  } catch (err) {
    return { ok: false, message: message(err), at: new Date().toISOString() };
  }
}

export const POST = handle(async (request: Request) => {
  await requireAdmin(request, { mutating: true });
  const { target } = await readJson(request, Body);
  const result =
    target === "gemini"
      ? await testGemini()
      : target === "kakao"
        ? await testKakao()
        : target === "mock"
          ? await testMock()
          : await testDatabase();
  recordTestResult(target, result);
  return ok(result);
});
