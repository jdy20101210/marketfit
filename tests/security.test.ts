import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptString, encryptString, parseMetaSignedRequest, safeEqual, signPayload, verifyPayload } from "@/lib/security/crypto";
import { sanitizeNextPath } from "@/lib/services/instagramSession";
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

  it("Meta signed_request 검증", () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "17841400000000123", issued_at: 1 })).toString("base64url");
    const sig = createHmac("sha256", secret).update(payload).digest("base64url");
    expect(parseMetaSignedRequest<{ user_id: string }>(`${sig}.${payload}`, secret)?.user_id).toBe("17841400000000123");
    expect(parseMetaSignedRequest(`${sig}.${payload}`, "wrong-secret")).toBeNull();
  });
});

describe("요청 검증", () => {
  it("리디렉션 경로는 사이트 내부 경로만 허용", () => {
    expect(sanitizeNextPath("/onboarding?mode=both")).toBe("/onboarding?mode=both");
    expect(sanitizeNextPath("https://evil.example")).toBe("/onboarding");
    expect(sanitizeNextPath("//evil.example")).toBe("/onboarding");
    expect(sanitizeNextPath("/\\evil")).toBe("/onboarding");
    // URL 파서가 지우는 탭·개행으로 `//evil.com`을 만드는 우회 시도
    expect(sanitizeNextPath("/\t/evil.example")).toBe("/onboarding");
    expect(sanitizeNextPath("/\n/evil.example")).toBe("/onboarding");
    expect(sanitizeNextPath("/\r/evil.example")).toBe("/onboarding");
    expect(sanitizeNextPath("/%2F/evil.example")).toBe("/%2F/evil.example");
    expect(sanitizeNextPath("/profile#x")).toBe("/profile");
  });

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
    expect(validateIntegrationValue("META_APP_ID", "abc")).not.toBeNull();
    expect(validateIntegrationValue("INSTAGRAM_REDIRECT_URI", "http://example.com/cb")).not.toBeNull();
    expect(validateIntegrationValue("INSTAGRAM_REDIRECT_URI", "https://example.com/api/instagram/callback")).toBeNull();

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
  it("띄어쓰기만 다른 관심 상품 중복을 거부하고 한국어로 안내한다", async () => {
    const { AnalyzeRequestSchema } = await import("@/lib/api/schemas");
    const dup = AnalyzeRequestSchema.safeParse({ items: ["캠핑 의자", "캠핑의자", "커피"], instagram: null });
    expect(dup.success).toBe(false);
    expect(dup.error?.issues[0]?.message).toBe("같은 관심 상품이 중복되었어요");
    const wrongType = AnalyzeRequestSchema.safeParse({ items: [1, 2, 3], instagram: null });
    expect(wrongType.error?.issues[0]?.message).toMatch(/[가-힣]/);
    expect(AnalyzeRequestSchema.safeParse({ items: ["드립커피", "캠핑 의자", "빈티지 소품"], instagram: null }).success).toBe(true);
  });
});
