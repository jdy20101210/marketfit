"use client";

import { useId, useState } from "react";
import { Bookmark, Eye, Footprints, Heart, Lightbulb, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Button";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { ErrorState, Notice } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import { api, errorMessage } from "@/lib/client/api";
import { TASTE_META } from "@/lib/recommendation/dimensions";
import type { MerchantInsights } from "@/lib/services/merchantInsights";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STAT_META = [
  { key: "view", label: "조회", icon: Eye },
  { key: "like", label: "좋아요", icon: Heart },
  { key: "bookmark", label: "찜", icon: Bookmark },
  { key: "visit", label: "방문", icon: Footprints },
] as const;

export function MerchantClient({ stores, initial }: { stores: { id: string; name: string; storeType: string }[]; initial: MerchantInsights }) {
  const selectId = useId();
  const [storeId, setStoreId] = useState<string>("");
  const [data, setData] = useState<MerchantInsights>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (id: string) => {
    setStoreId(id);
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<MerchantInsights>(`/api/merchant/insights${id ? `?storeId=${encodeURIComponent(id)}` : ""}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const selected = stores.find((s) => s.id === storeId);

  return (
    <div className="container-page max-w-5xl pt-6 sm:pt-10">
      <PageHeader
        eyebrow="MERCHANT"
        title="상인 인사이트"
        description="우리 점포에 관심을 보인 이용자들이 어떤 취향을 가졌는지 익명 집계로 보여줘요. 진열·구성 아이디어에 활용해보세요."
      />

      <Notice tone="market" className="mb-4" icon={<ShieldCheck className="size-4" aria-hidden />}>
        개인을 식별할 수 있는 정보(계정, 입력 내용, 방문 기록 목록)는 제공하지 않아요. 이용자가 {data.minUsers}명 미만이면 실제 집계 대신 데모 데이터를 보여줘요.
      </Notice>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1 sm:max-w-sm">
          <label htmlFor={selectId} className="mb-1 block text-sm font-semibold text-ink-800">
            점포 선택
          </label>
          <select
            id={selectId}
            value={storeId}
            onChange={(e) => void load(e.target.value)}
            className="h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm outline-none focus:border-market-600 focus:ring-4 focus:ring-market-400/40"
          >
            <option value="">중앙시장 전체</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.storeType})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 pb-1">
          {data.isMock ? <Badge tone="sign">데모 데이터</Badge> : <Badge tone="market">실제 익명 집계 · {data.distinctUsers}명</Badge>}
          {loading ? <Spinner className="text-market-600" /> : null}
        </div>
      </div>

      {error ? <ErrorState className="mb-4" message={error} /> : null}

      <div className={cn("grid gap-4 transition-opacity lg:grid-cols-[1.2fr_1fr]", loading && "opacity-60")}>
        <Card className="p-5 sm:p-6">
          <CardHeader
            title={selected ? `${selected.name}에 관심을 보인 이용자의 주요 취향` : "최근 방문·관심 이용자의 주요 취향"}
            description={
              data.isMock
                ? "데모 데이터 · 실제 이용 데이터가 쌓이면 자동으로 바뀌어요."
                : `좋아요·찜·방문한 이용자의 최신 취향 프로필 기준 (상위 5개, 합계 100%) · ${formatTime(data.generatedAt)} 집계, 5분마다 갱신`
            }
          />
          <ul className="mt-5 space-y-3" aria-label="취향 분포">
            {data.tasteShare.map((t, i) => (
              <li key={t.key} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
                  <span aria-hidden>{TASTE_META[t.key].emoji}</span>
                  {TASTE_META[t.key].label}
                </span>
                <span className="relative h-4 rounded-r-[4px] bg-ink-100" aria-hidden>
                  <span
                    className={cn("absolute inset-y-0 left-0 rounded-r-[4px]", i === 0 ? "bg-market-600" : "bg-market-400")}
                    style={{ width: `${Math.max(2, t.share)}%` }}
                  />
                </span>
                <span className="tabular text-right text-sm font-bold text-ink-900">{t.share}%</span>
              </li>
            ))}
          </ul>
          <details className="mt-4 text-sm text-ink-600">
            <summary className="cursor-pointer font-medium text-ink-700">표로 보기</summary>
            <table className="mt-2 w-full text-left">
              <caption className="sr-only">취향 분포 표</caption>
              <thead>
                <tr className="border-b border-ink-200 text-xs text-ink-500">
                  <th scope="col" className="py-1.5 font-medium">
                    취향
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    비율
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.tasteShare.map((t) => (
                  <tr key={t.key} className="border-b border-ink-100">
                    <th scope="row" className="py-1.5 font-normal">
                      {TASTE_META[t.key].label}
                    </th>
                    <td className="tabular py-1.5 text-right">{t.share}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {STAT_META.map((s) => (
              <Card key={s.key} className="p-4">
                <p className="flex items-center gap-1.5 text-sm text-ink-600">
                  <s.icon className="size-4" aria-hidden /> {s.label}
                </p>
                <p className="mt-1 text-3xl font-extrabold text-ink-900">{data.interactionCounts[s.key] ?? 0}</p>
              </Card>
            ))}
          </div>

          <Card className="p-5 sm:p-6">
            <CardHeader title="추천 상품 아이디어" description="취향 분포에서 도출한 진열·구성 제안이에요." />
            <ul className="mt-4 space-y-2">
              {data.productIdeas.map((idea) => (
                <li key={idea} className="flex items-start gap-2 rounded-2xl bg-sign-50 px-3.5 py-3 text-sm font-semibold text-ink-800">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-sign-600" aria-hidden />
                  {idea}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
