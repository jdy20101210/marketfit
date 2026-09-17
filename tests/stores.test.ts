import { describe, expect, it } from "vitest";
import seed from "@/data/stores/stores.seed.json";
import features from "@/data/stores/store-features.json";
import locations from "@/data/stores/store-locations.json";
import activity from "@/data/mock/store-activity.json";
import interest from "@/data/mock/market-interest.json";
import { mockMarketInterest, mockStoreActivity } from "@/lib/mock/activity";
import { TASTE_KEYS } from "@/lib/recommendation/dimensions";
import { buildStoreFeatures, SUB_CATEGORY_RULES, unmatchedItems } from "@/lib/stores/featureRules";
import {
  deriveEntityKind,
  displayCategory,
  MAIN_CATEGORIES,
  MARKET_REPRESENTATIVE_ADDRESS,
  parseAddress,
  parseCategories,
  parseItems,
  parsePhone,
} from "@/lib/stores/parse";
import type { StoreSeed } from "@/lib/stores/types";

const stores = seed.stores as StoreSeed[];
const featureById = new Map(features.features.map((f) => [f.storeId, f]));
const byName = (name: string) => stores.find((s) => s.name === name)!;
const ctx = { clusterSize: 1, activity: { storeId: "x", visitCount: 10, likeCount: 1, saveCount: 1, interestUsers: 5 }, visitPercentile: 0.5 };

describe("엑셀 seed 데이터 (djone_stores_438.xlsx)", () => {
  it("원본 438행 → 점포 433곳이며 원본 sIdx를 모두 보존한다", () => {
    expect(seed.meta.rowCount).toBe(438);
    expect(stores).toHaveLength(433);
    expect(seed.meta.mergedRows).toBe(5);
    const ids = stores.flatMap((s) => s.sourceIds);
    expect(ids).toHaveLength(438);
    expect(new Set(ids).size).toBe(438);
    expect(new Set(stores.map((s) => s.id)).size).toBe(433);
  });

  it("같은 점포로 합친 행은 이름·주소·품목·분류가 같고 메모를 남긴다", () => {
    const merged = stores.filter((s) => s.sourceIds.length > 1);
    expect(merged.reduce((n, s) => n + s.sourceIds.length - 1, 0)).toBe(5);
    for (const s of merged) expect(s.note).toContain("합쳤습니다");
    expect(byName("동남커텐").sourceIds).toEqual([578, 579, 580]);
  });

  it("대분류는 4개, 소분류는 규칙이 모두 있다", () => {
    expect(new Set(stores.map((s) => s.mainCategory))).toEqual(new Set(MAIN_CATEGORIES));
    for (const s of stores) expect(SUB_CATEGORY_RULES[s.subCategory]).toBeDefined();
  });

  it("공개 번호는 원문과 같고, 형식이 다른 번호는 고치지 않고 '확인 필요'로 둔다", () => {
    for (const s of stores) {
      if (s.phoneStatus === "listed") expect(s.phone).toBe(s.phoneRaw);
      else expect(s.phone).toBeNull();
    }
    const check = stores.filter((s) => s.phoneStatus === "check");
    expect(check.map((s) => s.phoneRaw).sort()).toEqual(["305-289-7914", "595-620-0302"]);
    expect(stores.filter((s) => s.phoneStatus === "none").length).toBe(98);
  });

  it("좌표는 추측하지 않고 확인 전에는 비워 둔다", () => {
    expect(locations.locations).toHaveLength(433);
    for (const loc of locations.locations) {
      if (loc.lat === null) expect(loc.accuracy).toBe("unknown");
    }
  });

  it("원본에 없는 점포 정보를 만들지 않는다 (품목은 원문을 나눈 값)", () => {
    for (const s of stores) {
      const rawNormalized = s.itemsRaw.replace(/도·소매/g, "도소매");
      for (const item of s.items) expect(rawNormalized).toContain(item);
    }
  });
});

