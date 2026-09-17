import { describe, expect, it } from "vitest";
import seed from "@/data/stores/stores.seed.json";
import locations from "@/data/stores/store-locations.json";
import { buildStoreFeatures, noteProductWords, splitTypeTokens } from "@/lib/stores/featureRules";
import { deriveEntityKind, MARKET_REPRESENTATIVE_ADDRESS, parseAddress, parsePhone } from "@/lib/stores/parse";
import type { StoreSeed } from "@/lib/stores/types";

const stores = seed.stores as StoreSeed[];

describe("엑셀 seed 데이터", () => {
  it("40개 점포·상권이 중복 없이 있다", () => {
    expect(stores).toHaveLength(40);
    expect(new Set(stores.map((s) => s.name)).size).toBe(40);
    expect(new Set(stores.map((s) => s.id)).size).toBe(40);
  });

  it("연락처 현황이 원본 요약 시트와 같다 (확인 28 / 확인 못함 8 / 미공개 4)", () => {
    const count = (st: string) => stores.filter((s) => s.phoneStatus === st).length;
    expect(count("verified")).toBe(28);
    expect(count("not_found")).toBe(8);
    expect(count("undisclosed")).toBe(4);
  });

  it("확인된 번호는 원문과 동일하고, 나머지는 번호를 만들지 않는다", () => {
    for (const s of stores) {
      if (s.phoneStatus === "verified") expect(s.phone).toBe(s.phoneRaw);
      else expect(s.phone).toBeNull();
    }
  });

  it("좌표는 추측하지 않고 확인 전에는 비워 둔다", () => {
    for (const loc of locations.locations) {
      if (loc.lat === null) expect(loc.accuracy).toBe("unknown");
    }
  });
});

describe("원문 파싱", () => {
  it("전화번호 상태", () => {
    expect(parsePhone("042-252-2836")).toEqual({ phone: "042-252-2836", status: "verified" });
    expect(parsePhone("연락처 확인 못함").status).toBe("not_found");
    expect(parsePhone("미공개").status).toBe("undisclosed");
  });

  it("주소 → 좌표 조회 기준", () => {
    expect(parseAddress("대전광역시 동구 중앙로200번길 85")).toMatchObject({ basis: "road_address", geocodeQuery: "대전광역시 동구 중앙로200번길 85" });
    expect(parseAddress("대전광역시 동구 대전로779번길 38-15, 동양주단 앞, BYC 옆")).toMatchObject({
      basis: "near_road_address",
      geocodeQuery: "대전광역시 동구 대전로779번길 38-15",
    });
    expect(parseAddress("대전광역시 동구 대전로791번길 31, 1층")).toMatchObject({ basis: "road_address", detail: "1층" });
    expect(parseAddress("대전광역시 동구 중앙시장 활성화구역")).toMatchObject({ basis: "market_zone", geocodeQuery: MARKET_REPRESENTATIVE_ADDRESS });
  });

  it("점포 종류 분류", () => {
    expect(deriveEntityKind({ name: "동양주단", storeType: "의류 노점", source: "", note: "노점(상인명: …)" })).toBe("street_vendor");
    expect(deriveEntityKind({ name: "메가프라자 한복 상권", storeType: "한복", source: "대전중앙시장 공식 상인회", note: "" })).toBe("product_zone");
    expect(deriveEntityKind({ name: "중앙시장 활성화구역 상인회", storeType: "시장 관리·상인회", source: "", note: "" })).toBe("association");
  });
});

describe("점포 feature 규칙", () => {
  it("모든 점포의 유형 토큰을 해석할 수 있다", () => {
    for (const s of stores) expect(() => buildStoreFeatures(s)).not.toThrow();
  });

  it("점포명으로 품목을 추측하지 않는다 (생선골목 = 주방용품)", () => {
    const f = buildStoreFeatures(stores.find((s) => s.name === "생선골목")!);
    expect(f.primaryCategory).toBe("주방·식기");
    expect(f.taste.food).toBe(0);
  });

  it("비고의 품목 목록만 품목으로 인정한다", () => {
    expect(noteProductWords("순대·설렁탕·금은방 포함")).toEqual(["순대", "설렁탕", "금은방"]);
    expect(noteProductWords("공식 안내 대표번호가 0000 표기")).toEqual([]);
    expect(noteProductWords("노점(상인명: 이판녀)")).toEqual([]);
    expect(splitTypeTokens("시장 관리·상인회")).toEqual(["시장 관리", "상인회"]);
  });

  it("복합 업종은 '복합 상가'로 분류하고 상인회는 추천에서 제외한다", () => {
    const mega = buildStoreFeatures(stores.find((s) => s.name === "메가프라자")!);
    expect(mega.primaryCategory).toBe("복합 상가");
    expect(mega.categories[0]).toBe("복합 상가");
    const assoc = buildStoreFeatures(stores.find((s) => s.entityKind === "association")!);
    expect(assoc.recommendable).toBe(false);
  });

  it("feature 값은 모두 0~1", () => {
    for (const s of stores) {
      const f = buildStoreFeatures(s);
      for (const v of [...Object.values(f.taste), ...Object.values(f.market), f.exposure]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
