import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, Bot, Camera, Layers, MapPinned, PenLine, Sparkles } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { ModeBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { getPublicModes } from "@/lib/config/integrations";
import { getStoreCatalog, SEED_META } from "@/lib/stores/catalog";
import { STORE_CATEGORIES } from "@/lib/stores/types";

function steps(modes: Awaited<ReturnType<typeof getPublicModes>>) {
  return [
    {
      icon: Camera,
      title: "관심사 모으기",
      body: modes.instagram === "real" ? "Instagram 공식 API와 직접 입력한 관심 상품 3~5개" : "Instagram(현재 데모 데이터)과 직접 입력한 관심 상품 3~5개",
    },
    {
      icon: Bot,
      title: "AI 취향 분석",
      body:
        modes.ai === "gemini"
          ? "Gemini가 17가지 취향 차원으로 나의 취향 vector를 만들어요"
          : "데모 AI(키워드 규칙)가 17가지 취향 차원으로 취향 vector를 만들어요 · Gemini 연결 시 자동 전환",
    },
    { icon: Layers, title: "점포와 매칭", body: "40개 점포·상권의 성향과 cosine 유사도로 점수를 계산해요" },
    {
      icon: MapPinned,
      title: "취향 지도 탐색",
      body: modes.map === "kakao" ? "Kakao 지도에서 나와 잘 맞는 점포를 발견해요" : "지도(현재 데모 안내도)에서 나와 잘 맞는 점포를 발견해요",
    },
  ];
}

export default async function HomePage() {
  await connection();
  const [modes, catalog] = await Promise.all([getPublicModes(), getStoreCatalog()]);
  const categoryCounts = STORE_CATEGORIES.map((c) => ({
    category: c,
    count: catalog.stores.filter((s) => s.features.categories.includes(c)).length,
  })).filter((c) => c.count > 0);

  return (
    <div>
      {/* 히어로: 대전 중앙시장 입구 사진을 전면 배경으로 사용 */}
      <section className="on-dark relative isolate overflow-hidden" aria-labelledby="hero-title">
        <Image
          src="/images/jungang-market-gate@2x.jpg"
          alt="대전 중앙시장 입구 — 초록 아치 아래 금빛 '중앙시장' 간판과 시장 골목"
          fill
          preload
          sizes="100vw"
          className="-z-20 object-cover object-[center_22%] lg:object-[center_30%]"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-market-900 via-market-900/70 via-45% to-market-900/5 lg:bg-gradient-to-r lg:from-market-900/95 lg:via-market-900/70 lg:to-market-900/10" />
        <div className="container-page flex min-h-[640px] flex-col justify-end pb-10 pt-56 sm:min-h-[620px] lg:min-h-[600px] lg:justify-center lg:pb-16 lg:pt-16">
          <div className="max-w-xl animate-rise text-white">
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/25 backdrop-blur">
              <Sparkles className="size-3.5 text-sign-300" aria-hidden /> 대전 중앙시장 AI 개인화 추천
            </p>
            <h1 id="hero-title" className="text-[36px] font-extrabold leading-[1.18] tracking-tight drop-shadow-sm sm:text-5xl lg:text-[56px]">
              AI가 발견하는
              <br />
              <span className="mt-2 inline-block rounded-2xl border-4 border-sign-500 bg-sign-400 px-3 pb-1 text-ink-900 shadow-float">
                나만의 중앙시장
              </span>
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-white/90">
              사람마다 좋아하는 것이 다르듯,
              <br />
              좋아할 시장도 다릅니다.
            </p>

            <div className="mt-7 grid gap-2.5 sm:max-w-md">
              <LinkButton href="/onboarding?mode=instagram" size="lg" variant="secondary" className="border-transparent" icon={<Camera className="size-5" aria-hidden />}>
                Instagram으로 취향 분석
              </LinkButton>
              <LinkButton
                href="/onboarding?mode=manual"
                size="lg"
                variant="ghost"
                className="bg-white/10 text-white ring-1 ring-white/40 backdrop-blur hover:bg-white/20"
                icon={<PenLine className="size-5" aria-hidden />}
              >
                관심 상품 직접 입력
              </LinkButton>
              <LinkButton href="/onboarding?mode=both" size="lg" variant="sign" icon={<Sparkles className="size-5" aria-hidden />}>
                둘 다 사용하기
              </LinkButton>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="현재 연동 상태">
              <ModeBadge real={modes.instagram === "real"} realLabel="Instagram 실제 연동" mockLabel="Instagram 데모 모드" />
              <ModeBadge real={modes.ai === "gemini"} realLabel="Gemini AI 분석" mockLabel="데모 AI 분석" />
              <ModeBadge real={modes.map === "kakao"} realLabel="Kakao 지도" mockLabel="데모 안내도" />
            </div>
          </div>
        </div>
        <p className="absolute right-4 top-4 hidden rounded-full bg-ink-900/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur sm:block">
          대전광역시 동구 · 대전 중앙시장 · {catalog.stores.length}개 점포·상권
        </p>
      </section>

      <div className="container-page">
      <section className="mt-14" aria-labelledby="how-title">
        <h2 id="how-title" className="text-xl font-extrabold text-ink-900">
          이렇게 추천해요
        </h2>
        <ol className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {steps(modes).map((step, i) => (
            <li key={step.title}>
              <Card className="h-full p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl bg-market-50 text-market-700">
                    <step.icon className="size-5" aria-hidden />
                  </span>
                  <span className="text-xs font-bold text-sign-700">STEP {i + 1}</span>
                </div>
                <p className="mt-3 font-bold text-ink-900">{step.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-600 sm:text-sm">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12" aria-labelledby="data-title">
        <Card className="overflow-hidden">
          <div aria-hidden className="awning h-2" />
          <div className="grid gap-6 p-6 md:grid-cols-[1fr_1.2fr] md:p-8">
            <div>
              <h2 id="data-title" className="text-xl font-extrabold text-ink-900">
                실제 중앙시장 데이터로 추천해요
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {SEED_META.sourceFile}의 {SEED_META.rowCount}개 점포·상권만 사용합니다. 존재하지 않는 점포를 만들지 않고, 확인되지 않은 연락처와 위치는 그대로
                &lsquo;미확인&rsquo;으로 표시해요.
              </p>
              <Link href="/market-map" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-market-700 hover:underline">
                시장 지도 둘러보기 <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <ul className="flex flex-wrap content-start gap-2" aria-label="카테고리별 점포 수">
              {categoryCounts.map((c) => (
                <li key={c.category} className="rounded-2xl border border-ink-200 bg-cream px-3.5 py-2 text-sm">
                  <span className="font-semibold text-ink-800">{c.category}</span>
                  <span className="tabular ml-1.5 text-ink-500">{c.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </section>
      </div>
    </div>
  );
}
