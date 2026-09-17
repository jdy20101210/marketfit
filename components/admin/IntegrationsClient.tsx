"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Camera, Check, Copy, Database, Eye, EyeOff, ExternalLink, Map as MapIcon, ShieldCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState, Notice } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import { api, ApiClientError, errorMessage } from "@/lib/client/api";
import { loadKakaoMaps } from "@/lib/map/kakaoLoader";
import type { FieldStatus, SystemStatus, TestResult } from "@/lib/services/status";
import type { PublicConfig } from "@/lib/api/schemas";

type Group = "kakao" | "instagram" | "gemini";

export function IntegrationsClient({
  initialStatus,
  origin,
  instagramCallback,
}: {
  initialStatus: SystemStatus;
  origin: string;
  instagramCallback: { status: string; reason: string | null } | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const fieldsBy = (g: Group) => status.fields.filter((f) => f.group === g);
  const storageText =
    status.database.kind === "supabase" ? "Supabase DB" : status.database.kind === "local-file" ? "서버 로컬 파일(.data)" : "서버 메모리(임시)";

  return (
    <div className="container-page max-w-4xl pt-6 sm:pt-10">
      <Link href="/admin" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-600 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> 관리자 대시보드
      </Link>
      <h1 className="text-[26px] font-extrabold tracking-tight text-ink-900 sm:text-3xl">연동 설정</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-600">
        필요한 키를 입력하고 저장하면 서비스가 자동으로 실제 API(REAL)로 전환돼요. 비워두면 데모(MOCK)로 계속 동작합니다.
      </p>

      <Notice tone="market" className="mt-4" icon={<ShieldCheck className="size-4" aria-hidden />}>
        입력한 값은 서버에서 AES-256-GCM으로 암호화해 <strong>{storageText}</strong>에 저장하고, 화면·브라우저에는 다시 보내지 않아요. 환경변수로 설정된 값이
        항상 우선합니다.
      </Notice>
      {!status.database.persistent ? (
        <Notice className="mt-2" icon={<TriangleAlert className="size-4" aria-hidden />}>
          현재 저장소가 메모리라서 서버리스 인스턴스가 바뀌면 입력값이 사라질 수 있어요. 운영에서는 Supabase 환경변수(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)를
          설정하거나, 같은 이름의 환경변수로 키를 등록하세요.
        </Notice>
      ) : null}
      {status.environment.secretSource === "ephemeral" ? (
        <Notice className="mt-2" icon={<TriangleAlert className="size-4" aria-hidden />}>
          APP_SECRET 환경변수가 없어 임시 암호화 키를 쓰고 있어요. 재시작 후에도 저장값을 읽으려면 APP_SECRET을 설정하세요.
        </Notice>
      ) : null}

      <div className="mt-6 space-y-5">
        <ProviderSection
          id="kakao"
          icon={<MapIcon className="size-5" aria-hidden />}
          title="Kakao 지도"
          badge={
            <>
              <Badge tone={status.map.mode === "REAL" ? "market" : "sign"}>지도 {status.map.mode}</Badge>
              <Badge tone={status.map.geocoding === "REAL" ? "market" : "sign"}>좌표 {status.map.geocoding}</Badge>
            </>
          }
          guide={
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                <ExtLink href="https://developers.kakao.com/console/app">Kakao Developers</ExtLink> → [내 애플리케이션] → 애플리케이션 추가
              </li>
              <li>[앱] &gt; [플랫폼 키]에서 JavaScript 키와 REST API 키를 확인</li>
              <li>
                [앱] &gt; [플랫폼 키] &gt; [JavaScript 키] &gt; <strong>JavaScript SDK 도메인</strong>에 아래 사이트 도메인 등록 (로컬 개발은
                http://localhost:3000 도 추가)
              </li>
              <li>
                <strong>[카카오맵] &gt; 사용 설정 ON</strong> (미설정 시 지도·로컬 API 호출이 거부됨)
              </li>
              <li>REST API 키의 호출 허용 IP는 비워두세요 (Vercel은 서버 IP가 고정되지 않음)</li>
            </ol>
          }
          copyValues={[{ label: "사이트 도메인 (JavaScript SDK 도메인)", value: origin }]}
          fields={fieldsBy("kakao")}
          testTarget="kakao"
          onSaved={setStatus}
          lastTest={status.map.lastTest}
          extra={<KakaoBrowserTest />}
        />

        <ProviderSection
          id="instagram"
          icon={<Camera className="size-5" aria-hidden />}
          title="Instagram (Meta)"
          badge={<Badge tone={status.instagram.mode === "REAL" ? "market" : "sign"}>{status.instagram.mode}</Badge>}
          guide={
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                <ExtLink href="https://developers.facebook.com/apps">Meta for Developers</ExtLink> → 앱 만들기 → Instagram 관련 사용 사례 선택
              </li>
              <li>
                앱 대시보드 &gt; Instagram &gt; <strong>API setup with Instagram login</strong> &gt; Set up Instagram business login
              </li>
              <li>
                Business login settings의 <strong>OAuth redirect URIs</strong>에 아래 리디렉션 URI를 정확히 등록 (끝 슬래시 포함 여부까지 동일)
              </li>
              <li>Deauthorize callback URL, Data deletion request URL, 개인정보처리방침 URL에 아래 값을 등록</li>
              <li>
                같은 화면의 <strong>Instagram 앱 ID / Instagram 앱 시크릿</strong>을 아래에 입력 (Facebook 앱 ID와 다를 수 있음)
              </li>
              <li>
                개발 모드에서는 앱 역할에 Instagram 테스터로 등록·수락한 <strong>프로페셔널(비즈니스·크리에이터) 계정</strong>만 로그인 가능
              </li>
              <li>일반 사용자에게 공개하려면 instagram_business_basic 권한 앱 검수(Advanced Access)가 필요</li>
            </ol>
          }
          copyValues={[
            { label: "OAuth 리디렉션 URI", value: status.instagram.redirectUri },
            { label: "Deauthorize callback URL", value: status.instagram.deauthorizeUrl },
            { label: "Data deletion request URL", value: status.instagram.dataDeletionUrl },
            { label: "개인정보처리방침 URL", value: status.instagram.privacyPolicyUrl },
          ]}
          fields={fieldsBy("instagram")}
          testTarget="instagram"
          onSaved={setStatus}
          lastTest={status.instagram.lastTest}
          extra={
            <div className="space-y-2">
              {instagramCallback ? (
                instagramCallback.status === "connected" ? (
                  <Notice tone="market">Instagram 로그인 테스트 성공 — 계정이 연결되고 관심 신호를 수집했어요.</Notice>
                ) : instagramCallback.status === "demo" ? (
                  <Notice>앱 ID/시크릿이 저장되지 않아 데모 모드로 돌아왔어요.</Notice>
                ) : (
                  <ErrorState title="Instagram 로그인 테스트 실패" message={instagramCallback.reason ?? instagramCallback.status} />
                )
              ) : null}
              {status.instagram.mode === "REAL" ? (
                <a
                  href={`/api/instagram/auth?next=${encodeURIComponent("/admin/integrations")}`}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-market-700 px-4 text-sm font-semibold text-white hover:bg-market-800"
                >
                  <Camera className="size-4" aria-hidden /> Instagram 로그인 테스트
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-xl bg-ink-100 px-4 text-sm font-semibold text-ink-500"
                  title="앱 ID와 시크릿을 저장하면 사용할 수 있어요"
                >
                  <Camera className="size-4" aria-hidden /> Instagram 로그인 테스트 (앱 ID·시크릿 저장 후)
                </button>
              )}
            </div>
          }
        />

        <ProviderSection
          id="gemini"
          icon={<Bot className="size-5" aria-hidden />}
          title="Gemini AI"
          badge={<Badge tone={status.gemini.status === "CONNECTED" ? "market" : status.gemini.status === "ERROR" ? "brick" : "sign"}>{status.gemini.status}</Badge>}
          guide={
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                <ExtLink href="https://aistudio.google.com/apikey">Google AI Studio</ExtLink>에서 API 키 생성
              </li>
              <li>아래에 입력 후 저장 → [연결 테스트]로 키와 사용 가능한 모델을 확인</li>
              <li>모델을 비워두면 최신 Flash 별칭(gemini-flash-latest)을 사용하고, 없으면 gemini-2.5-flash로 재시도해요</li>
            </ol>
          }
          copyValues={[]}
          fields={fieldsBy("gemini")}
          testTarget="gemini"
          onSaved={setStatus}
          lastTest={status.gemini.lastTest}
        />

        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-cream text-ink-700">
              <Database className="size-5" aria-hidden />
            </span>
            <h2 className="text-lg font-bold text-ink-900">Supabase (환경변수 전용)</h2>
            <Badge tone={status.database.kind === "supabase" ? "market" : "sign"}>{status.database.kind.toUpperCase()}</Badge>
          </div>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-700">
            <li>
              <ExtLink href="https://supabase.com/dashboard">Supabase</ExtLink>에서 프로젝트 생성 → SQL Editor에서 <code>supabase/migrations/0001_init.sql</code> 실행
            </li>
            <li>
              Project Settings &gt; API의 URL과 <strong>service_role</strong> 키를 배포 환경변수 <code>SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code>로 등록
            </li>
            <li>재배포 후 관리자 대시보드의 [Supabase에 40개 점포 seed] 실행 (또는 로컬에서 npm run seed)</li>
          </ol>
          <p className="mt-2 text-xs text-ink-500">service_role 키는 모든 데이터에 접근할 수 있어 화면 입력을 지원하지 않아요. 절대 NEXT_PUBLIC_ 접두사를 붙이지 마세요.</p>
        </Card>
      </div>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-market-700 underline-offset-2 hover:underline">
      {children}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold text-ink-500">{label}</p>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <code className="min-w-0 break-all text-xs text-ink-800">{value}</code>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-ink-100"
          aria-label={`${label} 복사`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              window.prompt("복사해서 사용하세요", value);
            }
          }}
        >
          {copied ? <Check className="size-4 text-market-600" aria-hidden /> : <Copy className="size-4 text-ink-500" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

function sourceText(f: FieldStatus): string {
  if (f.source === "env") return "환경변수로 설정됨 (여기서 변경 불가)";
  if (f.source === "admin") return "설정됨 · 관리자 입력";
  if (f.source === "default") return `기본값 사용${f.displayValue ? ` (${f.displayValue})` : ""}`;
  return "미설정";
}

function ProviderSection(props: {
  id: Group;
  icon: ReactNode;
  title: string;
  badge: ReactNode;
  guide: ReactNode;
  copyValues: { label: string; value: string }[];
  fields: FieldStatus[];
  testTarget: "kakao" | "instagram" | "gemini";
  lastTest: TestResult | null;
  onSaved: (status: SystemStatus) => void;
  extra?: ReactNode;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [clear, setClear] = useState<string[]>([]);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(props.lastTest);

  const dirty = Object.values(values).some((v) => v.trim()) || clear.length > 0;
  const modelOptions = props.testTarget === "gemini" ? (test?.details ?? []) : [];

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);
    setFieldErrors({});
    try {
      const res = await api.put<{ saved: string[]; cleared: string[]; skippedEnv: string[]; status: SystemStatus }>("/api/admin/settings", { values, clear });
      props.onSaved(res.status);
      setValues({});
      setClear([]);
      const parts = [
        res.saved.length ? `${res.saved.length}개 저장` : null,
        res.cleared.length ? `${res.cleared.length}개 삭제` : null,
        res.skippedEnv.length ? `${res.skippedEnv.length}개는 환경변수가 우선이라 건너뜀` : null,
      ].filter(Boolean);
      setSaveResult({ ok: true, text: `${parts.join(" · ") || "변경 없음"} — 이제 연결 테스트를 눌러 확인하세요.` });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.details && typeof err.details === "object" && "fieldErrors" in err.details) {
        setFieldErrors((err.details as { fieldErrors: Record<string, string> }).fieldErrors);
      }
      setSaveResult({ ok: false, text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      setTest(await api.post<TestResult>("/api/admin/test", { target: props.testTarget }));
    } catch (err) {
      setTest({ ok: false, message: errorMessage(err), at: new Date().toISOString() });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="p-5 sm:p-6" aria-labelledby={`${props.id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-cream text-ink-700">{props.icon}</span>
        <h2 id={`${props.id}-title`} className="text-lg font-bold text-ink-900">
          {props.title}
        </h2>
        {props.badge}
      </div>

      <details className="mt-4 rounded-2xl bg-cream px-4 py-3 text-sm leading-relaxed text-ink-700" open={props.fields.every((f) => !f.configured)}>
        <summary className="cursor-pointer font-semibold text-ink-900">설정 방법</summary>
        <div className="mt-2">{props.guide}</div>
      </details>

      {props.copyValues.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {props.copyValues.map((c) => (
            <CopyRow key={c.label} label={c.label} value={c.value} />
          ))}
        </div>
      ) : null}

      <form onSubmit={save} className="mt-5 space-y-4">
        {props.fields.map((f) => {
          const inputId = `field-${f.key}`;
          const envLocked = f.source === "env";
          const markedClear = clear.includes(f.key);
          return (
            <div key={f.key}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={inputId} className="text-sm font-semibold text-ink-900">
                  {f.label}
                </label>
                <span className={cn("text-xs font-semibold", f.configured ? "text-market-700" : "text-ink-500")}>{sourceText(f)}</span>
              </div>
              <p className="mb-1.5 text-xs text-ink-500">{f.help}</p>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    id={inputId}
                    type={f.secret && !reveal[f.key] ? "password" : "text"}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={envLocked || markedClear}
                    list={f.key === "GEMINI_MODEL" && modelOptions.length ? "gemini-models" : undefined}
                    placeholder={envLocked ? "환경변수 값 사용 중" : f.configured && f.source === "admin" ? "새 값 입력 시 교체 (비우면 유지)" : "값 입력"}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    aria-invalid={Boolean(fieldErrors[f.key])}
                    aria-describedby={fieldErrors[f.key] ? `${inputId}-error` : undefined}
                    className="h-11 w-full rounded-xl border border-ink-200 bg-white px-3 pr-10 font-mono text-sm outline-none focus:border-market-600 focus:ring-4 focus:ring-market-400/40 disabled:bg-ink-50 disabled:text-ink-400"
                  />
                  {f.secret && !envLocked ? (
                    <button
                      type="button"
                      className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100"
                      aria-label={reveal[f.key] ? "입력값 숨기기" : "입력값 보기"}
                      onClick={() => setReveal((r) => ({ ...r, [f.key]: !r[f.key] }))}
                    >
                      {reveal[f.key] ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    </button>
                  ) : null}
                </div>
                {f.source === "admin" ? (
                  <label className="flex shrink-0 items-center gap-1.5 rounded-xl border border-ink-200 px-3 text-xs font-semibold text-ink-600">
                    <input
                      type="checkbox"
                      className="size-4 accent-brick-600"
                      checked={markedClear}
                      onChange={(e) => setClear((c) => (e.target.checked ? [...c, f.key] : c.filter((k) => k !== f.key)))}
                    />
                    삭제
                  </label>
                ) : null}
              </div>
              {fieldErrors[f.key] ? (
                <p id={`${inputId}-error`} className="mt-1 text-xs font-semibold text-brick-600">
                  {fieldErrors[f.key]}
                </p>
              ) : null}
            </div>
          );
        })}
        {modelOptions.length ? (
          <datalist id="gemini-models">
            {modelOptions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={saving} disabled={!dirty}>
            저장
          </Button>
          <Button type="button" variant="secondary" loading={testing} onClick={runTest}>
            연결 테스트
          </Button>
        </div>
        {saveResult ? saveResult.ok ? <Notice tone="market">{saveResult.text}</Notice> : <ErrorState message={saveResult.text} /> : null}
        {test ? (
          <div className={cn("rounded-2xl px-4 py-3 text-sm", test.ok ? "bg-market-50 text-market-800" : "bg-brick-50 text-brick-700")} aria-live="polite">
            <p className="font-bold">{test.ok ? "연결 테스트 성공" : "연결 테스트 실패"}</p>
            <p className="mt-0.5 break-all">{test.message}</p>
            {test.details?.length ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {test.details.slice(0, props.testTarget === "gemini" ? 12 : 10).map((d) => (
                  <li key={d} className="break-all">
                    {d}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </form>

      {props.extra ? <div className="mt-4 border-t border-ink-100 pt-4">{props.extra}</div> : null}
    </Card>
  );
}

function KakaoBrowserTest() {
  const [state, setState] = useState<{ status: "idle" | "loading" | "ok" | "error"; message?: string }>({ status: "idle" });
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-ink-800">브라우저 지도 로딩 테스트</p>
      <p className="text-xs text-ink-500">JavaScript 키와 도메인 등록은 브라우저에서만 확인할 수 있어요. 새로고침 후 저장된 키로 SDK를 불러옵니다.</p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={state.status === "loading"}
        onClick={async () => {
          setState({ status: "loading" });
          try {
            const config = await api.get<PublicConfig>("/api/config");
            if (!config.kakaoJsKey) {
              setState({ status: "error", message: "저장된 JavaScript 키가 없어요." });
              return;
            }
            const k = await loadKakaoMaps(config.kakaoJsKey);
            setState({ status: "ok", message: `Kakao Maps SDK 로드 성공 (지도 객체 사용 가능: ${typeof k.maps.Map === "function" ? "예" : "아니오"})` });
          } catch (err) {
            setState({ status: "error", message: errorMessage(err) });
          }
        }}
      >
        JS 키로 지도 불러오기
      </Button>
      {state.status === "ok" ? <Notice tone="market">{state.message}</Notice> : null}
      {state.status === "error" ? <ErrorState message={state.message ?? "실패"} /> : null}
    </div>
  );
}
