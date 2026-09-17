/**
 * 상인 AI 홍보 도우미 — 템플릿 초안(Mock)과 AI 응답 검증 (서버/테스트 공용)
 * 원칙: 원본 품목에 없는 상품·서비스는 '아이디어'로만 표시하고, 확인할 수 없는 사실(가격·할인율·업력·연락처)은 쓰지 않습니다.
 */
import type { TasteKey } from "@/lib/recommendation/dimensions";
import type { MerchantPromoDraft, MerchantPromoInput, PromoIdea } from "@/lib/providers/ai/types";

const IDEA_TEMPLATES: Partial<Record<TasteKey, { title: string; detail: string }>> = {
  gift: { title: "선물용 소포장 구성", detail: "많이 찾는 품목을 소포장·묶음으로 구성하고 '선물 추천' 안내판을 붙여 보세요." },
  price_sensitive: { title: "가격대별 추천 묶음", detail: "1만원·2만원 이하처럼 가격대별 추천 묶음을 만들어 예산이 정해진 손님이 고르기 쉽게 해 보세요." },
  local: { title: "대전·중앙시장 이야기 안내", detail: "점포가 자리한 시장 구역과 대표 품목을 짧게 소개하는 안내문으로 지역 특색을 강조해 보세요." },
  discovery: { title: "처음 온 손님용 대표 품목 안내", detail: "처음 방문한 손님이 무엇부터 보면 좋을지 대표 품목 3가지를 골라 앞쪽에 진열해 보세요." },
  traditional: { title: "전통 품목 체험형 진열", detail: "전통 품목의 쓰임새를 알 수 있게 예시 사진이나 설명 카드를 함께 두어 보세요." },
  food: { title: "시장 먹거리 맛보기 구성", detail: "처음 먹어 보는 손님을 위한 소량·맛보기 구성을 검토해 보세요." },
  dessert: { title: "간식 테이크아웃 구성", detail: "걸어 다니며 먹기 좋은 소포장 간식 구성을 검토해 보세요." },
  coffee: { title: "시장 산책 음료 안내", detail: "시장 구경 동선에 맞춘 음료 추천 안내를 붙여 보세요." },
  camping: { title: "캠핑·야외 활용 제안", detail: "판매 품목 중 야외에서 쓸 만한 것을 골라 캠핑 활용법을 함께 소개해 보세요." },
  vintage: { title: "레트로 감성 진열", detail: "오래된 느낌을 살린 진열과 사진 찍기 좋은 공간을 만들어 보세요." },
  family: { title: "가족 단위 구성", detail: "가족이 함께 쓰거나 나눠 먹기 좋은 구성으로 묶어 보세요." },
  date: { title: "2인 구성 제안", detail: "커플·친구가 함께 고르기 좋은 2인 구성을 제안해 보세요." },
  practical: { title: "실속 생활 묶음", detail: "자주 쓰는 품목을 모아 실속 묶음으로 안내해 보세요." },
  fashion: { title: "코디 제안 진열", detail: "상의·하의·소품을 함께 걸어 코디 예시를 보여 주세요." },
  accessory: { title: "잡화 코디 추천", detail: "옷과 함께 쓰기 좋은 잡화를 코디 예시로 묶어 보세요." },
  living: { title: "계절 인테리어 제안", detail: "계절에 맞춘 색·소재로 진열을 바꾸고 활용 사진을 함께 보여 주세요." },
  kitchen: { title: "1~2인 가구 주방 구성", detail: "자취·신혼 가구가 처음 살 만한 주방 살림 구성을 안내해 보세요." },
  craft: { title: "만들기 재료 키트", detail: "처음 해 보는 사람도 쓸 수 있는 재료 묶음과 간단한 안내문을 검토해 보세요." },
  travel: { title: "여행객 동선 안내", detail: "대전역·시장 구경 동선에서 들르기 좋은 점포임을 알리는 안내를 붙여 보세요." },
};

const HASHTAG_LABEL: Partial<Record<TasteKey, string>> = {
  gift: "선물추천",
  local: "대전여행",
  discovery: "숨은가게",
  traditional: "전통시장",
  food: "시장먹거리",
  dessert: "시장간식",
  coffee: "시장커피",
  camping: "캠핑용품",
  vintage: "레트로감성",
  family: "가족나들이",
  date: "대전데이트",
  practical: "실속쇼핑",
  price_sensitive: "가성비쇼핑",
  fashion: "시장패션",
  accessory: "잡화쇼핑",
  living: "집꾸미기",
  kitchen: "주방살림",
  craft: "핸드메이드",
  travel: "대전나들이",
};

const pct = (n: number) => `${Math.round(n)}%`;

