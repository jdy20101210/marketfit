/**
 * 엑셀 원문 값을 구조화하는 순수 함수 모음 (클라이언트/서버/스크립트 공용).
 * 새 정보를 만들지 않고, 원문에 이미 있는 내용을 나누고 정리만 합니다.
 *
 * 원본: data/stores/source/djone_stores_438.xlsx (대전중앙시장 공식 사이트 djone.kr 점포 목록)
 */

/** listed: 번호 형식이 맞는 공개 번호 / none: 원본에 '-' / check: 원본 값의 형식이 일반 전화번호와 달라 확인 필요 */
export type PhoneStatus = "listed" | "none" | "check";
/** 원본 기준 점포 형태 (노점 여부는 이름·품목의 '노점' 표기와 '○○ 앞' 위치 표기로만 판단) */
export type EntityKind = "store" | "street_vendor";
export type LocLevel = "building" | "parcel" | "zone" | "market" | "unknown";
/**
 * road_address: 도로명+건물번호 / near_road_address: 건물번호 + '○○ 앞' 같은 인근 표기
 * road_only: 도로명만 있고 건물번호 없음 / parcel_address: 지번 주소
 * market_zone: 구역·시장 이름만 있음(대표 주소 기준 대략 위치) / none: 주소 없음
 */
export type LocationBasis = "road_address" | "near_road_address" | "road_only" | "parcel_address" | "market_zone" | "none";

/** 중앙시장 활성화구역 대표 주소 (이전 40개 점포 원본 '수집기준_주의사항' 시트에 명시) */
export const MARKET_REPRESENTATIVE_ADDRESS = "대전광역시 동구 대전로 783";

export const MAIN_CATEGORIES = ["식품•요리", "의류•패션", "주거•생활", "근린•서비스"] as const;

/** 화면 표시용: 원본의 '•'를 가운뎃점으로 */
export function displayCategory(value: string): string {
  return value.replace(/•/g, "·");
}

const PHONE_PATTERN = /^0\d{1,2}-\d{3,4}-\d{4}$/;

export function parsePhone(raw: string): { phone: string | null; status: PhoneStatus } {
  const value = raw.trim();
  if (!value || value === "-") return { phone: null, status: "none" };
  if (PHONE_PATTERN.test(value)) return { phone: value, status: "listed" };
  return { phone: null, status: "check" };
}

/** 품목: 쉼표·마침표·가운뎃점으로 나눕니다. '도·소매'처럼 단어 안의 가운뎃점은 유지합니다. */
export function parseItems(raw: string): string[] {
  const protectedText = raw.replace(/도·소매/g, "도소매");
  const parts = protectedText
    .split(/[,，.]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/^\((.*)\)$/, "$1"));
  return [...new Set(parts)];
}

/** '대분류 > 소분류; 대분류 > temp' → 첫 번째 유효 분류 (원본의 'temp'는 임시값이라 제외) */
export function parseCategories(raw: string): { main: string; sub: string; all: { main: string; sub: string }[] } {
  const all = raw
    .split(";")
    .map((part) => part.split(">").map((s) => s.trim()))
    .filter((p) => p.length === 2 && p[0] && p[1] && p[1].toLowerCase() !== "temp")
    .map(([main, sub]) => ({ main: main!, sub: sub! }));
  if (all.length === 0) throw new Error(`분류를 해석할 수 없습니다: ${raw}`);
  return { main: all[0]!.main, sub: all[0]!.sub, all };
}

const NEAR_PATTERN = /(앞|옆|맞은편|인근|건너편)$/;

