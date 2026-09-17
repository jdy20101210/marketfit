import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, ShieldCheck, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Notice } from "@/components/ui/States";
import { INTEREST_DAYS, interestSeries } from "@/lib/mock/marketInterest";
import { getMerchantInsights } from "@/lib/services/merchantInsights";
import { getStoreCatalog, MOCK_ACTIVITY_META, SEED_META } from "@/lib/stores/catalog";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: "시장 인사이트",
  description: "대전 중앙시장 전체의 관심 카테고리와 관심 대비 방문 차이를 집계로 보여줍니다.",
};

function pct(n: number) {
  return `${n.toFixed(n >= 10 ? 0 : 1)}%`;
}

/** 관심 추이 스파크라인 (SVG, 값은 표로도 제공) */
function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-24 shrink-0" role="img" aria-label={`${label} 최근 ${values.length}일 추이`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default async function MarketInsightPage() {
  await connection();
  const [insights, catalog] = await Promise.all([getMerchantInsights(null), getStoreCatalog()]);

  return (
    <div className="container-page max-w-4xl pt-6 sm:pt-10">
      <PageHeader
        eyebrow="MARKET INSIGHT"
        title="중앙시장 전체 인사이트"
        description={`${insights.period} 동안 이용자들이 어떤 취향에 관심을 보였는지, 관심 대비 방문이 적은 분야는 무엇인지 집계로 보여줘요.`}
      />

      <Notice tone="market" className="mb-4" icon={<ShieldCheck className="size-4" aria-hidden />}>
        개별 이용자의 신원·입력 내용은 표시하지 않고 집계 값만 사용해요. {insights.isMock ? "실제 이용자가 적어 지금은 프로토타입 가상 집계를 보여줍니다." : `실제 이용자 ${insights.distinctUsers}명 기준입니다.`}
      </Notice>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <CardHeader
            title="관심 카테고리"
            description={`${insights.period} 관심 비중`}
            action={<Badge tone={insights.isMock ? "sign" : "market"}>{insights.isMock ? "가상 집계" : "실제 집계"}</Badge>}
          />
          <ul className="mt-4 space-y-3">
            {insights.interest.map((row) => (
              <li key={row.key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm font-semibold text-ink-800">
                  <span aria-hidden>{row.emoji}</span> {row.label}
                </span>
                <span className="tabular w-12 shrink-0 text-sm font-bold text-ink-900">{pct(row.share)}</span>
                <span aria-hidden className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-100">
                  <span className="block h-full rounded-full bg-market-600" style={{ width: `${(row.share / Math.max(...insights.interest.map((r) => r.share), 1)) * 100}%` }} />
                </span>
                <span className="text-market-600">
                  <Spark values={interestSeries(row.key)} label={row.label} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-500">추이는 최근 {INTEREST_DAYS}일 기준이에요. {insights.notice}</p>
        </Card>

        <div className="space-y-4">
          <Card className="p-5 sm:p-6">
            <CardHeader
              title={
                <span className="inline-flex items-center gap-1.5">
                  <TrendingUp className="size-4" aria-hidden /> 최근 관심이 늘어난 분야
                </span>
              }
              description="직전 같은 기간 대비 증가율"
            />
            {insights.rising.length ? (
              <ul className="mt-3 space-y-2">
                {insights.rising.map((r) => (
                  <li key={r.key} className="flex items-center justify-between gap-2 rounded-2xl bg-market-50 px-3 py-2 ring-1 ring-market-100">
                    <span className="text-sm font-semibold text-market-900">
                      {r.emoji} {r.label}
                    </span>
                    <span className="tabular text-sm font-bold text-market-700">+{Math.round((r.change ?? 0) * 100)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-500">뚜렷하게 늘어난 분야가 아직 없어요.</p>
            )}
          </Card>

          <Card className="p-5 sm:p-6">
            <CardHeader title="관심은 높은데 방문이 적은 분야" description="관심 비중과 방문 비중의 차이예요." />
            {insights.lowConversion.length ? (
              <ul className="mt-3 space-y-2">
                {insights.lowConversion.map((g) => (
                  <li key={g.key} className="rounded-2xl bg-sign-50 px-3 py-2 text-sm text-ink-800 ring-1 ring-sign-200">
                    <strong>{g.label}</strong> · 관심 {pct(g.interestShare)} ↔ 방문 {pct(g.visitShare)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-500">관심과 방문 비중이 크게 차이 나는 분야는 없어요.</p>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-4 p-5 sm:p-6">
        <CardHeader title="점포별 관심 대비 방문" description="관심 사용자 수 대비 방문이 적은 점포 순서예요. 홍보·안내를 보강하면 좋은 곳이에요." />
        <ul className="mt-3 divide-y divide-ink-100">
          {insights.storeGaps.map((g) => (
            <li key={g.storeId} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <Link href={`/store/${g.storeId}`} className="truncate font-semibold text-ink-900 hover:text-market-700">
                  {g.name}
                </Link>
                <p className="truncate text-xs text-ink-500">{g.category}</p>
              </div>
              <p className="tabular shrink-0 text-sm text-ink-700">
                관심 {formatNumber(g.interestUsers)} / 방문 {formatNumber(g.visits)}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-ink-500">{MOCK_ACTIVITY_META.notice}</p>
      </Card>

      <Card className="mt-4 p-5 sm:p-6">
        <CardHeader title="데이터 출처" description={`${SEED_META.source.split(" (")[0]} · ${catalog.stores.length}개 점포·상권`} />
        <p className="mt-2 text-sm leading-relaxed text-ink-600">{SEED_META.notice}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton href="/merchant" variant="secondary" icon={<ArrowRight className="size-4" aria-hidden />}>
            상인 인사이트 보기
          </LinkButton>
          <LinkButton href="/discover">내 취향 분석하기</LinkButton>
        </div>
      </Card>
    </div>
  );
}
