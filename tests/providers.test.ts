import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyVector, TASTE_KEYS } from "@/lib/recommendation/dimensions";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function geminiBody(payload: unknown) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" }] };
}

const validProfile = {
  persona_label: "감성 캠퍼형",
  summary: "캠핑과 커피를 즐기는 취향이에요.",
  taste_vector: { ...emptyVector(), camping: 0.9, coffee: 0.85, vintage: 0.6, gift: 0.4 },
  recent_vector: { ...emptyVector(), coffee: 0.9, camping: 0.8 },
  top_categories: [
    { key: "camping", score: 0.9, evidence: "캠핑 의자" },
    { key: "not_a_key", score: 0.9, evidence: "무시되어야 함" },
  ],
  item_insights: [
    { input: "드립커피", keys: ["coffee"], note: "커피 관심" },
    { input: "입력에 없던 상품", keys: ["gift"], note: "무시" },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("GeminiProvider (fetch mock)", () => {
  it("구조화 JSON을 검증하고 규칙 기반 vector와 섞는다", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse(geminiBody(validProfile)));
    vi.stubGlobal("fetch", fetchMock);
    const { GeminiProvider } = await import("@/lib/providers/ai/GeminiProvider");
    const provider = new GeminiProvider("test-key-1234567890abcdefgh", "gemini-flash-latest");
    const result = await provider.analyzeProfile({
      instagram: { mode: "mock", interests: [{ keyword: "캠핑", score: 0.89 }], captionsSample: [] },
      items: ["드립커피", "캠핑 의자", "빈티지 소품"],
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key-1234567890abcdefgh");
    const body = JSON.parse(String(init!.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.required).toContain("taste_vector");
    expect(String(url)).not.toContain("test-key");

    expect(result.personaLabel).toBe("감성 캠퍼형");
    expect(result.tasteVector.camping).toBeGreaterThan(0.8);
    expect(result.topCategories.map((c) => c.key)).not.toContain("not_a_key");
    expect(result.itemInsights.map((i) => i.input)).toEqual(["드립커피"]);
    for (const k of TASTE_KEYS) {
      expect(result.tasteVector[k]).toBeGreaterThanOrEqual(0);
      expect(result.tasteVector[k]).toBeLessThanOrEqual(1);
    }
  });

  it("모델이 없으면(404) 다음 후보 모델로 재시도한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 404, message: "models/old-model is not found", status: "NOT_FOUND" } }, 404))
      .mockResolvedValueOnce(jsonResponse(geminiBody(validProfile)));
    vi.stubGlobal("fetch", fetchMock);
    const { GeminiProvider } = await import("@/lib/providers/ai/GeminiProvider");
    const provider = new GeminiProvider("test-key-1234567890abcdefgh", "old-model");
    await provider.analyzeProfile({ instagram: null, items: ["드립커피", "캠핑 의자", "빈티지 소품"] });
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/models/gemini-flash-latest:generateContent");
    expect(provider.model).toBe("gemini-flash-latest");
  });

  it("비어 있는 취향 vector는 거부한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(geminiBody({ ...validProfile, taste_vector: emptyVector() }))));
    const { GeminiProvider } = await import("@/lib/providers/ai/GeminiProvider");
    const provider = new GeminiProvider("test-key-1234567890abcdefgh", "gemini-flash-latest");
    await expect(provider.analyzeProfile({ instagram: null, items: ["a", "b", "c"] })).rejects.toThrow();
  });

  it("추천 이유에서 가격·전화번호·허용되지 않은 점포는 버린다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          geminiBody({
            reasons: [
              { store_id: "jm-001", reason: "패션 취향과 잘 맞는 여성복 점포예요. 둘러보기 좋아요." },
              { store_id: "jm-002", reason: "지금 30,000원 할인 중인 옷이 있어요." },
              { store_id: "jm-003", reason: "30년 전통을 이어온 원조 가게라 믿고 살 수 있어요." },
              { store_id: "jm-004", reason: "대전에서 유일한 곳으로 오전 9시부터 문을 열어요." },
              { store_id: "jm-999", reason: "존재하지 않는 점포에 대한 설명이에요." },
            ],
          }),
        ),
      ),
    );
    const { GeminiProvider } = await import("@/lib/providers/ai/GeminiProvider");
    const provider = new GeminiProvider("test-key-1234567890abcdefgh", "gemini-flash-latest");
    const reasons = await provider.generateReasons({
      personaLabel: null,
      userTop: [{ key: "fashion", score: 0.9 }],
      stores: ["jm-001", "jm-002", "jm-003", "jm-004"].map((id) => ({
        id,
        name: id,
        storeType: "여성복",
        entityLabel: "개별 점포",
        category: "패션·의류",
        confirmedItems: ["여성복"],
        matchedTastes: ["fashion"],
        locationNote: "",
      })),
    });
    expect(Object.keys(reasons)).toEqual(["jm-001"]);
  });

  it("키가 잘못되면 fallback으로 데모 AI 결과를 돌려준다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "invalid-key-1234567890abcdef");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }, 400)),
    );
    const { analyzeProfileWithFallback } = await import("@/lib/providers/ai");
    const res = await analyzeProfileWithFallback({ instagram: null, items: ["드립커피", "캠핑 의자", "빈티지 소품"] });
    expect(res.provider).toBe("mock");
    expect(res.fallbackReason).toContain("API 키");
    expect(res.result.tasteVector.coffee).toBeGreaterThan(0.5);
  });
});

