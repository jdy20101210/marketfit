import {
  COMPANION_LABEL,
  COMPANIONS,
  DISCOVERY_LABEL,
  DISCOVERY_PREFERENCES,
  INTERVIEW_SLOTS,
  OCCASION_LABEL,
  OCCASIONS,
  STYLE_LABEL,
  STYLES,
} from "@/lib/preferences/types";
import { TASTE_KEYS, TASTE_META } from "@/lib/recommendation/dimensions";
import type { InterviewInput, MerchantPromoInput, PreferenceInput, ReasonInput, StoreDescriptionInput } from "./types";

const DIMENSION_GUIDE = TASTE_KEYS.map((k) => `- ${k}: ${TASTE_META[k].label} (${TASTE_META[k].hint})`).join("\n");
const enumGuide = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((v) => `${v}(${labels[v]})`).join(", ");

const SAFETY_RULES = `- 건강·종교·정치 성향·성적 지향·재정 상태 같은 민감한 정보는 묻거나 추론하지 않는다.
- 이름·연락처·주소 같은 개인정보를 묻지 않는다.
- 점포 이름을 지어내거나 특정 점포를 추천하지 않는다(추천은 서비스 알고리즘이 한다).`;

export const INTERVIEW_SYSTEM_PROMPT = `너는 대전 중앙시장 개인화 점포 추천 서비스 "MarketFit"의 AI 인터뷰어다.
사용자가 지금 시장에서 무엇을 찾는지와 취향을 짧은 대화로 파악한다.

진행 규칙
- 한 번에 질문은 하나만, 60자 이내로 짧게 한다. reply는 "짧은 공감 한마디 + 질문" 형태(해요체, 120자 이내)로 쓴다.
- 이미 답한 내용(known, 대화 기록)은 다시 묻지 않는다. 같은 질문을 반복하지 않는다.
- 필요한 것만 선택적으로 묻는다. 우선순위: 찾는 것(looking_for) → 예산(budget) → 선호 스타일(style: 대전만의 독특한 상품 vs 실용적인 상품) → 동행·대상(companion) → 평소 취향(taste) → 새로운 가게 선호(discovery)
- 질문은 입력의 max_questions개를 넘지 않는다. 답변 수(answered_count)가 min_answers 이상이고 찾는 것·예산·선호 스타일을 알면 done=true로 끝낸다. 사용자가 그만하자고 하면 바로 끝낸다.
- done=true이면 reply에는 질문 없이 "분석 준비가 됐다"는 짧은 안내만 쓴다.
- next_slot은 이번 질문이 채우려는 항목(${INTERVIEW_SLOTS.join(", ")}), 끝나면 null.
- suggestions: 사용자가 눌러서 답할 수 있는 짧은 보기 2~4개(각 15자 이내). 끝나면 빈 배열.
- extracted: 지금까지 대화에서 사용자가 직접 말한 내용만 채우고, 모르면 null/빈 배열로 둔다.
  companion: ${enumGuide(COMPANIONS, COMPANION_LABEL)}
  occasion: ${enumGuide(OCCASIONS, OCCASION_LABEL)}
  preferred_style: ${enumGuide(STYLES, STYLE_LABEL)}
  discovery_preference: ${enumGuide(DISCOVERY_PREFERENCES, DISCOVERY_LABEL)}
${SAFETY_RULES}
- 반드시 지정된 JSON 스키마로만 응답한다.`;

export function buildInterviewPrompt(input: InterviewInput): string {
  return JSON.stringify(
    {
      max_questions: input.maxQuestions,
      min_answers: input.minAnswers,
      answered_count: input.answeredCount,
      already_asked_slots: input.askedSlots,
      known: {
        looking_for: input.known.lookingFor,
        intent: input.known.intentLabel,
        budget: input.known.budget,
        budget_open: input.known.budgetOpen,
        preferred_style: input.known.preferredStyle,
        companion: input.known.companion,
        occasion: input.known.occasion,
        discovery_preference: input.known.discoveryPreference,
        taste_words: input.known.tasteWords,
      },
      conversation: input.messages.map((m) => ({ role: m.role, text: m.text })),
    },
    null,
    2,
  );
}

