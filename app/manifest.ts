import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MarketFit — AI가 발견하는 나만의 중앙시장",
    short_name: "MarketFit",
    description: "취향을 AI로 분석해 대전 중앙시장의 잘 맞는 점포를 추천합니다.",
    lang: "ko",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf6ec",
    theme_color: "#fbf6ec",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