describe("Instagram API adapter (fetch mock)", () => {
  beforeEach(() => vi.resetModules());

  it("authorize URL에 필수 파라미터를 넣는다", async () => {
    const { buildAuthorizeUrl } = await import("@/lib/providers/instagram/instagramApi");
    const url = new URL(buildAuthorizeUrl({ appId: "123456789", redirectUri: "https://example.com/api/instagram/callback", state: "abc", scopes: ["instagram_business_basic"] }));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("123456789");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic");
    expect(url.searchParams.get("state")).toBe("abc");
  });

  it("토큰 응답의 두 가지 형식과 큰 user_id를 처리하고 '#_'를 제거한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"data":[{"access_token":"IGQ-short","user_id":17841400000000123,"permissions":"instagram_business_basic"}]}'))
      .mockResolvedValueOnce(new Response('{"access_token":"IGQ-short2","user_id":"17841400000000999","permissions":["instagram_business_basic"]}'));
    vi.stubGlobal("fetch", fetchMock);
    const { exchangeCodeForToken } = await import("@/lib/providers/instagram/instagramApi");
    const a = await exchangeCodeForToken({ appId: "1", appSecret: "s", redirectUri: "https://x/cb", code: "CODE123#_" });
    expect(a).toEqual({ accessToken: "IGQ-short", userId: "17841400000000123", permissions: ["instagram_business_basic"] });
    const body = fetchMock.mock.calls[0]![1]!.body as URLSearchParams;
    expect(body.get("code")).toBe("CODE123");
    expect(body.get("grant_type")).toBe("authorization_code");
    const b = await exchangeCodeForToken({ appId: "1", appSecret: "s", redirectUri: "https://x/cb", code: "C" });
    expect(b.userId).toBe("17841400000000999");
    expect(b.permissions).toEqual(["instagram_business_basic"]);
  });

  it("OAuth 오류를 인증 오류로 분류한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 } }, 400)));
    const { fetchProfile, InstagramApiError } = await import("@/lib/providers/instagram/instagramApi");
    const err = await fetchProfile({ accessToken: "bad", version: null }).catch((e) => e);
    expect(err).toBeInstanceOf(InstagramApiError);
    expect(err.isAuthError).toBe(true);
  });

  it("본인 게시물 캡션에서 관심 키워드를 뽑는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response('{"id":"26000000000000001","user_id":"17841400000000123","username":"market_lover","account_type":"BUSINESS","media_count":3}'))
        .mockResolvedValueOnce(
          jsonResponse({
            data: [
              { id: "1", caption: "주말 #캠핑 에서 내린 #드립커피", media_type: "IMAGE", timestamp: "2026-09-10T00:00:00+0000" },
              { id: "2", caption: "빈티지 소품 구경 #빈티지 #대전", media_type: "IMAGE", timestamp: "2026-09-01T00:00:00+0000" },
              { id: "3", caption: null, media_type: "VIDEO", timestamp: "2026-08-01T00:00:00+0000" },
            ],
          }),
        ),
    );
    const api = await import("@/lib/providers/instagram/instagramApi");
    const { extractInterests } = await import("@/lib/providers/instagram/keywordExtractor");
    const profile = await api.fetchProfile({ accessToken: "t", version: "v24.0" });
    expect(profile).toMatchObject({ id: "26000000000000001", userId: "17841400000000123", username: "market_lover", accountType: "BUSINESS" });
    const media = await api.fetchRecentMedia({ accessToken: "t", version: "v24.0" });
    const interests = extractInterests(media);
    const keywords = interests.map((i) => i.keyword);
    expect(keywords).toEqual(expect.arrayContaining(["캠핑", "드립커피", "빈티지"]));
    for (const i of interests) expect(i.score).toBeLessThanOrEqual(0.95);
  });
});

