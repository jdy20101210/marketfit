import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/Card";

export const metadata: Metadata = { title: "개인정보 처리 안내" };

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "1. 수집하는 정보",
    body: [
      "AI 인터뷰에서 입력한 답변과 빠른 키워드. 대화 원문은 서버에 저장하지 않고, 분석할 때만 전송한 뒤 구조화된 취향 값(취향 점수·목적·예산대·동행·상황 등)으로만 남깁니다.",
      "AI가 분석한 취향 점수와 상황 정보, 점포에 대한 조회·좋아요·저장·방문·관심 없음 기록",
      "익명 식별자(무작위 ID)를 담은 쿠키. 이름·전화번호·이메일·소셜 계정 연동은 사용하지 않습니다.",
    ],
  },
  {
    title: "2. 이용 목적",
    body: ["대전 중앙시장 점포 개인화 추천, 추천 이유 생성, 상인·시장용 익명 통계(실제 이용자 5명 미만이면 가상 집계만 표시)"],
  },
  {
    title: "3. 외부 처리",
    body: [
      "취향 해석·추천 이유·홍보 문구는 이 서비스 서버 안의 챗봇 엔진이 직접 만듭니다. 대화 내용과 키워드를 외부 AI API(Gemini, ChatGPT 등)로 보내지 않습니다.",
      "지도 표시와 주소 좌표 변환에 Kakao 지도 API를 사용합니다(점포 주소만 전송). REST API 키는 서버에서만 사용합니다.",
      "추천 순위와 점수는 외부 AI가 아니라 서버의 알고리즘(코사인 유사도)이 계산합니다.",
    ],
  },
  {
    title: "4. 보관과 보안",
    body: [
      "브라우저 저장소(localStorage)에는 입력한 키워드, 진행 중인 대화, 취향 분석 결과(버전 기록), 추천 결과, 좋아요·저장·방문·관심 없음 표시가 저장됩니다. 비밀 값은 저장하지 않습니다.",
      "서버에는 익명 식별자에 연결된 취향 값과 행동 기록만 저장하며, 영구 저장소(Supabase)가 없으면 브라우저에만 보관됩니다.",
      "상인·시장 인사이트는 집계 값만 사용하고 개인 식별 정보는 포함하지 않습니다.",
    ],
  },
  {
    title: "5. 삭제",
    body: ["‘내 기록’ 화면의 [모든 기록 삭제]로 서버·브라우저 데이터를 즉시 지울 수 있습니다."],
  },
  {
    title: "6. 점포 정보의 출처",
    body: [
      "점포명·주소·연락처·품목은 대전중앙시장 공식 사이트 점포 목록에서 수집한 원본 값만 사용하며, 임의로 만들어내지 않습니다.",
      "AI·규칙으로 추정한 점포 성향(취향 feature)은 원본 정보와 구분해 ‘추정’으로 표시합니다.",
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
            <h2 className="font-bold text-ink-900">{s.title}</h2>
            <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
              {s.body.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="border-t border-ink-100 pt-4 text-sm text-ink-500">
          데이터 삭제 방법은{" "}
          <Link href="/data-deletion" className="font-semibold text-market-700 underline">
            데이터 삭제 안내
          </Link>
          를 참고하세요.
        </p>
      </Card>
    </div>
  );
}
