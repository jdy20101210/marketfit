import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyVector, TASTE_KEYS } from "@/lib/recommendation/dimensions";
import { extractSlots } from "@/lib/preferences/extract";
import { INTERVIEW_GREETING, MAX_QUESTIONS, MIN_ANSWERS, type ChatMessage } from "@/lib/preferences/types";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function geminiBody(payload: unknown) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" }] };
}

const emptyContext = {
  intent: null,
  intent_label: null,
  looking_for: null,
  budget_min: null,
  budget_max: null,
  companion: null,
  occasion: null,
  preferred_style: [],
  discovery_preference: null,
};

const validPreference = {
  persona_label: "선물 탐험가",
  summary: "대전에서만 볼 수 있는 2만원 이하 선물을 찾고 있어요.",
  categories: { ...emptyVector(), gift: 0.94, local: 0.91, discovery: 0.89, practical: 0.55 },
  focus: { ...emptyVector(), gift: 0.95, local: 0.9 },
  context: { ...emptyContext, intent: "birthday_gift", intent_label: "생일 선물", budget_max: 20000, discovery_preference: "unique" },
  top_categories: [
    { key: "gift", score: 0.94, evidence: "친구 생일 선물" },
    { key: "not_a_key", score: 0.9, evidence: "무시되어야 함" },
  ],
  keyword_insights: [
    { input: "선물", keys: ["gift"], expanded_terms: ["기념품"], note: "선물 관심" },
    { input: "입력에 없던 키워드", keys: ["coffee"], expanded_terms: [], note: "무시" },
  ],
};

