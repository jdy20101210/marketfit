import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { CircleCheck } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/Card";
import { Notice } from "@/components/ui/States";
import { readDeletionCode } from "@/lib/services/metaCallbacks";

export const metadata: Metadata = { title: "데이터 삭제 안내" };

export default async function DataDeletionPage(props: PageProps<"/data-deletion">) {
  await connection();
  const params = await props.searchParams;
  const code = typeof params.code === "string" ? params.code : null;
  const status = code ? readDeletionCode(code) : null;

  return (
    <div className="container-page max-w-3xl pt-6 sm:pt-10">
      <PageHeader eyebrow="DATA DELETION" title="데이터 삭제 안내" />
      {code ? (
        status ? (
          <Notice tone="market" className="mb-4" icon={<CircleCheck className="size-4" aria-hidden />}>
            삭제 요청이 처리되었습니다 ({new Date(status.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}). Instagram 연결 정보와 관련 취향·행동 데이터가 삭제되었습니다.
          </Notice>
        ) : (
          <Notice className="mb-4">확인할 수 없는 삭제 요청 코드입니다.</Notice>
        )
      ) : null}
      <Card className="space-y-3 p-6 text-[15px] leading-relaxed text-ink-700">
        <p>MarketFit에 저장된 내 데이터는 다음 방법으로 삭제할 수 있습니다.</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <Link href="/profile" className="font-semibold text-market-700 underline">
              나의 취향
            </Link>{" "}
            화면 하단의 [내 데이터 삭제]를 누르면 서버와 이 브라우저의 취향·행동 기록, Instagram 연결 정보가 즉시 삭제됩니다.
          </li>
          <li>Instagram 앱 → 설정 → 보안 → 앱 및 웹사이트에서 MarketFit 권한을 제거하면 연결 정보와 토큰이 삭제됩니다.</li>
          <li>Meta를 통한 데이터 삭제 요청은 자동으로 처리되며, 확인 코드로 이 페이지에서 처리 결과를 볼 수 있습니다.</li>
        </ol>
      </Card>
    </div>
  );
}
