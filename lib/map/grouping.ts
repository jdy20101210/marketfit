import type { LocationAccuracy } from "@/lib/stores/types";

export interface Positioned {
  id: string;
  lat: number;
  lng: number;
  accuracy: LocationAccuracy;
}

export interface MarkerGroup<T extends Positioned> {
  id: string;
  lat: number;
  lng: number;
  /** 그룹 안에 대략적 위치가 하나라도 있으면 approximate */
  accuracy: LocationAccuracy;
  items: T[];
}

/** 두 좌표 사이 거리(m) */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 중첩 marker 처리: 같은 좌표(또는 thresholdM 이내)의 점포를 하나의 그룹 marker로 묶습니다.
 * 그룹 순서는 입력 순서(추천 순위)를 따릅니다.
 */
export function groupByProximity<T extends Positioned>(items: T[], thresholdM = 15): MarkerGroup<T>[] {
  const groups: MarkerGroup<T>[] = [];
  for (const item of items) {
    const target = groups.find((g) => distanceMeters(g, item) <= thresholdM);
    if (target) {
      target.items.push(item);
      if (item.accuracy !== "exact") target.accuracy = "approximate";
    } else {
      groups.push({ id: `g-${item.id}`, lat: item.lat, lng: item.lng, accuracy: item.accuracy, items: [item] });
    }
  }
  return groups;
}
