"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Camera, Check, CircleCheck, Info, LogOut, PenLine, Plus, Shuffle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { ErrorState, Notice } from "@/components/ui/States";
import { cn } from "@/components/ui/cn";
import { api, errorMessage } from "@/lib/client/api";
import { setState, useMarketFit, type OnboardingMode } from "@/lib/client/store";
import { MOCK_PERSONAS } from "@/lib/providers/instagram/personas";

const SUGGESTIONS = ["드립커피", "캠핑 의자", "빈티지 소품", "한과", "여행 기념품", "그릇", "이불", "가방"];
const MAX_ITEMS = 5;
const MIN_ITEMS = 3;

type IgStatus = {
  mode: "real" | "mock";
  connected: boolean;
  username: string | null;
  accountType: string | null;
  mediaAnalyzed: number;
  interests: { keyword: string; score: number }[];
};

const MODE_OPTIONS: { value: OnboardingMode; label: string; icon: typeof Camera }[] = [
  { value: "instagram", label: "Instagram", icon: Camera },
  { value: "manual", label: "직접 입력", icon: PenLine },
  { value: "both", label: "둘 다", icon: Sparkles },
];

export function OnboardingClient(props: {
  initialMode: OnboardingMode | null;
  instagramMode: "real" | "mock";
  aiMode: "gemini" | "mock";
  callbackStatus: string | null;
  callbackReason: string | null;
}) {
  const router = useRouter();
  const { state, hydrated } = useMarketFit();
  const draft = state.onboarding;
  const [userMode, setUserMode] = useState<OnboardingMode | null>(null);
  const mode: OnboardingMode = userMode ?? props.initialMode ?? draft?.mode ?? "both";
  const items = draft?.items ?? [];
  const personaId = draft?.personaId ?? null;
  const useInstagram = mode !== "manual";
  const useItems = mode !== "instagram";

  const [demoAck, setDemoAck] = useState(props.callbackStatus === "demo");
  const [preferDemo, setPreferDemo] = useState(false);
  const [igStatus, setIgStatus] = useState<IgStatus | null>(null);
  const [igLoading, setIgLoading] = useState(props.instagramMode === "real");
  const [igError, setIgError] = useState<string | null>(null);

  useEffect(() => {
    if (props.instagramMode !== "real") return;
    const controller = new AbortController();
    api
      .get<IgStatus>("/api/instagram/status", controller.signal)
      .then((s) => setIgStatus(s))
      .catch((err) => {
        if (!controller.signal.aborted) setIgError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIgLoading(false);
      });
    return () => controller.abort();
  }, [props.instagramMode]);

  const updateDraft = (patch: Partial<NonNullable<typeof draft>>) =>
    setState((prev) => ({
      ...prev,
      onboarding: {
        mode,
        items,
        personaId,
        preferDemo,
        ...prev.onboarding,
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    }));

  const realConnected = props.instagramMode === "real" && Boolean(igStatus?.connected) && !preferDemo;
  const instagramReady = !useInstagram || realConnected || demoAck || preferDemo;
  const itemsReady = !useItems || (items.length >= MIN_ITEMS && items.length <= MAX_ITEMS);
  const canStart = hydrated && instagramReady && itemsReady;

  const start = () => {
    if (!canStart) return;
    setState((prev) => ({
      ...prev,
      onboarding: {
        mode,
        items: useItems ? items : [],
        personaId,
        preferDemo: props.instagramMode === "real" ? !realConnected : true,
        updatedAt: new Date().toISOString(),
      },
    }));
    router.push("/analysis");
  };

  const connectHref = `/api/instagram/auth?next=${encodeURIComponent(`/onboarding?mode=${mode}`)}`;

  return (
    <div className="container-page max-w-3xl pt-6 sm:pt-10">
      <PageHeader
        eyebrow="STEP 1 · 2"
        title="취향을 알려주세요"
        description="Instagram 관심사와 요즘 관심 있는 상품을 바탕으로 AI가 중앙시장 취향을 분석해요."
      />

      <div role="radiogroup" aria-label="분석 방법" className="mb-5 grid grid-cols-3 gap-1 rounded-2xl border border-ink-200 bg-paper p-1 shadow-card">
        {MODE_OPTIONS.map((opt) => {
          const selected = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setUserMode(opt.value);
                updateDraft({ mode: opt.value });
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-semibold transition-colors",
                selected ? "bg-market-700 text-white" : "text-ink-600 hover:bg-ink-100",
              )}
            >
              <opt.icon className="size-4" aria-hidden />
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {useInstagram ? (
          <Card className="p-5 sm:p-6">
            <CardHeader
              eyebrow="STEP 1"
              title="Instagram 연결"
              description="본인 계정의 프로필과 게시물 캡션에서 관심 키워드를 찾아요. 좋아요·팔로우 같은 비공개 활동은 수집하지 않아요."
              action={
                props.instagramMode === "real" ? <Badge tone="market">실제 연동</Badge> : <Badge tone="sign">데모 모드</Badge>
              }
            />

            {props.callbackStatus === "connected" && realConnected ? (
              <Notice tone="market" className="mt-4" icon={<CircleCheck className="size-4" aria-hidden />}>
                Instagram 계정이 연결되었어요.
              </Notice>
            ) : null}
            {props.callbackStatus === "denied" ? (
              <Notice className="mt-4" icon={<Info className="size-4" aria-hidden />}>
                Instagram 권한 요청이 취소되었어요. 다시 연결하거나 데모 데이터로 계속할 수 있어요.
              </Notice>
            ) : null}
            {props.callbackStatus === "error" ? (
              <ErrorState className="mt-4" title="Instagram 연결에 실패했어요" message={props.callbackReason ?? "잠시 후 다시 시도해주세요."} />
            ) : null}

            <div className="mt-5">
              {props.instagramMode === "real" ? (
                <RealInstagramBlock
                  loading={igLoading}
                  error={igError}
                  status={igStatus}
                  preferDemo={preferDemo}
                  connectHref={connectHref}
                  onDisconnect={async () => {
                    await api.post("/api/instagram/disconnect");
                    setIgStatus((s) => (s ? { ...s, connected: false, username: null, interests: [] } : s));
                  }}
                  onUseDemo={(v) => setPreferDemo(v)}
                />
              ) : (
                <div className="space-y-3">
                  {demoAck ? (
                    <Notice icon={<Info className="size-4" aria-hidden />}>
                      <strong>현재 데모 모드로 취향을 분석합니다.</strong> 관리자 화면에서 Instagram 앱 정보를 입력하면 실제 계정 연결로 바뀌어요.
                    </Notice>
                  ) : (
                    <Button type="button" size="lg" className="w-full sm:w-auto" icon={<Camera className="size-5" aria-hidden />} onClick={() => setDemoAck(true)}>
                      Instagram 연결하기
                    </Button>
                  )}
                </div>
              )}

              {(props.instagramMode === "mock" && demoAck) || (props.instagramMode === "real" && preferDemo) ? (
                <PersonaPicker value={personaId} onChange={(id) => updateDraft({ personaId: id })} />
              ) : null}
            </div>
          </Card>
        ) : null}

        {useItems ? (
          <ItemsCard
            items={items}
            onChange={(next) => updateDraft({ items: next })}
            step={useInstagram ? "STEP 2" : "STEP 1"}
          />
        ) : null}
      </div>

      <div className="sticky bottom-16 z-30 mt-6 md:bottom-4">
        <div className="rounded-3xl border border-ink-200 bg-paper/95 p-3 shadow-float backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="px-2 text-sm text-ink-600" aria-live="polite">
              {!instagramReady
                ? "Instagram을 연결하거나 데모로 진행해주세요."
                : !itemsReady
                  ? `관심 상품을 ${MIN_ITEMS}~${MAX_ITEMS}개 입력해주세요. (현재 ${items.length}개)`
                  : `준비 완료 · ${props.aiMode === "gemini" ? "Gemini" : "데모 AI"}로 분석해요`}
            </p>
            <Button type="button" size="lg" disabled={!canStart} onClick={start} icon={<Sparkles className="size-5" aria-hidden />}>
              취향 분석 시작
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RealInstagramBlock(props: {
  loading: boolean;
  error: string | null;
  status: IgStatus | null;
  preferDemo: boolean;
  connectHref: string;
  onDisconnect: () => Promise<void>;
  onUseDemo: (value: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (props.loading) return <p className="text-sm text-ink-500">연결 상태 확인 중…</p>;
  if (props.error) return <ErrorState message={props.error} />;
  const s = props.status;
  if (s?.connected && !props.preferDemo) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-market-50 px-4 py-3">
          <div>
            <p className="font-bold text-market-800">@{s.username ?? "instagram"} 연결됨</p>
            <p className="text-sm text-market-700">
              최근 게시물 {s.mediaAnalyzed}개 분석 · {s.accountType ?? "프로페셔널 계정"}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={busy}
            icon={<LogOut className="size-4" aria-hidden />}
            onClick={async () => {
              setBusy(true);
              try {
                await props.onDisconnect();
              } finally {
                setBusy(false);
              }
            }}
          >
            연결 해제
          </Button>
        </div>
        {s.interests.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="찾은 관심 키워드">
            {s.interests.map((i) => (
              <li key={i.keyword} className="rounded-full bg-paper px-3 py-1 text-sm text-ink-700 ring-1 ring-ink-200">
                #{i.keyword}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-600">게시물 캡션에서 관심 키워드를 찾지 못했어요. 관심 상품을 함께 입력하면 더 정확해요.</p>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {props.preferDemo ? (
        <Notice icon={<Info className="size-4" aria-hidden />}>
          <strong>현재 데모 모드로 취향을 분석합니다.</strong> 실제 계정으로 분석하려면 아래에서 Instagram을 연결하세요.
        </Notice>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <a href={props.connectHref} className="inline-flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-market-700 px-6 font-semibold text-white shadow-card hover:bg-market-800">
          <Camera className="size-5" aria-hidden />
          Instagram 연결하기
        </a>
        {!props.preferDemo ? (
          <Button type="button" variant="secondary" size="lg" onClick={() => props.onUseDemo(true)}>
            데모 데이터로 계속
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="lg" onClick={() => props.onUseDemo(false)}>
            데모 사용 취소
          </Button>
        )}
      </div>
      <p className="text-xs leading-relaxed text-ink-500">
        Instagram 프로페셔널(비즈니스·크리에이터) 계정만 연결할 수 있어요. 앱이 개발 모드이면 Meta 앱에 테스터로 등록된 계정만 로그인됩니다.
      </p>
    </div>
  );
}

function PersonaPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  return (
    <fieldset className="mt-5">
      <legend className="mb-2 text-sm font-semibold text-ink-800">데모 취향 유형 선택</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <PersonaOption selected={value === null} onSelect={() => onChange(null)} emoji="🎲" label="무작위" description="매번 다른 유형" icon={<Shuffle className="size-3.5" aria-hidden />} />
        {MOCK_PERSONAS.map((p) => (
          <PersonaOption key={p.id} selected={value === p.id} onSelect={() => onChange(p.id)} emoji={p.emoji} label={p.label} description={p.description} />
        ))}
      </div>
    </fieldset>
  );
}

function PersonaOption(props: { selected: boolean; onSelect: () => void; emoji: string; label: string; description: string; icon?: ReactNode }) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col rounded-2xl border p-3 text-left transition-colors",
        props.selected ? "border-market-600 bg-market-50 ring-2 ring-market-600/20" : "border-ink-200 bg-paper hover:border-ink-300",
      )}
    >
      <input type="radio" name="persona" className="sr-only" checked={props.selected} onChange={props.onSelect} />
      <span className="text-xl" aria-hidden>
        {props.emoji}
      </span>
      <span className="mt-1 flex items-center gap-1 text-sm font-bold text-ink-900">
        {props.label}
        {props.icon}
      </span>
      <span className="mt-0.5 text-xs leading-snug text-ink-500">{props.description}</span>
      {props.selected ? <Check className="absolute right-2.5 top-2.5 size-4 text-market-700" aria-hidden /> : null}
    </label>
  );
}

function ItemsCard({ items, onChange, step }: { items: string[]; onChange: (items: string[]) => void; step: string }) {
  const inputId = useId();
  const hintId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = (raw: string) => {
    const v = raw.trim().replace(/\s+/g, " ");
    if (!v) return;
    if (v.length > 30) return setError("30자 이내로 입력해주세요.");
    if (/[<>{}]/.test(v)) return setError("사용할 수 없는 문자가 있어요.");
    // 서버 검증과 같은 기준: 띄어쓰기·대소문자만 다르면 같은 상품
    const key = (x: string) => x.toLowerCase().replace(/\s+/g, "");
    if (items.some((i) => key(i) === key(v))) return setError("이미 추가한 상품이에요.");
    if (items.length >= MAX_ITEMS) return setError(`최대 ${MAX_ITEMS}개까지 입력할 수 있어요.`);
    setError(null);
    onChange([...items, v]);
    setValue("");
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    add(value);
  };

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        eyebrow={step}
        title="관심 상품 입력"
        description="요즘 관심 있는 상품을 3~5개 입력해주세요."
        action={
          <Badge tone={items.length >= MIN_ITEMS ? "market" : "outline"}>
            {items.length}/{MAX_ITEMS}
          </Badge>
        }
      />
      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          관심 상품
        </label>
        <input
          id={inputId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="예: 드립커피"
          maxLength={30}
          aria-describedby={hintId}
          aria-invalid={Boolean(error)}
          disabled={items.length >= MAX_ITEMS}
          className="h-12 min-w-0 flex-1 rounded-2xl border border-ink-200 bg-white px-4 text-[15px] outline-none placeholder:text-ink-400 focus:border-market-600 focus:ring-4 focus:ring-market-400/40 disabled:bg-ink-50"
        />
        <Button type="submit" size="md" className="h-12" disabled={!value.trim() || items.length >= MAX_ITEMS} icon={<Plus className="size-4" aria-hidden />}>
          추가
        </Button>
      </form>
      <p id={hintId} className={cn("mt-2 text-xs", error ? "font-semibold text-brick-600" : "text-ink-500")} aria-live="polite">
        {error ?? "Enter 키로 추가할 수 있어요."}
      </p>

      {items.length ? (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="입력한 관심 상품">
          {items.map((item) => (
            <li key={item} className="inline-flex items-center gap-1 rounded-full bg-market-700 py-1.5 pl-3.5 pr-1.5 text-sm font-semibold text-white">
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((i) => i !== item))}
                className="grid size-6 place-items-center rounded-full hover:bg-white/20"
                aria-label={`${item} 삭제`}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold text-ink-500">추천 예시</p>
        <ul className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.filter((s) => !items.includes(s)).map((s) => (
            <li key={s}>
              <button
                type="button"
                disabled={items.length >= MAX_ITEMS}
                onClick={() => add(s)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-300 bg-paper px-3 py-1.5 text-sm text-ink-700 hover:border-market-500 hover:text-market-700 disabled:opacity-50"
              >
                <Plus className="size-3" aria-hidden />
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 flex items-center gap-1 text-xs text-ink-500">
        <ArrowRight className="size-3" aria-hidden /> 입력한 상품은 그대로 AI 분석에 전달돼요.
      </p>
    </Card>
  );
}
