import { afterEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
import { extractSlots } from "@/lib/preferences/extract";
import { INTERVIEW_GREETING, MAX_QUESTIONS, MIN_ANSWERS, type ChatMessage } from "@/lib/preferences/types";

function interviewInput(messages: ChatMessage[]) {
  const known = extractSlots(messages);
  return {
    messages,
    known,
    answeredCount: messages.filter((m) => m.role === "user").length,
    askedSlots: messages.filter((m) => m.role === "assistant" && m.slot).map((m) => m.slot!),
    maxQuestions: MAX_QUESTIONS,
    minAnswers: MIN_ANSWERS,
  };
}

describe("내장 챗봇 엔진 · 취향 분석", () => {
  it("키워드를 취향 vector와 요약으로 바꾼다 (외부 API 호출 없음)", async () => {
    const { BuiltinChatProvider } = await import("@/lib/providers/ai/BuiltinChatProvider");
    const provider = new BuiltinChatProvider();
    const draft = await provider.analyzePreferences({ mode: "keywords", messages: [], keywords: ["커피", "빈티지"], known: extractSlots([]) });
    expect(draft.profile.categories.coffee).toBeGreaterThan(0.5);
    expect(draft.profile.categories.vintage).toBeGreaterThan(0.5);
    expect(draft.profile.summary.length).toBeGreaterThan(0);
    expect(draft.topCategories.length).toBeGreaterThan(0);
    for (const value of Object.values(draft.profile.categories)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("대화에서 예산·목적을 읽어 같은 구조의 profile을 만든다", async () => {
    const { BuiltinChatProvider } = await import("@/lib/providers/ai/BuiltinChatProvider");
    const messages: ChatMessage[] = [
      INTERVIEW_GREETING,
      { role: "user", text: "친구 생일 선물을 찾고 있어요" },
      { role: "assistant", text: "예산은 어느 정도 생각하고 계세요?" },
      { role: "user", text: "2만원 정도요" },
      { role: "assistant", text: "대전만의 상품과 실용적인 상품 중 어느 쪽이 좋으세요?" },
      { role: "user", text: "대전에서만 볼 수 있는 독특한 상품이 좋아요" },
    ];
    const draft = await new BuiltinChatProvider().analyzePreferences({ mode: "chat", messages, keywords: [], known: extractSlots(messages) });
    expect(draft.profile.budget?.max).toBe(20000);
    expect(draft.profile.intent).toBe("birthday_gift");
    expect(draft.profile.categories.gift).toBeGreaterThan(0.5);
  });

  it("같은 입력이면 항상 같은 결과가 나온다 (재현 가능)", async () => {
    const { BuiltinChatProvider } = await import("@/lib/providers/ai/BuiltinChatProvider");
    const provider = new BuiltinChatProvider();
    const input = { mode: "keywords" as const, messages: [], keywords: ["캠핑", "선물"], known: extractSlots([]) };
    const a = await provider.analyzePreferences(input);
    const b = await provider.analyzePreferences(input);
    expect(a.profile.categories).toEqual(b.profile.categories);
    expect(a.personaLabel).toBe(b.personaLabel);
  });
});

describe("AI 인터뷰", () => {
  it("아직 모르는 항목을 물어보고, 충분히 들으면 끝낸다", async () => {
    const { BuiltinChatProvider } = await import("@/lib/providers/ai/BuiltinChatProvider");
    const provider = new BuiltinChatProvider();
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

  it("질문 수 한도 안에서 최소 답변을 채우기 전에는 끝내지 않는다", async () => {
    const { runInterviewTurn } = await import("@/lib/services/preferenceService");
    const turn = await runInterviewTurn([INTERVIEW_GREETING, { role: "user", text: "선물 찾고 있어요" }]);
    expect(turn.done).toBe(false);
    expect(turn.provider).toBe("builtin");
    expect(turn.questionCount).toBeLessThanOrEqual(MAX_QUESTIONS);
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
