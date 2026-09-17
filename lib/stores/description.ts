/**
 * 점포 소개 문장 — 원본 데이터(엑셀)와 추정 성향 라벨만 사용합니다.
 * Gemini가 설정되면 관리자 화면에서 AI 소개를 생성할 수 있고, 없거나 실패하면 이 템플릿을 씁니다.
 */
import type { StoreDescriptionInput } from "@/lib/providers/ai/types";
import { josa } from "@/lib/recommendation/reasons";
import { ENTITY_KIND_LABEL } from "./parse";
import { MARKET_FEATURE_KEYS, MARKET_FEATURE_META, type Store } from "./types";

export function storeDescriptionInput(store: Store): StoreDescriptionInput {
  const highlights = MARKET_FEATURE_KEYS.filter((k) => (store.features.market[k] ?? 0) >= 0.75)
    .sort((a, b) => (store.features.market[b] ?? 0) - (store.features.market[a] ?? 0))
    .map((k) => MARKET_FEATURE_META[k].label);
  return {
    id: store.id,
    name: store.name,
    storeType: store.storeType,
    entityLabel: ENTITY_KIND_LABEL[store.entityKind],
    category: store.features.primaryCategory,
    confirmedItems: store.features.productHints,
    marketHighlights: highlights,
    locationNote: store.addressDetail ?? store.addressRaw,
  };
}

export function templateStoreDescription(s: StoreDescriptionInput): string {
  if (s.entityLabel === "시장 안내") {
    return `${josa(s.name, "은", "는")} 중앙시장 이용 안내와 문의를 맡는 창구예요. 개인화 추천 대상은 아니에요.`;
  }
  const kind = s.entityLabel === "개별 점포" ? "점포" : s.entityLabel;
  // '의류 노점'처럼 유형 끝에 점포 형태가 붙어 있으면 품목 부분만 씁니다.
  const typeCore = s.storeType.endsWith(` ${kind}`) ? s.storeType.slice(0, -kind.length - 1) : s.storeType;
  const typeText = typeCore === s.name ? s.category : `'${typeCore}'`;
  const lead = `${josa(s.name, "은", "는")} ${josa(typeText, "을", "를")} 다루는 ${josa(kind, "이에요", "예요")}.`;
  const items = s.confirmedItems.filter((i) => !s.storeType.includes(i)).slice(0, 3);
  const itemText = items.length ? ` 원본 자료에 ${items.join("·")} 품목이 함께 적혀 있어요.` : "";
  const highlight = s.marketHighlights.length
    ? ` MarketFit은 이곳을 중앙시장의 ${s.marketHighlights.slice(0, 2).join("·")} 요소가 두드러진 곳으로 분류했어요.`
    : "";
  return `${lead}${itemText}${highlight}`;
}
