import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptString, encryptString, safeEqual, signPayload, verifyPayload } from "@/lib/security/crypto";
import { assertSameOrigin, getRequestOrigin } from "@/lib/http";

describe("암호화·서명", () => {
  it("AES-GCM 왕복 및 위변조 거부", () => {
    const token = encryptString("secret-api-key", "settings");
    expect(token.startsWith("v1.")).toBe(true);
    expect(token).not.toContain("secret-api-key");
    expect(decryptString(token, "settings")).toBe("secret-api-key");
    expect(decryptString(token, "other-purpose")).toBeNull();
    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    expect(decryptString(tampered, "settings")).toBeNull();
  });

  it("HMAC 서명 검증", () => {
    const signed = signPayload({ id: "abc" }, "uid");
    expect(verifyPayload<{ id: string }>(signed, "uid")?.id).toBe("abc");
    const [body] = signed.split(".");
    const forged = `${Buffer.from(JSON.stringify({ id: "evil" })).toString("base64url")}.${signed.split(".")[1]}`;
    expect(verifyPayload(forged, "uid")).toBeNull();
    expect(verifyPayload(`${body}.xxx`, "uid")).toBeNull();
    expect(verifyPayload(signed, "admin")).toBeNull();
  });

  it("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

});

describe("요청 검증", () => {
  it("프록시 헤더로 외부 origin을 계산", () => {
    const req = new Request("http://localhost:3000/api/x", { headers: { host: "localhost:3000", "x-forwarded-host": "marketfit.vercel.app", "x-forwarded-proto": "https" } });
    expect(getRequestOrigin(req)).toBe("https://marketfit.vercel.app");
  });

  it("다른 출처의 변경 요청을 차단", () => {
    const ok = new Request("http://localhost:3000/api/admin/settings", { method: "PUT", headers: { host: "localhost:3000", origin: "http://localhost:3000" } });
    expect(() => assertSameOrigin(ok)).not.toThrow();
    const bad = new Request("http://localhost:3000/api/admin/settings", { method: "PUT", headers: { host: "localhost:3000", origin: "https://evil.example" } });
    expect(() => assertSameOrigin(bad)).toThrow();
  });
});

describe("연동 설정 저장", () => {
  it("관리자 입력값은 암호화되어 저장되고 환경변수가 우선한다", async () => {
    vi.resetModules();
    vi.stubEnv("KAKAO_REST_API_KEY", "envkey0123456789abcdef");
    const { saveIntegrations, getIntegrations, validateIntegrationValue } = await import("@/lib/config/integrations");
    const { getRepository } = await import("@/lib/db");
    expect(validateIntegrationValue("GEMINI_API_KEY", "짧음")).not.toBeNull();
    expect(validateIntegrationValue("KAKAO_JS_KEY", "0123456789abcdef")).toBeNull();

    const result = await saveIntegrations({ GEMINI_API_KEY: "AIzaTestKey0123456789abcdef", KAKAO_REST_API_KEY: "adminkey0123456789abcd" });
    expect(result.saved).toContain("GEMINI_API_KEY");
    expect(result.skippedEnv).toContain("KAKAO_REST_API_KEY");

    const stored = await getRepository().readSettings();
    expect(JSON.stringify(stored)).not.toContain("AIzaTestKey0123456789abcdef");

    const resolved = await getIntegrations();
    expect(resolved.values.GEMINI_API_KEY).toBe("AIzaTestKey0123456789abcdef");
    expect(resolved.sources.GEMINI_API_KEY).toBe("admin");
    expect(resolved.sources.KAKAO_REST_API_KEY).toBe("env");
    expect(resolved.values.GEMINI_MODEL).toBe("gemini-flash-latest");

    await saveIntegrations({ GEMINI_API_KEY: null });
    expect((await getIntegrations()).values.GEMINI_API_KEY).toBeUndefined();
    vi.unstubAllEnvs();
  });
});

describe("요청 한도 (클라이언트 식별)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  const req = (headers: Record<string, string>) => new Request("http://localhost:3000/api/x", { headers });

  it("프록시를 신뢰하지 않으면 X-Forwarded-For를 바꿔도 전역 한도에 걸린다", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY", "");
    const http = await import("@/lib/http");
    const opts = { perClient: 2, global: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) http.rateLimitClient(req({ "x-forwarded-for": `10.0.0.${i}` }), "spoof-test", opts);
    expect(() => http.rateLimitClient(req({ "x-forwarded-for": "10.0.0.99" }), "spoof-test", opts)).toThrow(http.HttpError);
    expect(http.clientIp(req({ "x-forwarded-for": "1.1.1.1" }))).toBe("untrusted:1.1.1.1");
  });

  it("클라이언트별 한도는 같은 식별자에만 적용된다", async () => {
    vi.stubEnv("TRUST_PROXY", "true");
    const http = await import("@/lib/http");
    const opts = { perClient: 1, global: 10, windowMs: 60_000 };
    http.rateLimitClient(req({ "x-real-ip": "5.5.5.5" }), "per-client-test", opts);
    expect(() => http.rateLimitClient(req({ "x-real-ip": "5.5.5.5" }), "per-client-test", opts)).toThrow(http.HttpError);
    expect(() => http.rateLimitClient(req({ "x-real-ip": "6.6.6.6" }), "per-client-test", opts)).not.toThrow();
  });

  it("TRUST_PROXY면 프록시가 기록한 주소(X-Real-IP, 마지막 hop)를 쓴다", async () => {
    vi.stubEnv("TRUST_PROXY", "true");
    const { clientIp } = await import("@/lib/http");
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(req({ "x-real-ip": "3.3.3.3", "x-forwarded-for": "1.1.1.1" }))).toBe("3.3.3.3");
  });
});

describe("입력 검증", () => {
  it("띄어쓰기만 다른 키워드 중복을 거부하고 한국어로 안내한다", async () => {
    const { AnalyzeRequestSchema } = await import("@/lib/api/schemas");
    const dup = AnalyzeRequestSchema.safeParse({ mode: "keywords", messages: [], keywords: ["캠핑 의자", "캠핑의자", "커피"] });
    expect(dup.success).toBe(false);
    expect(dup.error?.issues[0]?.message).toBe("같은 키워드가 중복되었어요");
    const wrongType = AnalyzeRequestSchema.safeParse({ mode: "keywords", messages: [], keywords: [1, 2, 3] });
    expect(wrongType.error?.issues[0]?.message).toMatch(/[가-힣]/);
    expect(AnalyzeRequestSchema.safeParse({ mode: "keywords", messages: [], keywords: ["드립커피", "캠핑 의자", "빈티지 소품"] }).success).toBe(true);
  });

  it("대화 모드는 질문·답변이 번갈아 나와야 한다", async () => {
    const { AnalyzeRequestSchema } = await import("@/lib/api/schemas");
    const bad = AnalyzeRequestSchema.safeParse({
      mode: "chat",
      messages: [
        { role: "user", text: "선물 찾아요" },
        { role: "user", text: "2만원" },
      ],
      keywords: [],
    });
    expect(bad.success).toBe(false);
    const good = AnalyzeRequestSchema.safeParse({
      mode: "chat",
      messages: [
        { role: "assistant", text: "무엇을 찾고 계세요?" },
        { role: "user", text: "친구 생일 선물이요" },
      ],
      keywords: [],
    });
    expect(good.success).toBe(true);
  });
});