describe("Kakao Local (fetch mock)", () => {
  it("건물 번호까지 일치한 주소만 exact로 본다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ documents: [{ address_name: "대전 동구 대전로 783", address_type: "ROAD_ADDR", x: "127.43", y: "36.32" }] }))
      .mockResolvedValueOnce(jsonResponse({ documents: [{ address_name: "대전 동구 대전로", address_type: "ROAD", x: "127.43", y: "36.32" }] }))
      .mockResolvedValueOnce(jsonResponse({ documents: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { KakaoMapProvider } = await import("@/lib/providers/map/KakaoMapProvider");
    const p = new KakaoMapProvider("rest-key-0123456789abcdef");
    expect((await p.geocodeAddress("대전광역시 동구 대전로 783"))?.accuracy).toBe("exact");
    expect((await p.geocodeAddress("대전광역시 동구 대전로"))?.accuracy).toBe("approximate");
    expect(await p.geocodeAddress("없는 주소")).toBeNull();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("https://dapi.kakao.com/v2/local/search/address.json?query=");
    expect((init!.headers as Record<string, string>).Authorization).toBe("KakaoAK rest-key-0123456789abcdef");
  });

  it("401이면 설정 점검 안내가 담긴 오류를 낸다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ errorType: "AccessDeniedError", message: "cannot find appKey" }, 401)));
    const { KakaoMapProvider } = await import("@/lib/providers/map/KakaoMapProvider");
    await expect(new KakaoMapProvider("bad").geocodeAddress("x")).rejects.toThrow(/카카오맵/);
  });
});

describe("캡션 키워드 추출", () => {
  it("긴 단어를 우선해 '닭강정'에서 '강정'을 따로 뽑지 않는다", async () => {
    const { extractInterests } = await import("@/lib/providers/instagram/keywordExtractor");
    const keywords = extractInterests([
      { caption: "중앙시장 닭강정 맛집 발견", timestamp: "2026-09-10T00:00:00+0000" },
      { caption: "떡볶이 먹고 전통시장 구경", timestamp: "2026-09-09T00:00:00+0000" },
    ]).map((i) => i.keyword);
    expect(keywords).toEqual(expect.arrayContaining(["닭강정", "떡볶이", "전통시장", "중앙시장", "맛집"]));
    expect(keywords).not.toContain("강정");
    expect(keywords).not.toContain("떡");
    expect(keywords).not.toContain("시장");
  });
});

describe("Instagram 토큰 갱신 (로컬 저장소)", () => {
  it("만료 임박 토큰을 갱신하면 새 토큰·만료일을 저장하고 이전 값으로 되돌리지 않는다", async () => {
    const { randomUUID } = await import("node:crypto");
    const { getRepository } = await import("@/lib/db");
    const { encryptString, decryptString } = await import("@/lib/security/crypto");
    const { RealInstagramDataProvider } = await import("@/lib/providers/instagram/RealInstagramDataProvider");
    const userId = randomUUID();
    const repo = getRepository();
    const oldExpiry = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await repo.upsertSocialConnection({
      userId,
      provider: "instagram",
      status: "connected",
      externalUserId: "17841400000000123",
      username: "old_name",
      accountType: "BUSINESS",
      signals: null,
      tokenEncrypted: encryptString("OLD_TOKEN", "instagram-token"),
      tokenExpiresAt: oldExpiry,
      updatedAt: new Date().toISOString(),
    });
    const usedTokens: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        usedTokens.push(`${url.pathname}:${url.searchParams.get("access_token")}`);
        if (url.pathname.endsWith("/refresh_access_token")) return jsonResponse({ access_token: "NEW_TOKEN", token_type: "bearer", expires_in: 5_184_000 });
        if (url.pathname.endsWith("/me/media"))
          return jsonResponse({ data: [{ id: "1", caption: "주말 #캠핑 #커피", media_type: "IMAGE", timestamp: "2026-09-10T00:00:00+0000" }] });
        if (url.pathname.endsWith("/me")) return jsonResponse({ id: "1", user_id: "17841400000000123", username: "new_name", account_type: "BUSINESS", media_count: 1 });
        return jsonResponse({ error: { message: "unexpected" } }, 404);
      }),
    );
    const provider = new RealInstagramDataProvider({ appId: "123", appSecret: "secret-secret", redirectUri: null, graphVersion: "v24.0" });
    const data = await provider.getProfileData(userId);
    expect(data.username).toBe("new_name");
    expect(usedTokens.find((t) => t.endsWith("/me:NEW_TOKEN"))).toBeTruthy();

    const saved = await repo.getSocialConnection(userId, "instagram");
    expect(saved?.username).toBe("new_name");
    expect(decryptString(saved!.tokenEncrypted!, "instagram-token")).toBe("NEW_TOKEN");
    expect(Date.parse(saved!.tokenExpiresAt!)).toBeGreaterThan(Date.parse(oldExpiry));
    await repo.deleteUserData(userId);
  });
});

