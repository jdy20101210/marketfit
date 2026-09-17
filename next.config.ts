import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
  // HTTPS 배포 환경에서 브라우저가 항상 HTTPS로 접속하도록 강제 (localhost http에는 무시됨).
  // preload 목록 등록은 되돌리기 어려워 기본값에서 뺐습니다(자체 도메인 운영 시 검토).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Supabase SDK는 서버 번들에서만 사용
  serverExternalPackages: ["@supabase/supabase-js"],
  // 이전 버전(/onboarding)의 링크·북마크를 새 취향 분석 화면으로 보냅니다.
  async redirects() {
    return [
      { source: "/onboarding", destination: "/discover", permanent: false },
      { source: "/onboarding/:path*", destination: "/discover", permanent: false },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