function interviewInput(messages: ChatMessage[]) {
  return { messages, known: extractSlots(messages), answeredCount: messages.filter((m) => m.role === "user").length, askedSlots: [], maxQuestions: MAX_QUESTIONS, minAnswers: MIN_ANSWERS };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("GeminiProvider · 취향 분석 (fetch mock)", () => {
  it("구조화 JSON을 검증하고 규칙 기반 vector와 섞는다", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse(geminiBody(validPreference)));
    vi.stubGlobal("fetch", fetchMock);
    const { GeminiProvider } = await import("@/lib/providers/ai/GeminiProvider");
    const provider = new GeminiProvider("test-key-1234567890abcdefgh", "gemini-flash-latest");
    const result = await provider.analyzePreferences({
      mode: "keywords",
      messages: [],
      keywords: ["선물", "빈티지"],
      known: extractSlots([]),
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key-1234567890abcdefgh");
    const body = JSON.parse(String(init!.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.required).toContain("categories");
    // API 키를 URL(로그·리퍼러에 남는 위치)에 넣지 않습니다.
    expect(String(url)).not.toContain("test-key");

    expect(result.personaLabel).toBe("선물 탐험가");
    expect(result.profile.categories.gift).toBeGreaterThan(0.8);
    // 사용자가 금액을 말하지 않았으므로 AI가 적어 낸 예산은 채택하지 않습니다.
    expect(result.profile.budget).toBeNull();
    expect(result.topCategories.map((c) => c.key)).not.toContain("not_a_key");
    // 입력하지 않은 키워드에 대한 해석은 버립니다.
    expect(result.keywordInsights.map((i) => i.input)).toEqual(["선물"]);
    for (const k of TASTE_KEYS) {
      expect(result.profile.categories[k]).toBeGreaterThanOrEqual(0);
      expect(result.profile.categories[k]).toBeLessThanOrEqual(1);
    }
  });

  it("사용자가 말한 예산은 규칙 파싱 값을 우선한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(geminiBody({ ...validPreference, context: { ...validPreference.context, budget_max: 500000 } }))),
    );
    const { GeminiProvider } = await import("@/lib/providers/ai/GeminiProvider");
    const provider = new GeminiProvider("test-key-1234567890abcdefgh", "gemini-flash-latest");
    const messages: ChatMessage[] = [INTERVIEW_GREETING, { role: "user", text: "친구 생일 선물, 2만원 정도로 찾고 있어요" }];
    const result = await provider.analyzePreferences({ mode: "chat", messages, keywords: [], known: extractSlots(messages) });
    expect(result.profile.budget?.max).toBe(20000);
  });

  it("잘못된 응답(JSON 아님)은 오류로 처리한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ candidates: [{ content: { parts: [{ text: "죄송해요, JSON을 만들 수 없어요" }] }, finishReason: "STOP" }] })),
    );
    const { GeminiProvider } = await import("@/lib/providers/ai/GeminiProvider");
    const provider = new GeminiProvider("test-key-1234567890abcdefgh", "gemini-flash-latest");
    await expect(provider.analyzePreferences({ mode: "keywords", messages: [], keywords: ["선물"], known: extractSlots([]) })).rejects.toThrow();
  });

  it("추천 이유는 요청한 점포 id만, 위험한 표현은 빼고 돌려준다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          geminiBody({
            reasons: [
              { store_id: "dj-001", reason: "선물하기 좋은 품목을 다뤄요." },
              { store_id: "dj-002", reason: "전화 042-123-4567로 문의하세요." },
              { store_id: "dj-003", reason: "대전 최초·유일한 원조 맛집이에요." },
              { store_id: "dj-999", reason: "요청하지 않은 점포" },
            ],
          }),
        ),
      ),
    );
    const { GeminiProvider } = await import("@/lib/providers/ai/GeminiProvider");
    const provider = new GeminiProvider("test-key-1234567890abcdefgh", "gemini-flash-latest");
    const reasons = await provider.generateReasons({
      personaLabel: null,
      summary: null,
      intentLabel: null,
      userTop: [{ key: "gift", score: 0.9 }],
      stores: ["dj-001", "dj-002", "dj-003", "dj-004"].map((id) => ({
        id,
        name: id,
        storeType: "잡화·악세서리",
        entityLabel: "점포",
        category: "주거·생활 > 생활용품",
        confirmedItems: ["잡화"],
        matchedTastes: ["gift"],
        locationNote: "",
      })),
    });
    expect(Object.keys(reasons)).toEqual(["dj-001"]);
  });

  it("키가 잘못되면 fallback으로 데모 AI 결과를 돌려준다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "invalid-key-1234567890abcdef");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }, 400),
      ),
    );
    const { analyzePreferencesWithFallback } = await import("@/lib/providers/ai");
    const res = await analyzePreferencesWithFallback({ mode: "keywords", messages: [], keywords: ["커피", "빈티지"], known: extractSlots([]) });
    expect(res.provider).toBe("mock");
    expect(res.fallbackReason).toContain("API 키");
    expect(res.result.profile.categories.coffee).toBeGreaterThan(0.5);
  });
});