describe("행동 이력 병합", () => {
  it("서버에 기록된 좋아요·관심 없음과 조회수를 브라우저 상태에 합친다", async () => {
    const { mergeInteractionState, feedbackFromState } = await import("@/lib/services/recommendationService");
    const events = [
      { storeId: "jm-001", type: "like" as const, active: true, createdAt: "2026-09-01T00:00:00Z" },
      { storeId: "jm-002", type: "dismiss" as const, active: true, createdAt: "2026-09-01T00:00:00Z" },
      { storeId: "jm-003", type: "bookmark" as const, active: true, createdAt: "2026-09-01T00:00:00Z" },
      { storeId: "jm-003", type: "bookmark" as const, active: false, createdAt: "2026-09-02T00:00:00Z" },
      { storeId: "jm-004", type: "view" as const, active: true, createdAt: "2026-09-02T00:00:00Z" },
      { storeId: "jm-004", type: "view" as const, active: true, createdAt: "2026-09-03T00:00:00Z" },
    ];
    const merged = mergeInteractionState({ liked: ["jm-005"], bookmarked: [], visited: [], dismissed: [] }, events);
    expect(merged.liked.sort()).toEqual(["jm-001", "jm-005"]);
    expect(merged.dismissed).toEqual(["jm-002"]);
    expect(merged.bookmarked).toEqual([]);
    const feedback = feedbackFromState(merged, events);
    expect(feedback["jm-001"]).toBe(0.5);
    expect(feedback["jm-002"]).toBe(-1);
    expect(feedback["jm-004"]).toBeCloseTo(0.1);
  });
});

describe("점포 소개 (템플릿)", () => {
  it("원본 데이터에 있는 유형·품목만 쓰고 숫자·단정 표현을 쓰지 않는다", async () => {
    const { templateStoreDescription } = await import("@/lib/stores/description");
    const text = templateStoreDescription({
      id: "jm-100",
      name: "테스트상회",
      storeType: "그릇·주방용품",
      entityLabel: "개별 점포",
      category: "주방·식기",
      confirmedItems: ["그릇", "주방용품", "냄비"],
      marketHighlights: ["로컬 체험"],
      locationNote: "",
    });
    expect(text).toContain("테스트상회는 '그릇·주방용품'을 다루는 점포예요.");
    expect(text).toContain("냄비");
    const vendor = templateStoreDescription({
      id: "jm-101",
      name: "테스트주단",
      storeType: "의류 노점",
      entityLabel: "노점",
      category: "패션·의류",
      confirmedItems: ["의류"],
      marketHighlights: [],
      locationNote: "",
    });
    expect(vendor).toBe("테스트주단은 '의류'를 다루는 노점이에요.");
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/최고|유일|원조/);
  });
});
