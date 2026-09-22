import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatTime,
  MIN_STAY,
  orderStops,
  parseTime,
  planRoute,
  planToText,
  selectStops,
  walkMeters,
  walkMinutes,
  type LocatedCandidate,
  type RouteCandidate,
} from "@/lib/route/plan";

const BASE = { lat: 36.3285, lng: 127.4305 };

/** 중앙시장 일대 크기(약 100m 간격)의 가상 점포 */
function candidate(n: number, over: Partial<RouteCandidate> = {}): RouteCandidate {
  return {
    storeId: `dj-${n}`,
    name: `점포${n}`,
    rank: n,
    score: 95 - n,
    mainCategory: "식품•먹거리",
    subCategory: `분류${n}`,
    storeType: "테스트",
    lat: BASE.lat + n * 0.0009,
    lng: BASE.lng + (n % 2 === 0 ? 0.0009 : 0),
    accuracy: "exact",
    locationNote: "테스트 좌표",
    ...over,
  };
}

describe("시간·거리 계산", () => {
  it("HH:MM을 분으로 바꾸고 다시 되돌린다", () => {
    expect(parseTime("10:30")).toBe(630);
    expect(formatTime(630)).toBe("10:30");
    expect(formatTime(1445)).toBe("00:05");
    expect(formatDuration(90)).toBe("1시간 30분");
    expect(formatDuration(120)).toBe("2시간");
    expect(formatDuration(45)).toBe("45분");
  });

  it("거리는 직선거리에 골목 보정을 적용하고, 도보 시간은 최소 1분", () => {
    const a = { lat: 36.3285, lng: 127.4305 };
    const b = { lat: 36.3295, lng: 127.4305 };
    const meters = walkMeters(a, b);
    expect(meters).toBeGreaterThan(130);
    expect(meters).toBeLessThan(160);
    expect(walkMinutes(meters)).toBe(2);
    expect(walkMinutes(0)).toBe(0);
    expect(walkMinutes(5)).toBe(1);
  });
});

describe("점포 고르기", () => {
  const pool = [1, 2, 3, 4, 5, 6].map((n) => candidate(n)) as LocatedCandidate[];

  it("추천 순위가 높은 곳부터 원하는 수만큼 고른다", () => {
    const picked = selectStops(pool, 3);
    expect(picked).toHaveLength(3);
    expect(picked.map((p) => p.rank)).toEqual([1, 2, 3]);
  });

  it("점수가 더 높은 점포를 건너뛰고 낮은 점포를 넣지 않는다 (같은 분류여도)", () => {
    // 남성복을 찾는데 남성복 한 곳만 넣고 나머지를 다른 업종으로 채우던 문제의 회귀 테스트
    const sameCategory = [
      candidate(1, { subCategory: "남성복" }),
      candidate(2, { subCategory: "남성복" }),
      candidate(3, { subCategory: "남성복" }),
      candidate(4, { subCategory: "헤어" }),
      candidate(5, { subCategory: "잡화" }),
    ] as LocatedCandidate[];
    const picked = selectStops(sameCategory, 3);
    expect(picked.map((p) => p.rank).sort()).toEqual([1, 2, 3]);
  });

  it("점수가 같을 때만 소분류가 겹치지 않게 고른다", () => {
    const tied = [
      candidate(1, { subCategory: "카페", score: 99 }),
      candidate(2, { subCategory: "카페", score: 99 }),
      candidate(3, { subCategory: "음료", score: 99 }),
      candidate(4, { subCategory: "떡집", score: 80 }),
    ] as LocatedCandidate[];
    const picked = selectStops(tied, 2);
    expect(new Set(picked.map((p) => p.subCategory))).toEqual(new Set(["카페", "음료"]));
  });

  it("고정한 점포는 순위가 낮아도 반드시 들어간다", () => {
    const picked = selectStops(pool, 2, ["dj-6"]);
    expect(picked.map((p) => p.storeId)).toContain("dj-6");
  });

  it("다른 조합은 확실히 높은 점포를 유지하고, 마지막 자리만 비슷한 점수끼리 바꾼다", () => {
    const camping = [
      candidate(1, { score: 99, subCategory: "아웃도어" }),
      candidate(2, { score: 93, subCategory: "아웃도어" }),
      candidate(3, { score: 90, subCategory: "주방" }),
      candidate(4, { score: 90, subCategory: "주방" }),
      candidate(5, { score: 88, subCategory: "유니폼" }),
      candidate(6, { score: 88, subCategory: "생활" }),
      candidate(7, { score: 70, subCategory: "식당" }),
    ] as LocatedCandidate[];
    const combos = new Set<string>();
    for (let v = 1; v <= 6; v++) {
      const picked = selectStops(camping, 4, [], v);
      const ranks = picked.map((p) => p.rank);
      expect(ranks).toContain(1); // 99점은 항상 유지
      expect(ranks).toContain(2); // 93점도 유지
      expect(picked.every((p) => p.score >= 87)).toBe(true); // 마지막 자리도 90점에서 3점 이내만
      combos.add(ranks.slice().sort().join());
    }
    expect(combos.size).toBeGreaterThan(1); // 실제로 다른 조합이 나온다
  });
});