describe("AI 인터뷰", () => {
  it("MockGeminiProvider는 아직 모르는 항목을 물어보고, 충분히 들으면 끝낸다", async () => {
    const { MockGeminiProvider } = await import("@/lib/providers/ai/MockGeminiProvider");
    const provider = new MockGeminiProvider();
    const first = await provider.interviewTurn(interviewInput([INTERVIEW_GREETING, { role: "user", text: "친구 생일 선물을 찾고 있어요" }]));
    expect(first.reply.length).toBeGreaterThan(0);
    expect(first.done).toBe(false);

    const messages: ChatMessage[] = [
      INTERVIEW_GREETING,
      { role: "user", text: "친구 생일 선물을 찾고 있어요" },
      { role: "assistant", text: first.reply },
      { role: "user", text: "2만원 정도요" },
      { role: "assistant", text: "어떤 스타일이 좋으세요?" },
      { role: "user", text: "대전에서만 볼 수 있는 독특한 상품이 좋아요" },
      { role: "assistant", text: "누구와 함께 가시나요?" },
      { role: "user", text: "친구랑 같이 가요" },
      { role: "assistant", text: "마지막으로 더 알려주실 게 있을까요?" },
      { role: "user", text: "없어요" },
    ];
    const last = await provider.interviewTurn(interviewInput(messages));
    expect(last.done).toBe(true);
  });

  it("규칙 파서가 예산·동행·목적을 뽑아낸다", async () => {
    const slots = extractSlots([
      INTERVIEW_GREETING,
      { role: "user", text: "친구 생일 선물을 찾고 있어요" },
      { role: "assistant", text: "예산은 어느 정도 생각하고 계세요?" },
      { role: "user", text: "2만원 정도요" },
    ]);
    expect(slots.budget?.max).toBe(20000);
    expect(slots.intent).toBe("birthday_gift");
    expect(slots.companion).toBe("friend");
  });

  it("Gemini가 이미 답한 것을 또 묻거나 너무 일찍 끝내려 하면 서버 규칙이 이긴다", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key-1234567890abcdefgh");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(geminiBody({ reply: "충분히 들었어요!", next_slot: null, done: true, suggestions: [], extracted: { looking_for: null, intent: null, intent_label: null, companion: null, occasion: null, preferred_style: [], discovery_preference: null } })),
      ),
    );
    const { runInterviewTurn } = await import("@/lib/services/preferenceService");
    const turn = await runInterviewTurn([INTERVIEW_GREETING, { role: "user", text: "선물 찾고 있어요" }]);
    // 답변이 1개뿐이므로 종료하지 않고 규칙 질문으로 되돌립니다.
    expect(turn.done).toBe(false);
    expect(turn.provider).toBe("rule");
  });
});

