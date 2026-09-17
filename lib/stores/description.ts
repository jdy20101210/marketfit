/**
 * 점포 소개 문장 — 원본 데이터(엑셀)와 추정 성향 라벨만 사용합니다.
 * Gemini가 설정되면 관리자 화면에서 AI 소개를 생성할 수 있고, 없거나 실패하면 이 템플릿을 씁니다.
 */
import type { StoreDescriptionInput } from "@/lib/providers/ai/types";
import { josa } from "@/lib/recommendation/reasons";
import { displayCategory, ENTITY_KIND_LABEL } from "./parse";
import { MARKET_FEATURE_KEYS, MARKET_FEATURE_META, type Store } from "./types";

export function categoryPath(main: string, sub: string): string {
  return `${displayCategory(main)} > ${displayCategory(sub)}`;
}

export function storeDescriptionInput(store: Store): StoreDescriptionInput {
  const highlights = MARKET_FEATURE_KEYS.filter((k) => (store.features.market[k] ?? 0) >= 0.75)
    .sort((a, b) => (store.features.market[b] ?? 0) - (store.features.market[a] ?? 0))
    .map((k) => MARKET_FEATURE_META[k].label);
  return {
    id: store.id,
    name: store.name,
    storeType: store.storeType,
    entityLabel: ENTITY_KIND_LABEL[store.entityKind],
    category: categoryPath(store.mainCategory, store.subCategory),
    confirmedItems: store.features.productHints,
    marketHighlights: highlights,
    locationNote: store.addressDetail ?? store.zone ?? store.addressRaw,
  };
}

export function templateStoreDescription(s: StoreDescriptionInput): string {
  const items = s.confirmedItems.slice(0, 4);
  const itemText = items.length ? `'${items.join("·")}'` : `'${s.category.split(" > ").at(-1) ?? s.category}'`;
  const lead = `${josa(s.name, "은", "는")} ${josa(itemText, "을", "를")} 다루는 ${josa(s.entityLabel, "이에요", "예요")}.`;
  const category = ` 공식 점포 목록의 분류는 ${josa(s.category, "이에요", "예요")}.`;
  const highlight = s.marketHighlights.length
    ? ` MarketFit은 이곳을 중앙시장의 ${s.marketHighlights.slice(0, 2).join("·")} 요소가 두드러진 곳으로 분류했어요.`
    : "";
  return `${lead}${category}${highlight}`;
}