describe("원문 파싱", () => {
  it("전화번호 상태", () => {
    expect(parsePhone("042-252-2836")).toEqual({ phone: "042-252-2836", status: "listed" });
    expect(parsePhone("010-1234-5678").status).toBe("listed");
    expect(parsePhone("-")).toEqual({ phone: null, status: "none" });
    expect(parsePhone("305-289-7914")).toEqual({ phone: null, status: "check" });
  });

  it("품목: 쉼표·마침표로 나누고 '도·소매'는 한 단어로 둔다", () => {
    expect(parseItems("건어물.반찬")).toEqual(["건어물", "반찬"]);
    expect(parseItems("그릇 도·소매")).toEqual(["그릇 도소매"]);
    expect(parseItems("잡화(도소매)")).toEqual(["잡화(도소매)"]);
    expect(parseItems("속옷, 양말, 속옷")).toEqual(["속옷", "양말"]);
  });

  it("분류: 'temp' 임시값은 제외한다", () => {
    expect(parseCategories("의류•패션 > 여성복; 의류•패션 > temp")).toMatchObject({ main: "의류•패션", sub: "여성복" });
    expect(displayCategory("식품•요리")).toBe("식품·요리");
    expect(() => parseCategories("의류•패션 > temp")).toThrow();
  });

  it("주소 → 좌표 조회 기준", () => {
    expect(parseAddress("대전광역시 동구 대전로 785번길 50, 1층", "building")).toEqual({
      geocodeQuery: "대전광역시 동구 대전로785번길 50",
      detail: "1층",
      basis: "road_address",
    });
    expect(parseAddress("대전광역시 동구 중앙로200번길 85 메가프라자 3층", "building")).toMatchObject({
      geocodeQuery: "대전광역시 동구 중앙로200번길 85",
      detail: "메가프라자 3층",
    });
    expect(parseAddress("대전광역시 동구 대전로785번길 영동상회 앞", "building")).toEqual({
      geocodeQuery: "대전광역시 동구 대전로785번길",
      detail: "영동상회 앞",
      basis: "road_only",
    });
    expect(parseAddress("대전 동구 원동 38-1", "parcel")).toMatchObject({ basis: "parcel_address", geocodeQuery: "대전 동구 원동 38-1" });
    expect(parseAddress("대전 동구 원동 중앙시장내 화월통상인회", "zone")).toMatchObject({
      basis: "market_zone",
      geocodeQuery: MARKET_REPRESENTATIVE_ADDRESS,
    });
    expect(parseAddress("-", "unknown")).toEqual({ geocodeQuery: null, detail: null, basis: "none" });
  });

  it("노점 여부는 원문의 '노점' 표기와 '○○ 앞' 위치 표기로만 판단한다", () => {
    expect(deriveEntityKind({ name: "옷(노점)", itemsRaw: "여성복", detail: null })).toBe("street_vendor");
    expect(deriveEntityKind({ name: "참맛김밥젓갈", itemsRaw: "김밥, 젓갈", detail: "영동상회 앞" })).toBe("street_vendor");
    expect(deriveEntityKind({ name: "광일상회", itemsRaw: "속옷, 양말", detail: "1층" })).toBe("store");
    expect(byName("참맛김밥젓갈").entityKind).toBe("street_vendor");
  });
});

describe("점포 feature 규칙", () => {
  it("모든 품목 단어에 규칙이 있다 (사업 형태 표기 제외)", () => {
    for (const s of stores) expect(unmatchedItems(s.items)).toEqual([]);
  });

  it("점포명으로 품목을 추측하지 않는다 ('구제나라'의 품목은 여성복·캐주얼)", () => {
    expect(featureById.get(byName("구제나라").id)!.taste.vintage).toBeLessThan(0.3);
    expect(featureById.get(byName("각국옷나라").id)!.taste.vintage).toBeGreaterThan(0.9); // 품목에 '구제'가 있음
  });

  it("소분류와 품목이 성향에 반영된다", () => {
    expect(featureById.get(byName("커피(노점)").id)!.taste.coffee).toBeGreaterThan(0.9);
    const hanbok = buildStoreFeatures(byName("세화주단"), ctx);
    expect(hanbok.taste.traditional).toBeGreaterThan(0.9);
    expect(hanbok.primaryCategory).toBe("의류•패션");
    expect(hanbok.subCategory).toBe("한복");
    expect(hanbok.inferredBy).toBe("rule");
  });

  it("feature 값은 모두 0~1이고, 원본 품목만 productHints로 쓴다", () => {
    for (const s of stores) {
      const f = featureById.get(s.id)!;
      for (const v of [...Object.values(f.taste), ...Object.values(f.market), f.exposure]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(Object.keys(f.taste).sort()).toEqual([...TASTE_KEYS].sort());
      for (const hint of f.productHints) expect(s.items).toContain(hint);
    }
  });
});

describe("프로토타입 가상 집계", () => {
  it("같은 점포는 항상 같은 값 (파일 값과 생성기 값이 같다)", () => {
    for (const a of activity.activities.slice(0, 50)) {
      const s = stores.find((x) => x.id === a.storeId)!;
      expect(mockStoreActivity(s)).toEqual(a);
    }
    expect(activity.activities).toHaveLength(433);
  });

  it("시장 관심도는 14일치이며 결정적이다", () => {
    expect(mockMarketInterest(14)).toEqual(interest.categories);
    for (const c of interest.categories) expect(c.daily).toHaveLength(14);
  });
});
