"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Button";
import { loadKakaoMaps } from "@/lib/map/kakaoLoader";
import type { RoutePlan, RouteStart } from "@/lib/route/plan";

/**
 * 동선 지도 — 방문 순서대로 marker를 찍고 사이를 선으로 잇습니다.
 * 선은 좌표를 직선으로 연결한 **순서 안내용**이며 실제 골목 경로와는 다를 수 있습니다.
 */
export function RouteMap({ plan, start, appKey, onError }: { plan: RoutePlan; start: RouteStart | null; appKey: string; onError: (message: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const drawnRef = useRef<{ clear: () => void }[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadKakaoMaps(appKey)
      .then((k) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = new k.maps.Map(containerRef.current, {
          center: new k.maps.LatLng(plan.stops[0]?.lat ?? 36.3285, plan.stops[0]?.lng ?? 127.4305),
          level: 3,
        });
        map.addControl(new k.maps.ZoomControl(), k.maps.ControlPosition.RIGHT);
        mapRef.current = map;
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) onError(err instanceof Error ? err.message : "Kakao 지도를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
    // 최초 1회만 지도를 만들고, 이후 동선 변경은 아래 effect가 다시 그립니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey, onError]);

  useEffect(() => {
    const map = mapRef.current;
    const k = window.kakao;
    if (!ready || !map || !k) return;

    for (const d of drawnRef.current) d.clear();
    drawnRef.current = [];

    const path = plan.stops.map((s) => new k.maps.LatLng(s.lat, s.lng));
    if (start) path.unshift(new k.maps.LatLng(start.lat, start.lng));

    if (path.length > 1) {
      const line = new k.maps.Polyline({
        path,
        strokeWeight: 5,
        strokeColor: "#1c5630",
        strokeOpacity: 0.85,
        strokeStyle: "solid",
        map,
      });
      drawnRef.current.push({ clear: () => line.setMap(null) });
    }

    if (start) {
      const el = document.createElement("span");
      el.className = "mf-route-pin mf-route-pin--start";
      el.textContent = "출발";
      const overlay = new k.maps.CustomOverlay({ position: path[0]!, content: el, xAnchor: 0.5, yAnchor: 1.1, zIndex: 5 });
      overlay.setMap(map);
      drawnRef.current.push({ clear: () => overlay.setMap(null) });
    }

    for (const stop of plan.stops) {
      const el = document.createElement("span");
      el.className = "mf-route-pin";
      el.dataset.approx = String(stop.accuracy !== "exact");
      el.innerHTML = `<b>${stop.order}</b><span>${stop.name}</span>`;
      el.setAttribute("aria-label", `${stop.order}번째 방문 ${stop.name}, ${stop.arrival} 도착`);
      const overlay = new k.maps.CustomOverlay({
        position: new k.maps.LatLng(stop.lat, stop.lng),
        content: el,
        xAnchor: 0.5,
        yAnchor: 1,
        zIndex: 10 + stop.order,
      });
      overlay.setMap(map);
      drawnRef.current.push({ clear: () => overlay.setMap(null) });
    }

    if (path.length === 1) {
      map.setCenter(path[0]!);
      map.setLevel(3);
    } else if (path.length > 1) {
      const bounds = new k.maps.LatLngBounds();
      for (const p of path) bounds.extend(p);
      map.setBounds(bounds, 70, 60, 70, 60);
    }
  }, [ready, plan, start]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !ready) return;
    const observer = new ResizeObserver(() => mapRef.current?.relayout());
    observer.observe(el);
    return () => observer.disconnect();
  }, [ready]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" role="application" aria-label="대전 중앙시장 동선 지도" />
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
