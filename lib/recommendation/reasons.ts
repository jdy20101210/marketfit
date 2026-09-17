/**
 * 템플릿 기반 추천 이유 (Gemini 미사용/실패 시 fallback)
 * 원칙: 엑셀 원본의 유형·비고에 있는 품목만 단정적으로 말하고, 나머지는 추정형으로 표현합니다.
 */
import { TASTE_META, type TasteKey } from "./dimensions";
import type { MatchedTaste } from "./engine";

/** 점포 쪽 성향을 표현하는 추정형 문장 (사실을 단정하지 않음) */
const HEDGED_STORE_PHRASE: Record<TasteKey, string> = {
  food: "시장 먹거리를 편하게 즐겨볼 수 있을 거예요.",
  dessert: "가볍게 즐길 간식거리를 만날 수도 있어요.",
  coffee: "홈카페에 어울리는 잔이나 식기를 찾아볼 수도 있어요.",
  fashion: "시장 특유의 옷 구경을 해볼 수 있어요.",
  accessory: "소소한 잡화·소품을 살펴보기 좋아요.",
  living: "집 분위기를 바꿀 리빙 아이템을 찾아볼 수 있어요.",
  kitchen: "요리에 쓸 만한 주방 살림을 둘러보기 좋아요.",
  traditional: "전통적인 분위기의 물건을 만나볼 수 있어요.",
  gift: "선물로 고를 만한 물건이 있을 수 있어요.",
  camping: "캠핑에 활용할 만한 물건이 있을 수도 있어요.",
  travel: "여행 중 들르기 좋은 시장 경험이 될 수 있어요.",
  vintage: "레트로한 시장 감성을 느껴볼 수 있어요.",
  family: "가족과 함께 쓸 생활 물품을 살펴보기 좋아요.",
  date: "함께 둘러보며 시장 나들이를 즐기기 좋아요.",
  practical: "실용적인 생활용품을 둘러보기 좋아요.",
  craft: "직접 만드는 취미에 쓸 재료를 찾아볼 수 있어요.",
  local: "대전 원도심 시장의 로컬 분위기를 느낄 수 있어요.",
};

export interface TemplateReasonInput {
  storeType: string;
  /** 점포/노점/상가/상권 */
  entityNoun: string;
  matchedTastes: MatchedTaste[];
  matchedProducts: string[];
  productHints: string[];
  /** 표시 점수(0~100). 점수가 낮으면 '잘 맞아요'처럼 단정하지 않습니다. */
  score?: number;
}

function subject(storeType: string, noun: string): string {
  return storeType.endsWith(noun) ? `'${storeType}'` : `'${storeType}' ${noun}`;
}

/** 숫자를 한국어로 읽을 때 받침이 있는 끝자리 (영·일·삼·육·칠·팔) */
const DIGIT_WITH_BATCHIM = new Set(["0", "1", "3", "6", "7", "8"]);

/** 마지막 한글 음절(끝이 숫자면 숫자 읽기)의 받침 유무로 조사를 고릅니다. 따옴표·괄호는 건너뜁니다. */
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  const last = [...word].reverse().find((ch) => (ch >= "가" && ch <= "힣") || (ch >= "0" && ch <= "9"));
  if (!last) return word + withoutBatchim;
  const hasBatchim = last >= "0" && last <= "9" ? DIGIT_WITH_BATCHIM.has(last) : (last.charCodeAt(0) - 0xac00) % 28 !== 0;
  return word + (hasBatchim ? withBatchim : withoutBatchim);
}

export function templateReason(input: TemplateReasonInput): string {
  const tastes = input.matchedTastes.slice(0, 2).map((m) => TASTE_META[m.key].short);
  const who = subject(input.storeType, input.entityNoun);
  const score = input.score ?? 100;
  const lead =
    tastes.length === 0
      ? `평소 관심사와는 조금 다른 ${josa(who, "이라서", "라서")} 새로운 발견이 될 수 있어요.`
      : score >= 70
        ? `${tastes.join("·")} 취향과 ${who}의 성격이 잘 맞아요.`
        : score >= 55
          ? `${tastes.join("·")} 취향과 ${who}의 성격이 어느 정도 맞아요.`
          : `${tastes.join("·")} 취향과 일부 겹쳐 가볍게 둘러보기 좋은 ${josa(who, "이에요", "예요")}.`;

  const items = (input.matchedProducts.length ? input.matchedProducts : input.productHints).slice(0, 3);
  if (items.length > 0 && input.matchedProducts.length > 0) {
    return `${lead} ${items.join("·")} 같은 품목을 둘러볼 수 있어요.`;
  }
  const topKey = input.matchedTastes[0]?.key;
  if (topKey) return `${lead} ${HEDGED_STORE_PHRASE[topKey]}`;
  if (items.length > 0) return `${lead} ${items.join("·")} 품목을 취급하는 곳이에요.`;
  return lead;
}

/** 상세 페이지용 "왜 나에게 추천됐나요?" 요약 문장 */
export function matchSummary(matched: MatchedTaste[]): string {
  if (matched.length === 0) return "뚜렷하게 겹치는 취향은 적지만, 새로운 분야를 발견할 수 있는 점포예요.";
  const labels = matched.map((m) => TASTE_META[m.key].short);
  const level = matched[0]!.contribution >= 0.5 ? "높은 수준으로" : "어느 정도";
  return `당신의 ${labels.join("·")} 취향과 이 점포의 특성이 ${level} 일치했어요.`;
}
