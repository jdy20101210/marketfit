import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "개인정보 처리 안내" };

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "1. 수집하는 정보",
    body: [
      "Instagram 연결 시(선택): Instagram 공식 API(Instagram API with Instagram Login)로 본인 계정의 사용자명, 계정 유형, 게시물 수, 최근 게시물 캡션을 조회합니다. 캡션에서 관심 키워드만 추출하며, 좋아요·팔로우·메시지 등 비공개 활동은 수집하지 않습니다.",
      "직접 입력한 관심 상품(3~5개), AI가 분석한 취향 점수, 점포에 대한 조회·좋아요·찜·방문·관심 없음 기록",
      "익명 식별자(무작위 ID)를 담은 쿠키. 이름·전화번호·이메일은 받지 않습니다.",
    ],
  },
  {
    title: "2. 이용 목적",
    body: ["대전 중앙시장 점포 개인화 추천, 추천 이유 생성, 상인용 익명 통계(5명 미만 집계는 공개하지 않음)"],
  },
  {
    title: "3. 외부 처리",
    body: [
      "취향 분석과 추천 이유 작성을 위해 관심 키워드·관심 상품·캡션 일부가 Google Gemini API로 전송될 수 있습니다(관리자가 키를 설정한 경우).",
      "지도 표시와 주소 좌표 변환에 Kakao 지도 API를 사용합니다(점포 주소만 전송).",
    ],
  },
  {
    title: "4. 보관과 보안",
    body: [
      "Instagram access token은 서버에서만 암호화(AES-256-GCM)해 보관하며 브라우저로 보내지 않습니다. 영구 저장소가 없는 환경에서는 토큰을 저장하지 않습니다.",
      "브라우저 저장소(localStorage)에는 입력한 관심 상품, Instagram 사용자명·관심 키워드 요약, 취향 분석 결과, 추천 결과, 좋아요·찜·방문·관심 없음 표시가 저장됩니다. 토큰·비밀번호는 저장하지 않으며 [내 데이터 삭제]로 지울 수 있습니다.",
      "상인 인사이트는 5명 이상의 익명 집계(취향 분포·행동 수)만 스냅샷으로 저장하며 개인 식별 정보는 포함하지 않습니다.",
    ],
  },
  {
    title: "5. 삭제",
    body: [
      "‘나의 취향’ 화면의 [내 데이터 삭제]로 서버·브라우저 데이터를 지울 수 있습니다.",
      "Instagram 설정의 앱 권한 제거 또는 Meta 데이터 삭제 요청 시 연결 정보·토큰과 관련 취향·행동 데이터를 삭제합니다.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="container-page max-w-3xl pt-6 sm:pt-10">
      <PageHeader eyebrow="PRIVACY" title="개인정보 처리 안내" description="MarketFit 프로토타입이 어떤 정보를 어떻게 다루는지 설명합니다." />
      <Card className="space-y-6 p-6 text-[15px] leading-relaxed text-ink-700">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="mb-2 text-base font-bold text-ink-900">{s.title}</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              {s.body.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-sm text-ink-500">
          데이터 삭제 요청 상태는 <Link href="/data-deletion" className="font-semibold text-market-700 underline">데이터 삭제 안내</Link>에서 확인할 수 있습니다. 본 문서는
          프로토타입용이며, 정식 서비스 전 운영 주체·문의처를 포함해 보완해야 합니다.
        </p>
      </Card>
    </div>
  );
}