describe("상인 AI 홍보 도우미", () => {
  it("원본 품목만 confirmed로 두고 확인할 수 없는 단정 표현은 제거한다", async () => {
    const { sanitizePromo, isSafePromoText } = await import("@/lib/merchant/promo");
    const cleaned = sanitizePromo(
      {
        interestSummary: "선물 취향 손님이 많아요.",
        conversionInsight: "30% 할인 행사를 하세요.",
        displayIdeas: [
          { title: "건어물 선물 세트", detail: "건어물을 소포장해 보세요.", basis: "confirmed", items: ["건어물"] },
          { title: "40년 전통 강조", detail: "40년 전통을 앞세워 보세요.", basis: "idea", items: [] },
          { title: "커피 사이드 메뉴", detail: "커피를 함께 팔아 보세요.", basis: "confirmed", items: ["커피"] },
        ],
        keywords: ["#대전중앙시장", "선물추천", "###"],
        snsCopy: "042-123-4567로 문의하세요",
        eventIdeas: [{ title: "주말 이벤트", detail: "주말 방문 손님께 안내해 보세요." }],
      },
      ["건어물", "반찬"],
    );
    expect(cleaned.conversionInsight).not.toContain("30%");
    expect(cleaned.displayIdeas.map((i) => i.title)).not.toContain("40년 전통 강조");
    expect(cleaned.displayIdeas.find((i) => i.title === "건어물 선물 세트")?.basis).toBe("confirmed");
    // 원본 품목에 없는 '커피'는 아이디어로 강등됩니다.
    expect(cleaned.displayIdeas.find((i) => i.title === "커피 사이드 메뉴")?.basis).toBe("idea");
    expect(cleaned.snsCopy).toBe("");
    expect(cleaned.keywords).toContain("#선물추천");
    expect(isSafePromoText("평점 4.9의 맛집")).toBe(false);
  });

  it("템플릿 초안도 같은 규칙을 지킨다", async () => {
    const { templatePromo } = await import("@/lib/merchant/promo");
    const draft = templatePromo({
      store: { id: "dj-001", name: "테스트상회", category: "식품·요리 > 건어물·반찬", entityLabel: "점포", confirmedItems: ["건어물", "반찬"], locationNote: "" },
      period: "최근 7일",
      interestTop: [
        { key: "gift", label: "선물", share: 27 },
        { key: "local", label: "로컬", share: 21 },
      ],
      lowConversion: [{ key: "gift", label: "선물", interestShare: 27, visitShare: 12 }],
      metrics: { interestUsers: 120, visits: 40, likes: 10, saves: 6 },
    });
    expect(draft.interestSummary).toContain("테스트상회");
    expect(draft.displayIdeas[0]?.basis).toBe("confirmed");
    expect(draft.keywords).toContain("#대전중앙시장");
    for (const text of [draft.interestSummary, draft.conversionInsight, draft.snsCopy, ...draft.displayIdeas.map((i) => `${i.title} ${i.detail}`)]) {
      expect(text).not.toMatch(/\d+\s*%\s*(할인|세일)/);
      expect(text).not.toMatch(/원조|유일한|최초/);
    }
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

describe("행동 이력 병합", () => {
  it("서버에 기록된 좋아요·관심 없음과 조회수를 브라우저 상태에 합친다", async () => {
    const { mergeInteractionState, feedbackFromState } = await import("@/lib/services/recommendationService");
    const events = [
      { storeId: "dj-001", type: "like" as const, active: true, createdAt: "2026-09-01T00:00:00Z" },
      { storeId: "dj-002", type: "dismiss" as const, active: true, createdAt: "2026-09-01T00:00:00Z" },
      { storeId: "dj-003", type: "bookmark" as const, active: true, createdAt: "2026-09-01T00:00:00Z" },
      { storeId: "dj-003", type: "bookmark" as const, active: false, createdAt: "2026-09-02T00:00:00Z" },
      { storeId: "dj-004", type: "view" as const, active: true, createdAt: "2026-09-02T00:00:00Z" },
      { storeId: "dj-004", type: "view" as const, active: true, createdAt: "2026-09-03T00:00:00Z" },
    ];
    const merged = mergeInteractionState({ liked: ["dj-005"], bookmarked: [], visited: [], dismissed: [] }, events);
    expect(merged.liked.sort()).toEqual(["dj-001", "dj-005"]);
    expect(merged.dismissed).toEqual(["dj-002"]);
    expect(merged.bookmarked).toEqual([]);
    const feedback = feedbackFromState(merged, events);
    expect(feedback["dj-001"]).toBe(0.5);
    expect(feedback["dj-002"]).toBe(-1);
    expect(feedback["dj-004"]).toBeCloseTo(0.1);
  });
});

describe("점포 소개 (템플릿)", () => {
  it("원본 데이터에 있는 분류·품목만 쓰고 숫자·단정 표현을 쓰지 않는다", async () => {
    const { templateStoreDescription } = await import("@/lib/stores/description");
    const text = templateStoreDescription({
      id: "dj-1000",
      name: "테스트상회",
      storeType: "그릇·주방용품",
      entityLabel: "점포",
      category: "주거·생활 > 그릇·주방용품",
      confirmedItems: ["그릇", "주방용품", "냄비"],
      marketHighlights: ["로컬 체험"],
      locationNote: "",
    });
    expect(text).toContain("테스트상회는 '그릇·주방용품·냄비'를 다루는 점포예요.");
    expect(text).toContain("공식 점포 목록의 분류는 주거·생활 > 그릇·주방용품이에요.");
    expect(text).toContain("로컬 체험");
    const vendor = templateStoreDescription({
      id: "dj-1001",
      name: "옷(노점)",
      storeType: "여성복",
      entityLabel: "노점",
      category: "의류·패션 > 여성복",
      confirmedItems: ["여성복"],
      marketHighlights: [],
      locationNote: "",
    });
    expect(vendor).toBe("옷(노점)은 '여성복'을 다루는 노점이에요. 공식 점포 목록의 분류는 의류·패션 > 여성복이에요.");
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/최고|유일|원조/);
  });
});
