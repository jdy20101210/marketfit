"use client";

const SDK_URL = "https://dapi.kakao.com/v2/maps/sdk.js";
let loading: { key: string; promise: Promise<typeof kakao> } | null = null;

export class KakaoSdkError extends Error {}

/**
 * Kakao Maps JavaScript SDK 동적 로드 (autoload=false → kakao.maps.load)
 * JavaScript 키는 브라우저용 공개 키이며, 카카오 콘솔에 등록된 도메인에서만 동작합니다.
 */
export function loadKakaoMaps(appKey: string, timeoutMs = 10_000): Promise<typeof kakao> {
  if (typeof window === "undefined") return Promise.reject(new KakaoSdkError("브라우저에서만 사용할 수 있습니다."));
  if (window.kakao?.maps?.LatLng) return Promise.resolve(window.kakao);
  if (loading && loading.key === appKey) return loading.promise;

  const promise = new Promise<typeof kakao>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(
        new KakaoSdkError(
          "Kakao 지도 SDK 응답이 없습니다. JavaScript 키, [JavaScript SDK 도메인] 등록, [카카오맵] 사용 설정(ON)을 확인해주세요.",
        ),
      );
    }, timeoutMs);

    const script = document.createElement("script");
    script.src = `${SDK_URL}?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=services,clusterer`;
    script.async = true;
    script.dataset.marketfit = "kakao-sdk";
    script.onload = () => {
      const k = window.kakao;
      if (!k?.maps?.load) {
        window.clearTimeout(timer);
        reject(new KakaoSdkError("Kakao 지도 SDK를 초기화하지 못했습니다. 앱 키와 도메인 설정을 확인해주세요."));
        return;
      }
      k.maps.load(() => {
        window.clearTimeout(timer);
        resolve(k);
      });
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new KakaoSdkError("Kakao 지도 SDK를 불러오지 못했습니다. 네트워크 또는 앱 키를 확인해주세요."));
    };
    document.head.appendChild(script);
  });

  loading = { key: appKey, promise };
  promise.catch(() => {
    if (loading?.promise === promise) loading = null;
  });
  return promise;
}
