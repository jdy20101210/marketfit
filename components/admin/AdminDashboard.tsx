"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, FlaskConical, ChevronDown, Database, KeyRound, LocateFixed, LogOut, Map as MapIcon, RefreshCw, Settings, TriangleAlert, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { ErrorState, Notice } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import { AccuracyBadge } from "@/components/stores/StoreBits";
import type { StoreDTO } from "@/lib/api/schemas";
import { api, errorMessage } from "@/lib/client/api";
import { TASTE_META, topTastes, toVector } from "@/lib/recommendation/dimensions";
import type { SystemStatus, TestResult } from "@/lib/services/status";
import { ENTITY_KIND_LABEL } from "@/lib/stores/parse";
import { MARKET_FEATURE_KEYS, MARKET_FEATURE_META } from "@/lib/stores/types";

type TestTarget = "ai" | "kakao" | "mock" | "database";

export function AdminDashboard({ status, stores, devOpen }: { status: SystemStatus; stores: StoreDTO[]; devOpen: boolean }) {
  const router = useRouter();
  const [tests, setTests] = useState<Partial<Record<TestTarget, TestResult>>>({});
  const [testing, setTesting] = useState<TestTarget | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const runTest = async (target: TestTarget) => {
    setTesting(target);
    try {
      const result = await api.post<TestResult>("/api/admin/test", { target });
      setTests((t) => ({ ...t, [target]: result }));
    } catch (err) {
      setTests((t) => ({ ...t, [target]: { ok: false, message: errorMessage(err), at: new Date().toISOString() } }));
    } finally {
      setTesting(null);
    }
  };

  const runAction = async (name: string, fn: () => Promise<string>) => {
    setAction(name);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await fn() });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) });
    } finally {
      setAction(null);
    }
  };

  const warnings: string[] = [...status.environment.warnings.map((w) => `환경변수 형식 오류로 무시됨: ${w}`)];
  if (status.environment.secretSource === "ephemeral") warnings.push("APP_SECRET이 없어 임시 암호화 키를 사용 중입니다. 서버가 재시작되면 저장된 연동 키를 읽을 수 없어요.");
  if (status.environment.vercel && status.database.kind === "memory")
    warnings.push("Vercel에서 DB 없이 실행 중입니다. 관리자 화면에서 입력한 키·행동 데이터가 인스턴스 재시작 시 사라질 수 있어요 → Supabase 연결 또는 환경변수 등록을 권장해요.");
  if (status.database.health?.lastError) warnings.push(`Supabase 오류: ${status.database.health.lastError}`);

  return (
    <div className="container-page max-w-6xl pt-6 sm:pt-10">
      <PageHeader eyebrow="ADMIN" title="관리자 대시보드" description="외부 연동 상태, 점포 데이터와 추천 feature를 확인해요. API 키 값은 화면에 표시하지 않아요.">
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/admin/integrations" className={buttonClass("primary", "md")}>
            <KeyRound className="size-4" aria-hidden /> 연동 설정 (키 입력)
          </Link>
          {!devOpen ? (
            <Button
              variant="secondary"
              icon={<LogOut className="size-4" aria-hidden />}
              onClick={async () => {
                await api.post("/api/admin/logout");
                router.refresh();
              }}
            >
              로그아웃
            </Button>
          ) : null}
        </div>
      </PageHeader>

      {devOpen ? (
        <Notice className="mb-4" icon={<TriangleAlert className="size-4" aria-hidden />}>
          개발 모드라 비밀번호 없이 열려 있어요. 배포 전 <code>ADMIN_PASSWORD</code> 환경변수를 설정하세요.
        </Notice>
      ) : null}
      {warnings.map((w) => (
        <Notice key={w} className="mb-2" icon={<TriangleAlert className="size-4" aria-hidden />}>
          {w}
        </Notice>
      ))}

      <section aria-labelledby="status-title" className="mt-4">
        <h2 id="status-title" className="mb-3 text-lg font-extrabold text-ink-900">
          연동 상태
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard
            icon={<Bot className="size-5" aria-hidden />}
            title="AI 엔진"
            state={status.ai.status}
            good={status.ai.status === "ACTIVE"}
            lines={[status.ai.engine, "외부 AI API 호출 없음 · 키 설정 불필요"]}
            test={tests.ai ?? status.ai.lastTest}
            testing={testing === "ai"}
            onTest={() => runTest("ai")}
          />
          <StatusCard
            icon={<FlaskConical className="size-5" aria-hidden />}
            title="Mock 데이터"
            state="LOADED"
            good
            lines={[`점포 seed: ${status.mock.storeSeed}`, "방문·좋아요·저장 집계는 프로토타입용 고정 가상값"]}
            test={tests.mock ?? status.mock.lastTest}
            testing={testing === "mock"}
            onTest={() => runTest("mock")}
          />
          <StatusCard
            icon={<MapIcon className="size-5" aria-hidden />}
            title="Kakao Map"
            state={status.map.mode}
            good={status.map.mode === "REAL"}
            lines={[`좌표 변환(Local API): ${status.map.geocoding}`, `좌표 확인 ${status.map.locatedStores}/${status.map.totalStores}곳 (정확 ${status.map.exactStores})`]}
            test={tests.kakao ?? status.map.lastTest}
            testing={testing === "kakao"}
            onTest={() => runTest("kakao")}
          />
          <StatusCard
            icon={<Database className="size-5" aria-hidden />}
            title="Database"
            state={status.database.kind.toUpperCase()}
            good={status.database.persistent}
            lines={[status.database.persistent ? "영구 저장" : "임시 저장(메모리)", `점포 데이터: ${status.database.storeSource === "database" ? "Supabase" : "seed JSON"}`]}
            test={tests.database ?? status.database.lastTest}
            testing={testing === "database"}
            onTest={() => runTest("database")}
          />
        </div>
      </section>

      <section aria-labelledby="actions-title" className="mt-8">
        <h2 id="actions-title" className="mb-3 text-lg font-extrabold text-ink-900">
          데이터 작업
        </h2>
        <Card className="p-5">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={action === "geocode"}
              icon={<LocateFixed className="size-4" aria-hidden />}
              onClick={() =>
                runAction("geocode", async () => {
                  const r = await api.post<{ mode: string; queried: number; located: number; unknown: number; errors: string[] }>("/api/admin/geocode", { force: false });
                  if (r.mode === "mock") return "Kakao REST API 키가 없어 좌표를 조회하지 않았어요.";
                  return `주소 ${r.queried}건 조회 · 좌표 확인 ${r.located}곳 · 미확인 ${r.unknown}곳${r.errors.length ? ` · 오류: ${r.errors.join(" / ")}` : ""}`;
                })
              }
            >
              빈 좌표 채우기 (Kakao Local)
            </Button>
            <Button
              variant="secondary"
              loading={action === "geocode-force"}
              icon={<RefreshCw className="size-4" aria-hidden />}
              onClick={() =>
                runAction("geocode-force", async () => {
                  const r = await api.post<{ mode: string; queried: number; located: number; unknown: number; errors: string[] }>("/api/admin/geocode", { force: true });
                  if (r.mode === "mock") return "Kakao REST API 키가 없어 좌표를 조회하지 않았어요.";
                  return `전체 재조회 완료 · 좌표 확인 ${r.located}곳 · 미확인 ${r.unknown}곳${r.errors.length ? ` · 오류: ${r.errors.join(" / ")}` : ""}`;
                })
              }
            >
              전체 좌표 다시 조회
            </Button>
            <Button
              variant="secondary"
              loading={action === "seed"}
              disabled={!status.database.supabaseConfigured}
              icon={<UploadCloud className="size-4" aria-hidden />}
              onClick={() =>
                runAction("seed", async () => {
                  const r = await api.post<{ stores: number; features: number }>("/api/admin/seed");
                  return `Supabase에 점포 ${r.stores}개, feature ${r.features}개를 반영했어요.`;
                })
              }
            >
              Supabase에 40개 점포 seed
            </Button>
          </div>
          {!status.database.supabaseConfigured ? (
            <p className="mt-2 text-xs text-ink-500">Supabase seed는 SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 환경변수 설정 후 사용할 수 있어요 (CLI: npm run seed).</p>
          ) : null}
          {message ? (
            message.ok ? (
              <Notice tone="market" className="mt-3">
                {message.text}
              </Notice>
            ) : (
              <ErrorState className="mt-3" message={message.text} />
            )
          ) : null}
        </Card>
      </section>

      <section aria-labelledby="stores-title" className="mt-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="stores-title" className="text-lg font-extrabold text-ink-900">
            점포 목록 · 추천 feature <span className="tabular text-ink-500">{stores.length}</span>
          </h2>
          <Link href="/admin/integrations" className="inline-flex items-center gap-1 text-sm font-semibold text-market-700 hover:underline">
            <Settings className="size-4" aria-hidden /> 연동 설정
          </Link>
        </div>
        <StoreTable stores={stores} />
      </section>
    </div>
  );
}

