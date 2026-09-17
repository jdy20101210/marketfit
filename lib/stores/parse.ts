/**
 * 엑셀 원문 값을 구조화하는 순수 함수 모음 (클라이언트/서버/스크립트 공용).
 * 새 정보를 만들지 않고, 원문에 이미 있는 내용을 분류만 합니다.
 */

export type PhoneStatus = "verified" | "not_found" | "undisclosed" | "unknown";
export type EntityKind = "store" | "street_vendor" | "arcade" | "product_zone" | "association";
export type LocationBasis = "road_address" | "near_road_address" | "market_zone" | "none";

/** 원본 '수집기준_주의사항' 시트에 명시된 중앙시장 활성화구역 공식 대표 주소 */
export const MARKET_REPRESENTATIVE_ADDRESS = "대전광역시 동구 대전로 783";

const PHONE_PATTERN = /^0\d{1,2}-\d{3,4}-\d{4}$/;

export function parsePhone(raw: string): { phone: string | null; status: PhoneStatus } {
  const value = raw.trim();
  if (PHONE_PATTERN.test(value)) return { phone: value, status: "verified" };
  if (value.includes("확인 못함")) return { phone: null, status: "not_found" };
  if (value.includes("미공개")) return { phone: null, status: "undisclosed" };
  return { phone: null, status: "unknown" };
}

const ROAD_ADDRESS_WITH_NUMBER = /(로|길)\s*\d+(-\d+)?$/;

export function parseAddress(raw: string): {
  geocodeQuery: string | null;
  detail: string | null;
  basis: LocationBasis;
} {
  const value = raw.trim();
  if (!value) return { geocodeQuery: null, detail: null, basis: "none" };

  if (value.includes("활성화구역")) {
    // 상인회 등재 상권은 활성화구역 내 위치로만 표기되어 있으므로 대표 주소 기준 '대략적 위치'로만 다룹니다.
    return { geocodeQuery: MARKET_REPRESENTATIVE_ADDRESS, detail: "중앙시장 활성화구역 내 (세부 위치 미확인)", basis: "market_zone" };
  }

  const [main, ...rest] = value.split(",").map((part) => part.trim());
  const detail = rest.length ? rest.join(", ") : null;
  if (!ROAD_ADDRESS_WITH_NUMBER.test(main)) {
    return { geocodeQuery: null, detail: value, basis: "none" };
  }
  const isNearby = detail !== null && /(앞|옆|맞은편|인근)/.test(detail);
  return { geocodeQuery: main, detail, basis: isNearby ? "near_road_address" : "road_address" };
}

export function deriveEntityKind(input: { name: string; storeType: string; source: string; note: string }): EntityKind {
  const { name, storeType, source, note } = input;
  if (storeType.includes("상인회") || storeType.includes("시장 관리")) return "association";
  if (storeType.includes("노점") || note.includes("노점")) return "street_vendor";
  if (name.endsWith("상권")) return "product_zone";
  if (source.includes("상인회")) return "arcade";
  return "store";
}

export const ENTITY_KIND_LABEL: Record<EntityKind, string> = {
  store: "개별 점포",
  street_vendor: "노점",
  arcade: "상가·상권",
  product_zone: "품목 상권",
  association: "시장 안내",
};

export const PHONE_STATUS_LABEL: Record<PhoneStatus, string> = {
  verified: "공개 번호",
  not_found: "연락처 확인 못함",
  undisclosed: "미공개",
  unknown: "확인 필요",
};
