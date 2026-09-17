import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Card, PageHeader } from "@/components/ui/Card";
import { Notice } from "@/components/ui/States";

export const metadata: Metadata = { title: "데이터 삭제 안내" };

export default async function DataDeletionPage() {
  await connection();
  return (
    <div className="container-page max-w-3xl pt-6 sm:pt-10">
      <PageHeader eyebrow="DATA DELETION" title="데이터 삭제 안내" description="MarketFit에 저장된 내 데이터를 지우는 방법입니다." />
      <Card className="space-y-3 p-6 text-[15px] leading-relaxed text-ink-700">
        <p>MarketFit은 이름·전화번호·이메일 같은 개인정보를 받지 않고, AI 인터뷰 대화 원문도 서버에 저장하지 않습니다. 저장되는 것은 아래 두 가지입니다.</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>익명 식별자(무작위 ID)에 연결된 취향 분석 결과(취향 점수·상황 정보·키워드)</li>
          <li>점포에 대한 조회·좋아요·저장·방문·관심 없음 기록</li>
        </ul>
        <p className="pt-2 font-semibold text-ink-900">삭제 방법</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <Link href="/profile" className="font-semibold text-market-700 underline">
              내 기록
            </Link>{" "}
            화면 아래의 [모든 기록 삭제]를 누르면 서버와 이 브라우저에 저장된 취향·행동 기록이 즉시 삭제됩니다.
          </li>
          <li>브라우저의 사이트 데이터(localStorage)를 지우면 이 브라우저에 남은 분석 기록이 함께 사라집니다.</li>
        </ol>
        <Notice tone="neutral" className="mt-3">
          상인·시장 인사이트에는 개인을 식별할 수 있는 정보가 포함되지 않으며, 실제 이용자 5명 미만일 때는 집계 대신 프로토타입 가상 데이터만 표시합니다.
        </Notice>
      </Card>
    </div>
  );
}