function StatusCard(props: {
  icon: ReactNode;
  title: string;
  state: string;
  good: boolean;
  lines: string[];
  test: TestResult | null | undefined;
  testing: boolean;
  onTest: () => void;
}) {
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-bold text-ink-900">
          <span className="grid size-9 place-items-center rounded-xl bg-cream text-ink-700">{props.icon}</span>
          {props.title}
        </span>
        <Badge tone={props.good ? "market" : props.state === "ERROR" ? "brick" : "sign"}>{props.state}</Badge>
      </div>
      <ul className="mt-3 flex-1 space-y-1 text-xs leading-relaxed text-ink-600">
        {props.lines.map((l) => (
          <li key={l} className="break-all">
            {l}
          </li>
        ))}
      </ul>
      {props.test ? (
        <div className={cn("mt-3 rounded-xl px-3 py-2 text-xs leading-relaxed", props.test.ok ? "bg-market-50 text-market-800" : "bg-brick-50 text-brick-700")}>
          <p className="font-semibold">{props.test.ok ? "테스트 성공" : "테스트 실패"}</p>
          <p className="break-all">{props.test.message}</p>
          {props.test.details?.length ? (
            <details className="mt-1">
              <summary className="cursor-pointer">자세히</summary>
              <ul className="mt-1 list-disc pl-4">
                {props.test.details.map((d) => (
                  <li key={d} className="break-all">
                    {d}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      <Button variant="secondary" size="sm" className="mt-3" loading={props.testing} onClick={props.onTest}>
        연결 테스트
      </Button>
    </Card>
  );
}

function StoreTable({ stores }: { stores: StoreDTO[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <caption className="sr-only">점포 목록과 추천 feature</caption>
          <thead className="bg-cream text-xs text-ink-500">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                ID
              </th>
              <th scope="col" className="px-2 py-2.5 font-semibold">
                점포명 / 유형
              </th>
              <th scope="col" className="px-2 py-2.5 font-semibold">
                카테고리
              </th>
              <th scope="col" className="px-2 py-2.5 font-semibold">
                추천 태그 (상위 성향)
              </th>
              <th scope="col" className="px-2 py-2.5 font-semibold">
                위치
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                노출도
              </th>
              <th scope="col" className="px-4 py-2.5">
                <span className="sr-only">펼치기</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => {
              const expanded = open === s.id;
              const taste = toVector(s.inferred.taste);
              return (
                <Fragment key={s.id}>
                  <tr className="border-t border-ink-100 align-top">
                    <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-ink-500">{s.id}</td>
                    <td className="min-w-44 px-2 py-3">
                      <p className="font-semibold text-ink-900">{s.name}</p>
                      <p className="text-xs text-ink-500">
                        {s.storeType} · {ENTITY_KIND_LABEL[s.entityKind]}
                        {!s.recommendable ? " · 추천 제외" : ""}
                      </p>
                    </td>
                    <td className="min-w-28 px-2 py-3 text-xs text-ink-700">{s.categories.join(", ")}</td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap gap-1">
                        {topTastes(taste, 3, 0.3).map((t) => (
                          <span key={t.key} className="rounded-full bg-market-50 px-2 py-0.5 text-[11px] font-semibold text-market-800">
                            {TASTE_META[t.key].label} {Math.round(t.score * 100)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <AccuracyBadge accuracy={s.location.accuracy} />
                    </td>
                    <td className="tabular px-2 py-3 text-right text-ink-700">{Math.round(s.inferred.exposure * 100)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : s.id)}
                        aria-expanded={expanded}
                        aria-label={`${s.name} feature ${expanded ? "접기" : "펼치기"}`}
                        className="grid size-8 place-items-center rounded-lg hover:bg-ink-100"
                      >
                        <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
                      </button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="bg-cream/60">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
                          <div>
                            <p className="mb-2 text-xs font-bold text-ink-700">취향 feature vector (0~100)</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                              {Object.entries(taste)
                                .sort((a, b) => b[1] - a[1])
                                .map(([k, v]) => (
                                  <span key={k} className="flex justify-between text-xs">
                                    <span className="text-ink-600">{TASTE_META[k as keyof typeof TASTE_META].label}</span>
                                    <span className={cn("tabular", v >= 0.5 ? "font-bold text-ink-900" : "text-ink-400")}>{Math.round(v * 100)}</span>
                                  </span>
                                ))}
                            </div>
                          </div>
                          <div>
                            <p className="mb-2 text-xs font-bold text-ink-700">중앙시장 특성</p>
                            {MARKET_FEATURE_KEYS.map((k) => (
                              <p key={k} className="flex justify-between text-xs">
                                <span className="text-ink-600">{MARKET_FEATURE_META[k].label}</span>
                                <span className="tabular text-ink-800">{Math.round((s.inferred.market[k] ?? 0) * 100)}</span>
                              </p>
                            ))}
                            <p className="mt-2 text-xs text-ink-500">원본 태그: {s.tags.join(", ")}</p>
                            <p className="mt-1 text-xs text-ink-500">
                              점포 소개: {s.description.text}
                            </p>
                            <p className="mt-1 text-xs text-ink-500">좌표 근거: {s.location.note}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
