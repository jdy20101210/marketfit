"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Button";
import { groupByProximity, type MarkerGroup } from "@/lib/map/grouping";
import { loadKakaoMaps } from "@/lib/map/kakaoLoader";
import type { StoreDTO } from "@/lib/api/schemas";
import { MARKET_CENTER_APPROX, type MapStoreView, type ResolvedLocation } from "./types";

type GroupItem = { id: string; lat: number; lng: number; accuracy: ResolvedLocation["accuracy"]; view: MapStoreView };

export function KakaoMap(props: {
  appKey: string;
  views: MapStoreView[];
  allStores: StoreDTO[];
  selectedStoreId: string | null;
  hasProfile: boolean;
  highlightIds: Set<string>;
  onSelectGroup: (storeIds: string[]) => void;
  onBrowserGeocoded: (locations: Record<string, ResolvedLocation>) => void;
  onError: (message: string) => void;
}) {
  const { appKey, views, allStores, selectedStoreId, hasProfile, highlightIds, onSelectGroup, onBrowserGeocoded, onError } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const clustererRef = useRef<kakao.maps.MarkerClusterer | null>(null);
  const shapesRef = useRef<kakao.maps.Circle[]>([]);
  const fittedRef = useRef(false);
  const geocodeTried = useRef(false);
  const [ready, setReady] = useState(false);

  // 1) SDK 로드 & 지도 생성
  useEffect(() => {
    let cancelled = false;
    loadKakaoMaps(appKey)
      .then((k) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = new k.maps.Map(containerRef.current, {
          center: new k.maps.LatLng(MARKET_CENTER_APPROX.lat, MARKET_CENTER_APPROX.lng),
          level: 4,
        });
        map.addControl(new k.maps.ZoomControl(), k.maps.ControlPosition.RIGHT);
        clustererRef.current = new k.maps.MarkerClusterer({
          map,
          averageCenter: true,
          minLevel: 6,
          gridSize: 50,
          styles: [
            {
              width: "46px",
              height: "46px",
              background: "rgba(28, 86, 48, 0.92)",
              border: "3px solid #fffdf8",
              borderRadius: "23px",
              color: "#fff",
              textAlign: "center",
              fontWeight: "800",
              lineHeight: "40px",
              fontSize: "14px",
            },
          ],
        });
        mapRef.current = map;
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) onError(err instanceof Error ? err.message : "Kakao 지도를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [appKey, onError]);

  // 2) 서버 좌표가 없을 때 브라우저 SDK(services)로 주소 → 좌표 보완 (저장하지 않음)
  useEffect(() => {
    if (!ready || geocodeTried.current || !window.kakao) return;
    const missing = allStores.filter((s) => s.location.lat === null && s.geocodeQuery);
    if (missing.length === 0) return;
    geocodeTried.current = true;
    const k = window.kakao;
    const geocoder = new k.maps.services.Geocoder();
    const queries = [...new Set(missing.map((s) => s.geocodeQuery!))];
    Promise.all(
      queries.map(
        (q) =>
          new Promise<[string, kakao.maps.services.AddressResult | null]>((resolve) => {
            geocoder.addressSearch(q, (result, status) => resolve([q, status === k.maps.services.Status.OK ? (result[0] ?? null) : null]));
          }),
      ),
    ).then((pairs) => {
      const byQuery = new Map(pairs);
      const out: Record<string, ResolvedLocation> = {};
      for (const s of missing) {
        const r = byQuery.get(s.geocodeQuery!);
        if (!r) continue;
        const exactAddr = r.address_type === "ROAD_ADDR" || r.address_type === "REGION_ADDR";
        const approx = s.locationBasis !== "road_address" || !exactAddr;
        out[s.id] = {
          lat: Number(r.y),
          lng: Number(r.x),
          accuracy: approx ? "approximate" : "exact",
          note:
            s.locationBasis === "market_zone"
              ? "중앙시장 활성화구역 대표 주소 기준 — 세부 위치 미확인 (브라우저 조회)"
              : s.locationBasis === "near_road_address"
                ? `${s.addressDetail ?? "인근"} — 건물 주소 기준 근사 위치 (브라우저 조회)`
                : `주소 검색 결과 (${r.address_name}, 브라우저 조회)`,
          source: "browser",
        };
      }
      if (Object.keys(out).length) onBrowserGeocoded(out);
    });
  }, [ready, allStores, onBrowserGeocoded]);

  const groups = useMemo(() => {
    const items: GroupItem[] = views
      .filter((v) => v.location)
      .map((v) => ({ id: v.store.id, lat: v.location!.lat, lng: v.location!.lng, accuracy: v.location!.accuracy, view: v }));
    return groupByProximity(items, 15);
  }, [views]);

  // 3) marker(커스텀 오버레이) 그리기
  useEffect(() => {
    const map = mapRef.current;
    const k = window.kakao;
    if (!ready || !map || !k) return;
    const clusterer = clustererRef.current;
    clusterer?.clear();
    shapesRef.current.forEach((s) => s.setMap(null));
    shapesRef.current = [];

    const overlays = groups.map((group) => {
      const position = new k.maps.LatLng(group.lat, group.lng);
      const el = buildPin(group, selectedStoreId, hasProfile, highlightIds);
      el.addEventListener("click", () => onSelectGroup(group.items.map((i) => i.id)));
      if (group.accuracy === "approximate") {
        shapesRef.current.push(
          new k.maps.Circle({
            center: position,
            radius: 45,
            strokeWeight: 2,
            strokeColor: "#c6811c",
            strokeOpacity: 0.8,
            strokeStyle: "dash",
            fillColor: "#f5cc5f",
            fillOpacity: 0.12,
            map,
          }),
        );
      }
      return new k.maps.CustomOverlay({ position, content: el, xAnchor: 0.5, yAnchor: 1, clickable: true, zIndex: group.items.some((i) => i.id === selectedStoreId) ? 10 : 1 });
    });
    if (clusterer) clusterer.addMarkers(overlays);
    else overlays.forEach((o) => o.setMap(map));

    if (!fittedRef.current && groups.length > 0) {
      fittedRef.current = true;
      if (groups.length === 1) {
        map.setCenter(new k.maps.LatLng(groups[0]!.lat, groups[0]!.lng));
        map.setLevel(3);
      } else {
        const bounds = new k.maps.LatLngBounds();
        groups.forEach((g) => bounds.extend(new k.maps.LatLng(g.lat, g.lng)));
        map.setBounds(bounds, 70, 50, 70, 50);
      }
    }
    return () => {
      if (!clusterer) overlays.forEach((o) => o.setMap(null));
    };
  }, [ready, groups, selectedStoreId, hasProfile, highlightIds, onSelectGroup]);

  // 4) 선택한 점포로 이동
  useEffect(() => {
    const map = mapRef.current;
    const k = window.kakao;
    if (!ready || !map || !k || !selectedStoreId) return;
    const group = groups.find((g) => g.items.some((i) => i.id === selectedStoreId));
    if (!group) return;
    if (map.getLevel() > 4) map.setLevel(3);
    map.panTo(new k.maps.LatLng(group.lat, group.lng));
  }, [ready, selectedStoreId, groups]);

  // 컨테이너 크기 변화 대응
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !ready) return;
    const observer = new ResizeObserver(() => mapRef.current?.relayout());
    observer.observe(el);
    return () => observer.disconnect();
  }, [ready]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" role="application" aria-label="대전 중앙시장 Kakao 지도" />
      {!ready ? (
        <div className="absolute inset-0 grid place-items-center bg-cream/80">
          <p className="flex items-center gap-2 text-sm text-ink-600">
            <Spinner /> Kakao 지도를 불러오는 중…
          </p>
        </div>
      ) : null}
    </div>
  );
}

