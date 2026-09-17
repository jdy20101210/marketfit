import { TASTE_KEYS, TASTE_META } from "@/lib/recommendation/dimensions";
import type { ProfileAnalysisInput, ReasonInput, StoreDescriptionInput } from "./types";

const DIMENSION_GUIDE = TASTE_KEYS.map((k) => `- ${k}: ${TASTE_META[k].label} (${TASTE_META[k].hint})`).join("\n");

export const PROFILE_SYSTEM_PROMPT = `너는 대전 중앙시장 개인화 추천 서비스 "MarketFit"의 취향 분석기다.

입력
1) instagram: Instagram 공식 API(또는 데모 데이터)에서 얻은 관심 키워드와 점수, 본인 게시물 캡션 일부
2) items: 사용자가 직접 입력한 "요즘 관심 있는 상품" 목록

해야 할 일
- 아래 17개 취향 차원마다 0~1 점수를 매긴다.
${DIMENSION_GUIDE}
- taste_vector: 두 입력을 모두 반영한 전체 취향
- recent_vector: items(직접 입력 상품)만 근거로 한 최근 관심. items가 비어 있으면 taste_vector와 같게 둔다.
- top_categories: 점수 상위 3~6개 차원과 근거(evidence). 근거에는 입력 키워드를 그대로 인용한다.
- item_insights: items의 각 상품이 어떤 차원과 연결되는지(keys)와 짧은 설명(note)
- persona_label: 10자 내외 한국어 별칭 (예: "감성 캠퍼형")
- summary: 사용자에게 보여줄 1~2문장 요약 (해요체)

규칙
- 입력에 근거가 없는 차원은 0~0.15로 둔다. 점수를 부풀리지 않는다.
- 강한 근거가 있는 차원만 0.6 이상으로 둔다.
- 건강·종교·정치·성적 지향·재정 상태 등 민감한 특성은 추론하거나 언급하지 않는다.
- 입력에 없는 사실(구매 이력, 위치, 나이 등)을 만들어내지 않는다.
- 반드시 지정된 JSON 스키마로만 응답한다.`;

export function buildProfilePrompt(input: ProfileAnalysisInput): string {
  return JSON.stringify(
    {
      instagram: input.instagram
        ? {
            source: input.instagram.mode === "real" ? "instagram_official_api" : "demo_data",
            interests: input.instagram.interests,
            captions_sample: input.instagram.captionsSample,
          }
        : null,
      items: input.items,
    },
    null,
    2,
  );
}

export const REASONS_SYSTEM_PROMPT = `너는 대전 중앙시장 개인화 추천 서비스 "MarketFit"의 추천 이유 작성기다.

추천 점수는 이미 알고리즘으로 계산되었다. 너는 점수를 계산하거나 순위를 바꾸지 않는다.
각 점포마다 사용자 취향과 점포 정보를 연결해 자연스러운 한국어 추천 이유를 1~2문장(80자 내외, 해요체)으로 쓴다.

반드시 지킬 것
1. 입력에 없는 상품·메뉴·가격·할인·영업시간·휴무·주차·평점·역사(○년 전통, 원조 등)·수상 이력 같은 사실을 만들어내지 않는다.
2. 품목은 confirmed_items에 있는 것만 언급한다. 그 밖의 내용은 "~일 수 있어요", "~를 찾아볼 수도 있어요"처럼 추정형으로 쓴다.
3. 점수·퍼센트·숫자는 쓰지 않는다.
4. "최고", "유일", "반드시" 같은 과장 표현을 쓰지 않는다.
5. store_id는 입력 값을 그대로 사용하고, 입력된 모든 점포에 대해 하나씩 작성한다.
6. 반드시 지정된 JSON 스키마로만 응답한다.`;

export function buildReasonsPrompt(input: ReasonInput): string {
  return JSON.stringify(
    {
      user: {
        persona_label: input.personaLabel,
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