function normalizeRoadAddress(text: string): string {
  return (
    text
      // '대전로 785번길 50' → '대전로785번길 50'
      .replace(/(로|길)\s+(\d+번길)/g, "$1$2")
      // 괄호 안 참고 정보 제거: '19(중동)' → '19'
      .replace(/\(([^)]*)\)/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * 원본 주소 → 좌표 조회용 주소 + 상세 위치 + 위치 기준.
 * 원본의 address_clean은 '785번길 50'을 '785'로 줄이는 경우가 있어, 원문 주소를 직접 정리합니다.
 */
export function parseAddress(raw: string, locLevel: LocLevel): {
  geocodeQuery: string | null;
  detail: string | null;
  basis: LocationBasis;
} {
  const value = raw.trim();
  if (!value || value === "-" || locLevel === "unknown") return { geocodeQuery: null, detail: null, basis: "none" };

  if (locLevel === "zone" || (locLevel === "market" && !/\d/.test(value.replace(/^대전(광역시)?\s*/, "")))) {
    // 구역·시장 이름만 있는 경우: 활성화구역 대표 주소 기준 '대략적 위치'
    return { geocodeQuery: MARKET_REPRESENTATIVE_ADDRESS, detail: value, basis: "market_zone" };
  }

  const [head, ...rest] = value.split(",").map((part) => part.trim());
  const tail = rest.join(", ").trim();
  let main = normalizeRoadAddress(head ?? "");
  const details: string[] = [];
  if (tail) details.push(tail);

  // 도로명 주소: '…로/길 + 번호' 뒤의 층·호·건물명은 상세 정보로 분리
  const road = main.match(/^(.*?(?:로|길))\s*(\d+(?:-\d+)?)(?:\s+(.*))?$/);
  const parcel = main.match(/^(.*?(?:동|가|리))\s*(\d+(?:-\d+)?)(?:번지)?(?:\s+(.*))?$/);
  if (road && /(로|길)$/.test(road[1]!)) {
    main = `${road[1]!.trim()} ${road[2]}`;
    if (road[3]) details.unshift(road[3].trim());
    const detail = details.join(", ") || null;
    const near = detail !== null && details.some((d) => NEAR_PATTERN.test(d) || /옆/.test(d));
    return { geocodeQuery: main, detail, basis: near ? "near_road_address" : "road_address" };
  }
  if (parcel) {
    main = `${parcel[1]!.trim()} ${parcel[2]}`;
    if (parcel[3]) details.unshift(parcel[3].trim());
    return { geocodeQuery: main, detail: details.join(", ") || null, basis: "parcel_address" };
  }

  // 건물번호 없이 도로명만 있는 경우 ('대전로785번길 영동상회 앞')
  const roadOnly = main.match(/^(.*?\d+번길|.*?(?:로|길))(?:\s+(.*))?$/);
  if (roadOnly && /(로|길)$/.test(roadOnly[1]!)) {
    if (roadOnly[2]) details.unshift(roadOnly[2].trim());
    return { geocodeQuery: roadOnly[1]!.trim(), detail: details.join(", ") || null, basis: "road_only" };
  }
  return { geocodeQuery: MARKET_REPRESENTATIVE_ADDRESS, detail: value, basis: "market_zone" };
}

/** 노점 여부: 이름·품목에 '노점'이 있거나, 위치가 다른 점포 '앞'으로 적힌 경우 (원문 표기 기준) */
export function deriveEntityKind(input: { name: string; itemsRaw: string; detail: string | null }): EntityKind {
  if (input.name.includes("노점") || input.itemsRaw.includes("노점")) return "street_vendor";
  if (input.detail && /(^|, )[^,]*앞($|,)/.test(input.detail)) return "street_vendor";
  return "store";
}

export const ENTITY_KIND_LABEL: Record<EntityKind, string> = {
  store: "점포",
  street_vendor: "노점",
};

export const PHONE_STATUS_LABEL: Record<PhoneStatus, string> = {
  listed: "공개 번호",
  none: "번호 없음",
  check: "번호 형식 확인 필요",
};

export const LOCATION_BASIS_LABEL: Record<LocationBasis, string> = {
  road_address: "도로명 주소",
  near_road_address: "건물 주변(노점·가판)",
  road_only: "도로명만 있음",
  parcel_address: "지번 주소",
  market_zone: "구역명만 있음 (대표 주소 기준)",
  none: "주소 없음",
};