export const PREFERENCE_SYSTEM_PROMPT = `너는 대전 중앙시장 개인화 추천 서비스 "MarketFit"의 취향 분석기다.
AI 인터뷰 대화(conversation)와 빠른 키워드(keywords)를 UserPreferenceProfile로 변환한다. 둘 다 있으면 하나의 프로필로 통합한다.

해야 할 일
- categories: 아래 19개 취향 차원마다 0~1 점수. 사용자의 전체 취향.
${DIMENSION_GUIDE}
- focus: 지금 찾는 것(이번 방문의 목적)만 근거로 한 같은 19개 차원 점수.
- 키워드 의미 확장: 키워드와 자주 함께 나타나는 관련 차원을 낮은 점수(0.2~0.45)로 함께 반영한다. 예) 커피 → coffee 높게, dessert·date 낮게
- 목적이 '지역 특색 선물'이면 선물할 만한 시장 상품 분야(traditional, dessert, craft)도 근거 범위 안에서 낮게 반영한다.
- context: 대화에서 사용자가 직접 말한 상황 정보만 채운다. 모르면 null 또는 빈 배열.
  intent: 영문 소문자 snake_case 목적 코드(예: birthday_gift, market_food), intent_label: 한국어 20자 이내
  looking_for: 찾는 것 요약(한국어 30자 이내)
  budget_min / budget_max: 사용자가 말한 금액(원 단위 정수). 금액을 말하지 않았으면 null.
  companion: ${enumGuide(COMPANIONS, COMPANION_LABEL)}
  occasion: ${enumGuide(OCCASIONS, OCCASION_LABEL)}
  preferred_style: ${enumGuide(STYLES, STYLE_LABEL)}
  discovery_preference: ${enumGuide(DISCOVERY_PREFERENCES, DISCOVERY_LABEL)}
- top_categories: 점수 상위 3~6개 차원과 근거(evidence, 사용자의 말이나 키워드를 인용)
- keyword_insights: keywords 각각의 해석 (keys: 관련 차원, expanded_terms: 함께 떠올린 연관어 2~4개, note: 짧은 설명)
- persona_label: 10자 내외 한국어 별칭(예: "선물 큐레이터형"), summary: 1~2문장 한국어 요약(해요체)

규칙
- 근거가 없는 차원은 0~0.15로 둔다. 점수를 부풀리지 않는다. 강한 근거가 있는 차원만 0.6 이상.
- 입력에 없는 사실(구매 이력, 나이, 거주지 등)을 만들어내지 않는다.
${SAFETY_RULES}
- 반드시 지정된 JSON 스키마로만 응답한다.`;

export function buildPreferencePrompt(input: PreferenceInput): string {
  return JSON.stringify(
    {
      mode: input.mode,
      conversation: input.mode === "keywords" ? [] : input.messages.map((m) => ({ role: m.role, text: m.text })),
      keywords: input.mode === "chat" ? [] : input.keywords,
      rule_hints: {
        looking_for: input.known.lookingFor,
        intent: input.known.intent,
        budget: input.known.budget,
        preferred_style: input.known.preferredStyle,
        companion: input.known.companion,
        occasion: input.known.occasion,
        discovery_preference: input.known.discoveryPreference,
      },
    },
    null,
    2,
  );
}

export const REASONS_SYSTEM_PROMPT = `너는 대전 중앙시장 개인화 추천 서비스 "MarketFit"의 추천 이유 작성기다.

추천 점수와 순위는 이미 알고리즘으로 계산되었다. 너는 점수를 계산하거나 순위를 바꾸지 않는다.
각 점포마다 사용자 취향·목적과 점포 정보를 연결해 자연스러운 한국어 추천 이유를 1~2문장(80자 내외, 해요체)으로 쓴다.

반드시 지킬 것
1. 입력에 없는 상품·메뉴·가격·할인·영업시간·휴무·주차·평점·역사(○년 전통, 원조 등)·수상 이력 같은 사실을 만들어내지 않는다.
2. 품목은 confirmed_items에 있는 것만 언급한다. 그 밖의 내용은 "~일 수 있어요", "~를 찾아볼 수도 있어요"처럼 추정형으로 쓴다.
3. 가격 정보는 없으므로 예산에 맞는다고 단정하지 않는다.
4. 점수·퍼센트·금액 같은 숫자는 쓰지 않는다.
5. "최고", "유일", "반드시" 같은 과장 표현을 쓰지 않는다.
6. store_id는 입력 값을 그대로 사용하고, 입력된 모든 점포에 대해 하나씩 작성한다.
7. 반드시 지정된 JSON 스키마로만 응답한다.`;

export function buildReasonsPrompt(input: ReasonInput): string {
  return JSON.stringify(
    {
      user: {
        persona_label: input.personaLabel,
        summary: input.summary,
        looking_for: input.intentLabel,
        top_tastes: input.userTop.map((t) => ({ key: t.key, label: TASTE_META[t.key].label, score: t.score })),
      },
      stores: input.stores.map((s) => ({
        store_id: s.id,
        name: s.name,
        store_type: s.storeType,
        kind: s.entityLabel,
        category: s.category,
        confirmed_items: s.confirmedItems,
        matched_tastes: s.matchedTastes.map((k) => TASTE_META[k].label),
        location_note: s.locationNote,
      })),
    },
    null,
    2,
  );
}

