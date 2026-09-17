"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import { Bookmark, Eye, Footprints, Heart, Lightbulb, Megaphone, Search, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, Spinner } from "@/components/ui/Button";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, Notice } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import { api, errorMessage } from "@/lib/client/api";
import type { MerchantPromoDraft } from "@/lib/providers/ai/types";
import type { MerchantInsights } from "@/lib/services/merchantInsights";
import { formatKstDateTime, formatNumber } from "@/lib/format";

export interface MerchantStoreOption {
  id: string;
  name: string;
  storeType: string;
  category: string;
}

interface PromoResponse {
  promo: MerchantPromoDraft;
  provider: "gemini" | "mock";
  model: string | null;
  fallbackReason: string | null;
  isMock: boolean;
  generatedAt: string;
}

const STAT_META = [
  { key: "interestUsers", label: "관심 사용자", icon: Eye },
  { key: "visits", label: "방문", icon: Footprints },
  { key: "likes", label: "좋아요", icon: Heart },
  { key: "saves", label: "저장", icon: Bookmark },
] as const;

function pct(n: number) {
  return `${n.toFixed(n >= 10 ? 0 : 1)}%`;
}

/** 관심도 막대 (색 + 수치, 색에만 의존하지 않음) */
function InterestBars({ rows }: { rows: MerchantInsights["interest"] }) {
  const max = Math.max(...rows.map((r) => r.share), 1);
  return (
    <ul className="mt-4 space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold text-ink-800">
              <span aria-hidden>{r.emoji}</span> {r.label}
            </span>
            <span className="tabular flex items-center gap-1.5 font-bold text-ink-900">
              {pct(r.share)}
              {r.change !== null && Math.abs(r.change) >= 0.03 ? (
                <span className={cn("text-[11px] font-semibold", r.change > 0 ? "text-market-700" : "text-ink-400")}>
                  {r.change > 0 ? "▲" : "▼"} {Math.abs(Math.round(r.change * 100))}%
                </span>
              ) : null}
            </span>
          </div>
          <div aria-hidden className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-market-600" style={{ width: `${(r.share / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 상인 전용 화면 — 집계 데이터만 사용합니다 (개인 식별 정보 없음).
 * AI 홍보 도우미는 원본 점포 목록에 있는 품목만 '확인된 정보'로 쓰고, 나머지는 아이디어로 표시합니다.
 */
export function MerchantClient({ stores, initial }: { stores: MerchantStoreOption[]; initial: MerchantInsights }) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [storeId, setStoreId] = useState<string>("");
  const [data, setData] = useState<MerchantInsights>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promo, setPromo] = useState<PromoResponse | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const matches = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    if (!q) return [];
    return stores.filter((s) => s.name.toLowerCase().includes(q) || s.storeType.toLowerCase().includes(q) || s.category.includes(q)).slice(0, 8);
  }, [deferred, stores]);

  const selected = stores.find((s) => s.id === storeId) ?? null;

  const load = async (id: string) => {
    setStoreId(id);
    setLoading(true);
    setError(null);
    setPromo(null);
    setPromoError(null);
    try {
      setData(await api.get<MerchantInsights>(`/api/merchant/insights${id ? `?storeId=${encodeURIComponent(id)}` : ""}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const makePromo = async () => {
    setPromoLoading(true);
    setPromoError(null);
    try {
      setPromo(await api.post<PromoResponse>("/api/merchant/promo", { storeId: storeId || null }));
    } catch (err) {
      setPromoError(errorMessage(err));
    } finally {
      setPromoLoading(false);
    }
  };

  return (
    <div className="container-page max-w-5xl pt-6 sm:pt-10">
      <PageHeader
        eyebrow="MERCHANT"
        title="상인 인사이트"
        description="시장과 우리 점포에 관심을 보인 이용자들의 취향을 익명 집계로 보여줘요. 진열·홍보 아이디어에 활용해 보세요."
      />

      <Notice tone="market" className="mb-4" icon={<ShieldCheck className="size-4" aria-hidden />}>
        개인을 식별할 수 있는 정보(계정, 입력 내용, 개별 방문 기록)는 제공하지 않아요. 실제 이용자가 {data.minUsers}명 미만이면 실제 집계 대신 프로토타입 가상
        데이터를 보여줘요.
      </Notice>

      <Card className="mb-4 p-4 sm:p-5">
        <label htmlFor={searchId} className="text-sm font-semibold text-ink-700">
          점포 선택 ({stores.length}개 중 검색)
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              id={searchId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="점포명 또는 품목 (예: 건어물, 정육)"
              className="h-11 w-full rounded-2xl border border-ink-200 bg-white pl-9 pr-3 text-[15px] outline-none placeholder:text-ink-400 focus:border-market-600 focus:ring-4 focus:ring-market-400/40"
            />
          </div>
          {storeId ? (
            <Button variant="secondary" onClick={() => void load("")} disabled={loading}>
              시장 전체 보기
            </Button>
          ) : null}
        </div>
        {matches.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {matches.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    void load(s.id);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-semibold",
                    s.id === storeId ? "border-market-600 bg-market-50 text-market-800" : "border-ink-200 bg-paper text-ink-700 hover:border-market-400",
                  )}
                >
                  {s.name}
                  <span className="ml-1.5 text-xs font-normal text-ink-500">{s.storeType}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : deferred.trim() ? (
          <p className="mt-2 text-sm text-ink-500">검색 결과가 없어요.</p>
        ) : null}
        <p className="mt-2 text-sm text-ink-600">
          현재 보는 범위: <strong className="text-ink-900">{selected ? selected.name : "중앙시장 전체"}</strong> · {data.period}
          {loading ? <Spinner className="ml-2 text-market-600" /> : null}
        </p>
      </Card>

      {error ? <ErrorState className="mb-4" title="집계를 불러오지 못했어요" message={error} action={<Button size="sm" onClick={() => void load(storeId)}>다시 시도</Button>} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <CardHeader
            title={`${data.period} 시장 관심도`}
            description={data.isMock ? "프로토타입 가상 집계" : `실제 이용자 ${data.distinctUsers}명 기준`}
            action={<Badge tone={data.isMock ? "sign" : "market"}>{data.isMock ? "가상 집계" : "실제 집계"}</Badge>}
          />
          <InterestBars rows={data.interest} />
          <p className="mt-3 text-xs leading-relaxed text-ink-500">{data.notice}</p>
        </Card>

        <div className="space-y-4">
          {data.metrics ? (
            <Card className="p-5 sm:p-6">
              <CardHeader title={`${data.metrics.name} 지표`} description={`${data.metrics.category} · ${data.metrics.entityLabel}`} />
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STAT_META.map((s) => (
                  <div key={s.key} className="rounded-2xl bg-cream/70 p-3 text-center">
                    <dt className="flex items-center justify-center gap-1 text-xs font-semibold text-ink-600">
                      <s.icon className="size-3.5" aria-hidden /> {s.label}
                    </dt>
                    <dd className="tabular mt-1 text-xl font-extrabold text-ink-900">{formatNumber(data.metrics![s.key])}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-ink-500">
                가상 집계 + 실제 기록 합계 (실제 기록: 조회 {data.metrics.real.view} · 좋아요 {data.metrics.real.like} · 저장 {data.metrics.real.bookmark} · 방문{" "}
                {data.metrics.real.visit})
              </p>
            </Card>
          ) : (
            <Card className="p-5 sm:p-6">
              <CardHeader title="관심은 높은데 방문이 적은 점포" description="관심 대비 방문 비율이 높은 순서예요." />
              <ul className="mt-3 divide-y divide-ink-100">
                {data.storeGaps.slice(0, 6).map((g) => (
                  <li key={g.storeId} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-800">{g.name}</p>
                      <p className="truncate text-xs text-ink-500">{g.category}</p>
                    </div>
                    <p className="tabular shrink-0 text-xs text-ink-600">
                      관심 {g.interestUsers} / 방문 {g.visits}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.rising.length ? (
            <Card className="p-5 sm:p-6">
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-1.5">
                    <TrendingUp className="size-4" aria-hidden /> 관심이 늘고 있는 분야
                  </span>
                }
                description="직전 같은 기간 대비 증가율"
              />
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {data.rising.map((r) => (
                  <li key={r.key} className="rounded-full bg-market-50 px-3 py-1.5 text-sm font-semibold text-market-800 ring-1 ring-market-100">
                    {r.emoji} {r.label} <span className="tabular">+{Math.round((r.change ?? 0) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {data.lowConversion.length ? (
            <Card className="p-5 sm:p-6">
              <CardHeader title="관심 대비 방문이 낮은 분야" description="관심 비중보다 방문 비중이 낮은 취향이에요." />
              <ul className="mt-3 space-y-2">
                {data.lowConversion.map((g) => (
                  <li key={g.key} className="rounded-2xl bg-sign-50 px-3 py-2 text-sm text-ink-800 ring-1 ring-sign-200">
                    <strong>{g.label}</strong> · 관심 {pct(g.interestShare)} ↔ 방문 {pct(g.visitShare)}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="mt-4 p-5 sm:p-6">
        <CardHeader
          title={
            <span className="inline-flex items-center gap-1.5">
              <Megaphone className="size-4" aria-hidden /> AI 홍보 도우미
            </span>
          }
          description="집계된 관심사와 원본 점포 정보만 사용해 진열·홍보 아이디어를 만들어요."
          action={
            <Button onClick={() => void makePromo()} loading={promoLoading} icon={<Sparkles className="size-4" aria-hidden />}>
              {promo ? "다시 만들기" : "아이디어 만들기"}
            </Button>
          }
        />
        {promoError ? <ErrorState className="mt-3" title="아이디어를 만들지 못했어요" message={promoError} /> : null}
        {!promo && !promoLoading && !promoError ? (
          <EmptyState
            className="mt-4"
            icon={<Lightbulb className="size-6" aria-hidden />}
            title="아직 만든 아이디어가 없어요"
            description={`${selected ? selected.name : "중앙시장 전체"} 기준으로 고객 관심사 요약, 진열 아이디어, 홍보 키워드, SNS 문구 초안을 만들어 드려요.`}
          />
        ) : null}
        {promo ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={promo.provider === "gemini" ? "market" : "sign"}>{promo.provider === "gemini" ? `Gemini${promo.model ? ` · ${promo.model}` : ""}` : "데모 AI(템플릿)"}</Badge>
              <Badge tone="outline">{formatKstDateTime(promo.generatedAt)}</Badge>
              {promo.fallbackReason ? <Badge tone="brick">AI 실패 → 템플릿 사용</Badge> : null}
            </div>

            <section>
              <h3 className="text-sm font-bold text-ink-900">1. 고객 관심사 요약</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-700">{promo.promo.interestSummary}</p>
            </section>
            <section>
              <h3 className="text-sm font-bold text-ink-900">2. 관심 대비 방문</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-700">{promo.promo.conversionInsight}</p>
            </section>
            <section>
              <h3 className="text-sm font-bold text-ink-900">3. 상품·진열 아이디어</h3>
              <ul className="mt-2 space-y-2">
                {promo.promo.displayIdeas.map((idea) => (
                  <li key={idea.title} className="rounded-2xl bg-cream/70 p-3">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink-900">
                      {idea.title}
                      <Badge tone={idea.basis === "confirmed" ? "market" : "outline"}>{idea.basis === "confirmed" ? "원본 품목 기반" : "아이디어(추정)"}</Badge>
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-700">{idea.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="text-sm font-bold text-ink-900">4. 홍보 키워드</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {promo.promo.keywords.map((k) => (
                  <li key={k} className="rounded-full bg-market-50 px-3 py-1 text-sm font-semibold text-market-800 ring-1 ring-market-100">
                    {k}
                  </li>
                ))}
              </ul>
            </section>
            {promo.promo.snsCopy ? (
              <section>
                <h3 className="text-sm font-bold text-ink-900">5. SNS 홍보 문구 초안</h3>
                <p className="mt-1 whitespace-pre-wrap rounded-2xl border border-ink-200 bg-white p-3 text-[15px] leading-relaxed text-ink-800">{promo.promo.snsCopy}</p>
                <Button
                  className="mt-2"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(`${promo.promo.snsCopy}\n${promo.promo.keywords.join(" ")}`).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                >
                  {copied ? "복사했어요" : "문구·키워드 복사"}
                </Button>
              </section>
            ) : null}
            {promo.promo.eventIdeas.length ? (
              <section>
                <h3 className="text-sm font-bold text-ink-900">6. 이벤트 아이디어</h3>
                <ul className="mt-2 space-y-2">
                  {promo.promo.eventIdeas.map((e) => (
                    <li key={e.title} className="rounded-2xl bg-sign-50 p-3 ring-1 ring-sign-200">
                      <p className="text-sm font-bold text-ink-900">{e.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-ink-700">{e.detail}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <Notice tone="neutral">
              아이디어는 참고용 제안이에요. 실제로 판매하지 않는 상품·서비스나 가격·할인은 그대로 쓰지 말고, 직접 확인한 내용으로 바꿔서 사용해 주세요.
            </Notice>
          </div>
        ) : null}
      </Card>

      <p className="mt-4 text-xs text-ink-500">집계 시각 {formatKstDateTime(data.generatedAt)}</p>
    </div>
  );
}
