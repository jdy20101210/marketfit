/* Kakao Maps JavaScript SDK — 이 프로젝트에서 사용하는 부분만 최소한으로 선언 */
declare namespace kakao.maps {
  class LatLng {
    constructor(lat: number, lng: number);
    getLat(): number;
    getLng(): number;
  }
  class LatLngBounds {
    constructor();
    extend(latlng: LatLng): void;
  }
  interface MapOptions {
    center: LatLng;
    level?: number;
  }
  class Map {
    constructor(container: HTMLElement, options: MapOptions);
    setCenter(latlng: LatLng): void;
    panTo(latlng: LatLng): void;
    setLevel(level: number, options?: { animate?: boolean }): void;
    getLevel(): number;
    setBounds(bounds: LatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number): void;
    relayout(): void;
    addControl(control: ZoomControl, position: ControlPosition): void;
  }
  class ZoomControl {
    constructor();
  }
  enum ControlPosition {
    TOP = 1,
    TOPLEFT = 2,
    TOPRIGHT = 3,
    LEFT = 4,
    RIGHT = 5,
    BOTTOMLEFT = 6,
    BOTTOM = 7,
    BOTTOMRIGHT = 8,
  }
  interface CustomOverlayOptions {
    position: LatLng;
    content: HTMLElement | string;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
    clickable?: boolean;
    map?: Map;
  }
  class CustomOverlay {
    constructor(options: CustomOverlayOptions);
    setMap(map: Map | null): void;
    setZIndex(z: number): void;
    getPosition(): LatLng;
  }
  interface CircleOptions {
    center: LatLng;
    radius: number;
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: string;
    fillColor?: string;
    fillOpacity?: number;
    map?: Map;
  }
  class Circle {
    constructor(options: CircleOptions);
    setMap(map: Map | null): void;
  }
  interface PolylineOptions {
    path: LatLng[];
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    /** solid | shortdash | dash 등 */
    strokeStyle?: string;
    endArrow?: boolean;
    map?: Map;
  }
  /** 동선(방문 순서)을 잇는 선 */
  class Polyline {
    constructor(options: PolylineOptions);
    setMap(map: Map | null): void;
    setPath(path: LatLng[]): void;
    getLength(): number;
  }
  interface MarkerClustererOptions {
    map: Map;
    averageCenter?: boolean;
    minLevel?: number;
    gridSize?: number;
    disableClickZoom?: boolean;
    styles?: Record<string, string>[];
    calculator?: number[];
  }
  class MarkerClusterer {
    constructor(options: MarkerClustererOptions);
    addMarkers(markers: CustomOverlay[], nodraw?: boolean): void;
    clear(): void;
  }
  function load(callback: () => void): void;
  namespace event {
    function addListener(target: unknown, type: string, handler: (...args: unknown[]) => void): void;
  }
  namespace services {
    enum Status {
      OK = "OK",
      ZERO_RESULT = "ZERO_RESULT",
      ERROR = "ERROR",
    }
    interface AddressResult {
      address_name: string;
      address_type: "REGION" | "ROAD" | "REGION_ADDR" | "ROAD_ADDR";
      x: string;
      y: string;
    }
    class Geocoder {
      constructor();
      addressSearch(address: string, callback: (result: AddressResult[], status: Status) => void): void;
    }
  }
}

interface Window {
  kakao?: typeof kakao;
}
