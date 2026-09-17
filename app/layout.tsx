import type { Metadata, Viewport } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";

/**
 * 공유 미리보기(OG) 절대 주소 계산 — 배포 주소를 코드에 적지 않습니다.
 * 우선순위: APP_URL 환경변수 > Vercel이 주입한 배포 도메인 > 로컬 개발 서버(PORT)
 */
function siteUrl(): URL {
  const explicit = process.env.APP_URL;
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return new URL(`https://${vercel}`);
  return new URL(`http://127.0.0.1:${process.env.PORT ?? "3000"}`);
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "MarketFit — AI가 발견하는 나만의 중앙시장",
    template: "%s · MarketFit",
  },
  description: "사람마다 좋아하는 것이 다르듯, 좋아할 시장도 다릅니다. 취향을 AI로 분석해 대전 중앙시장의 잘 맞는 점포를 추천합니다.",
  applicationName: "MarketFit",
  openGraph: {
    title: "MarketFit — AI가 발견하는 나만의 중앙시장",
    description: "AI와 대화하거나 키워드를 입력하면 대전 중앙시장에서 나와 맞는 점포를 추천해요.",
    images: [{ url: "/images/og-cover.jpg", width: 1200, height: 630, alt: "MarketFit 로고와 대전 중앙시장 입구 — AI가 발견하는 나만의 중앙시장" }],
    locale: "ko_KR",
    type: "website",
    siteName: "MarketFit",
  },
  twitter: {
    card: "summary_large_image",
    title: "MarketFit — AI가 발견하는 나만의 중앙시장",
    images: ["/images/og-cover.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#fbf6ec",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="relative flex min-h-full flex-col">
        {/* 대전 중앙시장 입구 사진을 모든 페이지의 배경으로 사용 (상단은 선명하게, 아래로 갈수록 크림색으로) */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-cream">
          <div
            className="absolute inset-x-0 top-0 h-[78vh] scale-105 bg-cover bg-[center_28%] blur-[1px]"
            style={{ backgroundImage: "url(/images/jungang-market-bg.jpg)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-cream/72 via-cream/90 via-40% to-cream to-75%" />
          <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-market-900/10 to-transparent" />
        </div>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
