import { z } from "zod";
import { getGeminiConfig, getInstagramConfig, getKakaoConfig, resolveRedirectUri } from "@/lib/config/integrations";
import { getRepository } from "@/lib/db";
import { getRequestOrigin, handle, ok, readJson } from "@/lib/http";
import { listGeminiModels } from "@/lib/providers/ai";
import { KakaoMapProvider } from "@/lib/providers/map/KakaoMapProvider";
import { requireAdmin } from "@/lib/security/adminGuard";
import { recordTestResult, type TestResult } from "@/lib/services/status";
import { getStoreCatalog } from "@/lib/stores/catalog";
import { MARKET_REPRESENTATIVE_ADDRESS } from "@/lib/stores/parse";

export const maxDuration = 30;

const Body = z.object({ target: z.enum(["gemini", "kakao", "instagram", "database"]) });

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

async function testInstagram(origin: string): Promise<TestResult> {
  const config = await getInstagramConfig();
  if (!config) return { ok: false, message: "Instagram 앱 ID/시크릿이 없어 데모 모드로 동작합니다.", at: new Date().toISOString() };
  const redirectUri = resolveRedirectUri(config.redirectUri, origin);
  return {
    ok: true,
    message: "앱 정보가 설정되었습니다. [Instagram 로그인 테스트]로 실제 연결을 확인하세요.",
    details: [
      `Meta에 등록할 리디렉션 URI: ${redirectUri}`,
      "권한(scope): instagram_business_basic",
      "프로페셔널(비즈니스/크리에이터) 계정 + 앱 역할(테스터) 등록 필요 (개발 모드)",
    ],
    at: new Date().toISOString(),
  };
}

async function testDatabase(): Promise<TestResult> {
  const repo = getRepository();
  try {
    await repo.readSettings();
    const catalog = await getStoreCatalog();
    const info = repo.info();
    return {
      ok: true,
      message: `${info.kind} 연결 확인 · 점포 데이터 출처: ${catalog.source === "database" ? "DB" : "seed JSON"} (${catalog.stores.length}개)`,
      details: [info.detail],
      at: new Date().toISOString(),
    };
  } catch (err) {
    return { ok: false, message: message(err), at: new Date().toISOString() };
  }
}

export const POST = handle(async (request: Request) => {
  await requireAdmin(request, { mutating: true });
  const { target } = await readJson(request, Body);
  const origin = getRequestOrigin(request);
  const result =
    target === "gemini"
      ? await testGemini()
      : target === "kakao"
        ? await testKakao()
        : target === "instagram"
          ? await testInstagram(origin)
          : await testDatabase();
  recordTestResult(target, result);
  return ok(result);
});