function buildPin(group: MarkerGroup<GroupItem>, selectedStoreId: string | null, hasProfile: boolean, highlightIds: Set<string>): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "mf-pin";
  const views = group.items.map((i) => i.view);
  const recommendable = views.filter((v) => v.store.recommendable);
  const topScore = recommendable.reduce((m, v) => Math.max(m, v.rec?.score ?? 0), 0);
  const infoOnly = recommendable.length === 0;
  el.dataset.level = infoOnly ? "info" : group.items.some((i) => highlightIds.has(i.id)) ? "top" : "normal";
  el.dataset.approx = String(group.accuracy !== "exact");
  el.dataset.selected = String(group.items.some((i) => i.id === selectedStoreId));

  const dot = document.createElement("span");
  dot.className = "mf-pin__dot";
  dot.textContent = infoOnly ? "i" : "🏪";
  dot.setAttribute("aria-hidden", "true");
  el.appendChild(dot);

  const label = document.createElement("span");
  if (group.items.length > 1) {
    label.textContent = hasProfile && !infoOnly ? `최고 ${topScore}` : `${views[0]!.store.name} 외`;
    const count = document.createElement("span");
    count.className = "mf-pin__count";
    count.textContent = String(group.items.length);
    el.append(label, count);
  } else {
    const v = views[0]!;
    label.textContent = infoOnly ? "시장 안내" : hasProfile && v.rec ? `${v.rec.score}` : v.store.name.slice(0, 8);
    el.appendChild(label);
  }
  const names = views.map((v) => v.store.name).join(", ");
  el.setAttribute(
    "aria-label",
    `${group.items.length > 1 ? `${group.items.length}곳 묶음: ` : ""}${names}${hasProfile && !infoOnly ? `, 최고 점수 ${topScore}점` : ""}${
      group.accuracy !== "exact" ? ", 대략적 위치" : ""
    }`,
  );
  return el;
}