describe("순서 정하기", () => {
  it("멀리 돌아가는 순서를 가까운 순서로 바꾼다", () => {
    const stops = [
      { id: "a", lat: 36.3285, lng: 127.4305 },
      { id: "c", lat: 36.3305, lng: 127.4305 },
      { id: "b", lat: 36.3295, lng: 127.4305 },
    ];
    const ordered = orderStops(stops, { lat: 36.3285, lng: 127.4305 });
    expect(ordered.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("출발지가 없으면 첫 점포에서 시작해 가까운 순으로 잇는다", () => {
    const stops = [
      { id: "start", lat: 36.3285, lng: 127.4305 },
      { id: "far", lat: 36.3325, lng: 127.4305 },
      { id: "near", lat: 36.3295, lng: 127.4305 },
    ];
    const ordered = orderStops(stops, null);
    expect(ordered.map((s) => s.id)).toEqual(["start", "near", "far"]);
  });
});

describe("동선 계획", () => {
  it("요청한 점포 수와 시간에 맞는 시간표를 만든다", () => {
    const plan = planRoute([1, 2, 3, 4, 5].map((n) => candidate(n)), { stopCount: 4, minutes: 120, startTime: "10:00" });
    expect(plan.stops).toHaveLength(4);
    expect(plan.stops.map((s) => s.order)).toEqual([1, 2, 3, 4]);
    expect(plan.startTime).toBe("10:00");
    expect(plan.totalMinutes).toBeLessThanOrEqual(120);
    expect(plan.stayPerStop).toBeGreaterThanOrEqual(MIN_STAY);
    // 도착 → 출발 시각이 순서대로 이어진다
    for (let i = 1; i < plan.stops.length; i++) {
      expect(parseTime(plan.stops[i]!.arrival)).toBeGreaterThanOrEqual(parseTime(plan.stops[i - 1]!.departure));
    }
    expect(parseTime(plan.endTime)).toBe(parseTime(plan.stops.at(-1)!.departure));
  });

  it("시간이 모자라면 점수가 낮은 점포부터 빼고 안내한다", () => {
    const plan = planRoute([1, 2, 3, 4, 5, 6].map((n) => candidate(n)), { stopCount: 6, minutes: 40, startTime: "10:00" });
    expect(plan.stops.length).toBeLessThan(6);
    expect(plan.droppedForTime).toBeGreaterThan(0);
    expect(plan.notes.some((n) => n.includes("빼고"))).toBe(true);
    expect(plan.stops.every((s) => s.stayMinutes >= MIN_STAY)).toBe(true);
  });

  it("좌표가 없는 추천 점포는 동선에서 빼고 몇 곳인지 알려준다", () => {
    const candidates = [candidate(1), candidate(2, { lat: null, lng: null, accuracy: "unknown" }), candidate(3)];
    const plan = planRoute(candidates, { stopCount: 3, minutes: 120, startTime: "10:00" });
    expect(plan.unlocatedExcluded).toBe(1);
    expect(plan.stops.map((s) => s.storeId)).not.toContain("dj-2");
    // 순위가 높은 점포가 빠지면 이름으로, 아니면 개수로 알려 줍니다.
    expect(plan.notes.some((n) => /제외|빠졌/.test(n))).toBe(true);
  });

  it("좌표가 하나도 없으면 빈 계획과 안내를 돌려준다", () => {
    const plan = planRoute([candidate(1, { lat: null, lng: null, accuracy: "unknown" })], { stopCount: 3, minutes: 120, startTime: "10:00" });
    expect(plan.stops).toHaveLength(0);
    expect(plan.notes[0]).toContain("좌표");
  });

  it("현재 위치에서 출발하면 첫 점포까지 걷는 시간이 포함된다", () => {
    const start = { lat: 36.3255, lng: 127.4305, label: "현재 내 위치", kind: "browser" as const };
    const plan = planRoute([1, 2, 3].map((n) => candidate(n)), { stopCount: 3, minutes: 150, startTime: "10:00", start });
    expect(plan.stops[0]!.walkMinutes).toBeGreaterThan(0);
    expect(parseTime(plan.stops[0]!.arrival)).toBeGreaterThan(parseTime("10:00"));
    expect(plan.startLabel).toBe("현재 내 위치");
  });

  it("고정한 점포는 시간이 모자라도 남는다", () => {
    const plan = planRoute([1, 2, 3, 4, 5, 6].map((n) => candidate(n)), { stopCount: 6, minutes: 45, startTime: "10:00", mustInclude: ["dj-6"] });
    expect(plan.stops.map((s) => s.storeId)).toContain("dj-6");
    expect(plan.stops.find((s) => s.storeId === "dj-6")!.pinned).toBe(true);
  });

  it("복사용 텍스트에 순서·시각·점수가 들어간다", () => {
    const plan = planRoute([1, 2, 3].map((n) => candidate(n)), { stopCount: 3, minutes: 120, startTime: "10:00" });
    const text = planToText(plan);
    expect(text).toContain("MarketFit");
    expect(text).toContain("점포1");
    expect(text).toContain("추천 1위");
    expect(text.split("\n").length).toBeGreaterThan(plan.stops.length);
  });
});

describe("동선 연관도", () => {
  it("동선 점포는 지도 추천 상위와 같다 (좌표가 모두 있을 때)", () => {
    const cands = [
      candidate(1, { score: 99, subCategory: "남성복" }),
      candidate(2, { score: 99, subCategory: "남성복" }),
      candidate(3, { score: 99, subCategory: "남성복" }),
      candidate(4, { score: 99, subCategory: "남성복" }),
      candidate(5, { score: 95, subCategory: "여성복" }),
      candidate(6, { score: 87, subCategory: "헤어" }),
    ];
    const plan = planRoute(cands, { stopCount: 4, minutes: 120, startTime: "10:00" });
    expect(plan.stops.map((s) => s.rank).sort()).toEqual([1, 2, 3, 4]);
  });

  it("위치를 몰라 빠진 상위 점포는 이름과 순위로 알려 준다", () => {
    const cands = [
      candidate(1, { name: "원흥상회", lat: null, lng: null, accuracy: "unknown" }),
      candidate(2),
      candidate(3),
      candidate(4),
    ];
    const plan = planRoute(cands, { stopCount: 3, minutes: 120, startTime: "10:00" });
    expect(plan.notes.some((n) => n.includes("1위 원흥상회는"))).toBe(true);
  });
});