export function templatePromo(input: MerchantPromoInput): MerchantPromoDraft {
  const scope = input.store ? `'${input.store.name}'` : "중앙시장 전체";
  const top = input.interestTop.slice(0, 3);
  const interestSummary = top.length
    ? `${input.period} ${scope}에 관심을 보인 이용자는 ${top.map((t) => `${t.label}(${pct(t.share)})`).join("·")} 취향이 많았어요.`
    : `${input.period} ${scope}에 대한 관심 데이터가 아직 적어요.`;
  const gap = input.lowConversion[0];
  const conversionInsight = gap
    ? `${gap.label} 분야는 관심 비중(${pct(gap.interestShare)})에 비해 방문 비중(${pct(gap.visitShare)})이 낮아요. ${gap.label} 취향 손님이 실제 방문까지 이어지도록 안내를 보강해 보세요.`
    : "관심과 방문 비중이 크게 차이 나는 분야는 없어요. 지금 반응이 좋은 분야를 꾸준히 알리는 것이 좋아요.";

  const items = input.store?.confirmedItems.slice(0, 3) ?? [];
  const displayIdeas: PromoIdea[] = [];
  if (input.store && items.length) {
    displayIdeas.push({
      title: `${items.join("·")} 중심 진열`,
      detail: `원본 점포 목록에 있는 ${items.join("·")}을(를) 입구 쪽에 모아 한눈에 보이게 진열해 보세요.`,
      basis: "confirmed",
      items,
    });
  }
  const keys: TasteKey[] = [...new Set<TasteKey>([...(gap ? [gap.key] : []), ...top.map((t) => t.key)])];
  for (const key of keys) {
    const t = IDEA_TEMPLATES[key];
    if (t && displayIdeas.length < 4) displayIdeas.push({ ...t, basis: "idea", items: [] });
  }

  const keywords = [
    "#대전중앙시장",
    ...(input.store ? [`#${input.store.category.split(" > ").at(-1)!.replace(/[·•\s]/g, "")}`] : ["#대전전통시장"]),
    ...items.slice(0, 2).map((i) => `#${i.replace(/\s/g, "")}`),
    ...top.map((t) => (HASHTAG_LABEL[t.key] ? `#${HASHTAG_LABEL[t.key]}` : null)).filter((v): v is string => Boolean(v)),
  ];

  const snsCopy = input.store
    ? `대전 중앙시장 ${input.store.name}${items.length ? `에서 ${items.join("·")} 구경하고 가세요!` : "에 들러 보세요!"} ${
        top[0] ? `${top[0].label}에 관심 있는 분들께 추천해요.` : ""
      } 이번 주말 시장 나들이 어떠세요?`
    : `이번 주말, 대전 중앙시장에서 ${top.map((t) => t.label).slice(0, 2).join("·") || "시장 구경"}을 즐겨 보세요! 골목마다 다른 가게를 만나는 재미가 있어요.`;

  const eventIdeas = [
    { title: "주말 방문 인증 이벤트", detail: "매장 사진을 SNS에 올린 손님에게 작은 감사 표시를 하는 방식을 검토해 보세요(혜택 내용은 직접 정해야 해요)." },
    ...(top[0] ? [{ title: `${top[0].label} 테마 추천 주간`, detail: `${top[0].label} 취향 손님이 고르기 쉬운 추천 코너를 한 주 동안 운영해 보세요.` }] : []),
  ];

  return sanitizePromo({ interestSummary, conversionInsight, displayIdeas, keywords, snsCopy, eventIdeas }, input.store?.confirmedItems ?? []);
}

/** 확인할 수 없는 사실을 단정하는 표현 (연락처·URL·업력·순위·평점·할인율) */
const FORBIDDEN = [
  /\d{2,4}-\d{3,4}-\d{4}/,
  /https?:\/\//i,
  /\d+\s*(년|대째|주년)\s*(전통|역사|째)/,
  /원조|유일한|최초|최고의|1위|넘버원/,
  /평점|별점|리뷰\s*\d/,
  /\d+\s*%\s*(할인|세일|off)/i,
];

const clean = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

export function isSafePromoText(text: string): boolean {
  return !FORBIDDEN.some((re) => re.test(text));
}

/**
 * AI·템플릿 초안 검증
 * - 아이디어가 원본 품목만 언급하면 confirmed, 아니면 idea로 표시
 * - 확인할 수 없는 사실을 단정하는 문장은 제외
 */
export function sanitizePromo(draft: MerchantPromoDraft, confirmedItems: string[]): MerchantPromoDraft {
  const confirmed = new Set(confirmedItems.map((i) => i.replace(/\s/g, "")));
  const displayIdeas = draft.displayIdeas
    .filter((i) => i.title.trim() && isSafePromoText(`${i.title} ${i.detail}`))
    .slice(0, 5)
    .map((i) => {
      const items = [...new Set(i.items.map((x) => x.trim()).filter(Boolean))].slice(0, 5);
      const allConfirmed = items.length > 0 && items.every((x) => confirmed.has(x.replace(/\s/g, "")));
      return { title: clean(i.title, 40), detail: clean(i.detail, 160), items, basis: i.basis === "confirmed" && allConfirmed ? "confirmed" : "idea" } as PromoIdea;
    });
  const keywords = [
    ...new Set(
      draft.keywords
        .map((k) => `#${k.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")}`)
        .filter((k) => k.length >= 2 && k.length <= 16),
    ),
  ].slice(0, 8);
  const safe = (text: string, fallback: string, max: number) => (text.trim() && isSafePromoText(text) ? clean(text, max) : fallback);
  return {
    interestSummary: safe(draft.interestSummary, "관심 요약을 만들지 못했어요.", 240),
    conversionInsight: safe(draft.conversionInsight, "관심 대비 방문 분석을 만들지 못했어요.", 240),
    displayIdeas,
    keywords,
    snsCopy: safe(draft.snsCopy, "", 220),
    eventIdeas: draft.eventIdeas
      .filter((e) => e.title.trim() && isSafePromoText(`${e.title} ${e.detail}`))
      .slice(0, 3)
      .map((e) => ({ title: clean(e.title, 40), detail: clean(e.detail, 160) })),
  };
}