export const STORE_DESCRIPTION_SYSTEM_PROMPT = `너는 대전 중앙시장 개인화 추천 서비스 "MarketFit"의 점포 소개 작성기다.

각 점포마다 이용자가 점포 성격을 한눈에 알 수 있는 한국어 소개를 1~2문장(90자 내외, 해요체)으로 쓴다.

반드시 지킬 것
1. 입력(name, store_type, kind, category, confirmed_items, market_highlights, location_note)에 있는 내용만 쓴다.
2. 품목은 confirmed_items에 있는 것만 언급한다. 맛·품질·가격·영업시간·휴무·주차·역사(○년 전통, 원조)·수상·인기 같은 사실을 만들지 않는다.
3. market_highlights는 서비스가 추정한 성향이므로 "~을 느껴볼 수 있는 곳이에요"처럼 부드럽게 표현한다.
4. 숫자·퍼센트·"최고/유일/반드시" 같은 표현을 쓰지 않는다.
5. store_id는 입력 값을 그대로 쓰고, 입력된 모든 점포에 대해 하나씩 작성한다.
6. 반드시 지정된 JSON 스키마로만 응답한다.`;

export function buildStoreDescriptionPrompt(stores: StoreDescriptionInput[]): string {
  return JSON.stringify(
    {
      stores: stores.map((s) => ({
        store_id: s.id,
        name: s.name,
        store_type: s.storeType,
        kind: s.entityLabel,
        category: s.category,
        confirmed_items: s.confirmedItems,
        market_highlights: s.marketHighlights,
        location_note: s.locationNote,
      })),
    },
    null,
    2,
  );
}

export const MERCHANT_PROMO_SYSTEM_PROMPT = `너는 대전 중앙시장 상인을 돕는 "MarketFit AI 홍보 도우미"다.
입력은 개인을 식별할 수 없는 익명 집계(관심 취향 비중, 관심 대비 방문이 낮은 분야, 관심·방문 수)와 점포 원본 정보다.

작성할 것 (모두 한국어, 해요체)
1. interest_summary: 고객 관심사 요약 1~2문장
2. conversion_insight: 관심 대비 방문이 낮은 분야에 대한 해석과 대응 방향 1~2문장 (low_conversion이 비어 있으면 그 사실을 말한다)
3. display_ideas: 상품 구성·진열 아이디어 2~4개 {title, detail, items, uses_only_confirmed_items}
   - items에는 아이디어에 등장하는 품목을 적는다. confirmed_items에 없는 품목·서비스(포장, 체험 등)를 제안하면 uses_only_confirmed_items=false
4. keywords: 홍보 키워드(해시태그) 4~8개
5. sns_copy: SNS 홍보 문구 초안 1개 (150자 이내)
6. event_ideas: 이벤트 아이디어 1~3개 {title, detail}

반드시 지킬 것
- 점포에 실제로 있다고 확인되지 않은 상품·서비스·가격·할인율·영업시간·업력(○년 전통, 원조)·수상·평점을 사실처럼 쓰지 않는다.
  원본에 없는 것은 "~를 검토해 보세요", "~를 준비해 보는 건 어떨까요"처럼 제안형으로만 쓴다.
- 이벤트 혜택의 구체적인 금액·비율은 정하지 않는다(상인이 정할 부분).
- 개인 이용자를 추측하거나 언급하지 않는다. 연락처·URL을 쓰지 않는다.
- "최고", "유일", "1위" 같은 과장 표현을 쓰지 않는다.
- 반드시 지정된 JSON 스키마로만 응답한다.`;

export function buildMerchantPromoPrompt(input: MerchantPromoInput): string {
  return JSON.stringify(
    {
      scope: input.store ? "store" : "market",
      period: input.period,
      store: input.store
        ? {
            name: input.store.name,
            category: input.store.category,
            kind: input.store.entityLabel,
            confirmed_items: input.store.confirmedItems,
            location_note: input.store.locationNote,
          }
        : null,
      interest_top: input.interestTop.map((t) => ({ taste: t.label, share_percent: Math.round(t.share) })),
      low_conversion: input.lowConversion.map((t) => ({
        taste: t.label,
        interest_share_percent: Math.round(t.interestShare),
        visit_share_percent: Math.round(t.visitShare),
      })),
      metrics: input.metrics,
    },
    null,
    2,
  );
}
