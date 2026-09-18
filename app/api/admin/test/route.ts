import { z } from "zod";
import { getKakaoConfig } from "@/lib/config/integrations";
import { checkAnonAccess, getRepository, isSupabaseConfigured } from "@/lib/db";
import { handle, ok, readJson } from "@/lib/http";
import { AI_ENGINE, BuiltinChatProvider } from "@/lib/providers/ai";
import { KakaoMapProvider } from "@/lib/providers/map/KakaoMapProvider";
import { requireAdmin } from "@/lib/security/adminGuard";
import { recordTestResult, type TestResult } from "@/lib/services/status";
import { getStoreCatalog, MOCK_ACTIVITY_META, SEED_META } from "@/lib/stores/catalog";
import { MARKET_INTEREST_META, recentInterestShares } from "@/lib/mock/marketInterest";
import { MARKET_REPRESENTATIVE_ADDRESS } from "@/lib/stores/parse";
import { extractSlots } from "@/lib/preferences/extract";
import { INTERVIEW_GREETING, MAX_QUESTIONS, MIN_ANSWERS, type ChatMessage } from "@/lib/preferences/types";

export const maxDuration = 30;

const Body = z.object({ target: z.enum(["ai", "kakao", "mock", "database"]) });

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 내장 챗봇 엔진 점검 — 인터뷰 한 턴과 취향 분석을 실제로 돌려 봅니다 (네트워크 호출 없음). */
async function testAI(): Promise<TestResult> {
  const startedAt = Date.now();
  try {
    const provider = new BuiltinChatProvider();
    const messages: ChatMessage[] = [INTERVIEW_GREETING, { role: "user", text: "친구 생일 선물을 찾고 있어요" }];
    const known = extractSlots(messages);
    const turn = await provider.interviewTurn({ messages, known, answeredCount: 1, askedSlots: [], maxQuestions: MAX_QUESTIONS, minAnswers: MIN_ANSWERS });
    const analysis = await provider.analyzePreferences({ mode: "both", messages, keywords: ["선물", "커피"], known });
    const top = analysis.topCategories.slice(0, 3).map((c) => `${c.key} ${Math.round(c.score * 100)}`);
    return {
      ok: Boolean(turn.reply) && analysis.topCategories.length > 0,
      message: `${AI_ENGINE.label} 정상 · ${Date.now() - startedAt}ms (외부 API 호출 없음)`,
      details: [AI_ENGINE.detail, `다음 질문 예시: ${turn.reply}`, `취향 상위: ${top.join(", ")}`, `요약: ${analysis.profile.summary}`],
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

/** 프로토타입용 seed·가상 집계 데이터가 정상적으로 로드되는지 확인 */
async function testMock(): Promise<TestResult> {
  try {
    const catalog = await getStoreCatalog();
    const shares = recentInterestShares(7).slice(0, 3);
    return {
      ok: catalog.stores.length > 0,
      message: `점포 seed ${catalog.stores.length}개 · 가상 집계 데이터 로드 완료`,
      details: [
        `점포 seed: ${SEED_META.sourceFile} · ${SEED_META.storeCount}개 (원본 ${SEED_META.rowCount}행)`,
        `가상 활동 집계: ${MOCK_ACTIVITY_META.notice}`,
        `가상 관심도 집계: 최근 ${MARKET_INTEREST_META.days}일 · 상위 ${shares.map((s) => `${s.label} ${Math.round(s.share * 100)}%`).join(", ")}`,
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
    target === "ai"
      ? await testAI()
      : target === "kakao"
        ? await testKakao()
        : target === "mock"
          ? await testMock()
          : await testDatabase();
  recordTestResult(target, result);
  return ok(result);
});
