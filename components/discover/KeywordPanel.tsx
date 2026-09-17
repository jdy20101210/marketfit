"use client";

import { useId, useMemo, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { normalizeKeyword } from "@/lib/api/schemas";
import { setState, useMarketFit } from "@/lib/client/store";
import { keywordInsight } from "@/lib/preferences/profile";
import { TASTE_META } from "@/lib/recommendation/dimensions";
import { splitKeywords } from "@/lib/recommendation/keywords";

const MAX_KEYWORDS = 10;
const SUGGESTIONS = ["커피", "캠핑", "선물", "빈티지", "전통시장", "시장 먹거리", "한복", "떡", "그릇", "이불", "수예", "가성비"];

/**
 * 빠른 키워드 분석: "커피, 캠핑, 선물" 또는 [커피] [캠핑]처럼 입력
 * 입력 즉시 규칙 기반 해석을 미리 보여주고, 분석은 Gemini(또는 데모 AI)가 합니다.
 */
export function KeywordPanel() {
  const { state, hydrated } = useMarketFit();
  const keywords = state.keywords;
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();

  const add = (raw: string) => {
    const parts = splitKeywords(raw);
    if (parts.length === 0) return;
    const next = [...keywords];
    const problems: string[] = [];
    for (const p of parts) {
      if (/[<>{}]/.test(p)) problems.push(`'${p}'에 사용할 수 없는 문자가 있어요.`);
      else if (next.some((k) => normalizeKeyword(k) === normalizeKeyword(p))) problems.push(`'${p}'은(는) 이미 추가했어요.`);
      else if (next.length >= MAX_KEYWORDS) problems.push(`키워드는 최대 ${MAX_KEYWORDS}개까지 입력할 수 있어요.`);
      else next.push(p);
    }
    setError(problems[0] ?? null);
    if (next.length !== keywords.length) setState((prev) => ({ ...prev, keywords: next }));
    setValue("");
  };

  const remove = (k: string) => setState((prev) => ({ ...prev, keywords: prev.keywords.filter((x) => x !== k) }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    add(value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "," && value.trim()) {
      e.preventDefault();
      add(value);
    }
    if (e.key === "Backspace" && !value && keywords.length) remove(keywords.at(-1)!);
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (/[,，#\[\]\n]/.test(text)) {
      e.preventDefault();
      add(text);
    }
  };

  const insights = useMemo(() => keywords.map((k) => keywordInsight(k)), [keywords]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-600">관심 있는 것을 쉼표로 구분해 입력하세요. 예: 커피, 캠핑, 선물, 빈티지</p>
        <Badge tone={keywords.length ? "market" : "outline"}>
          {keywords.length}/{MAX_KEYWORDS}
        </Badge>
      </div>

      <form onSubmit={onSubmit} className="mt-3">
        <label htmlFor={inputId} className="sr-only">
          키워드 입력
        </label>
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-ink-200 bg-white p-2 focus-within:border-market-600 focus-within:ring-4 focus-within:ring-market-400/40">
          {keywords.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-market-700 py-1 pl-3 pr-1 text-sm font-semibold text-white">
              {k}
              <button type="button" onClick={() => remove(k)} className="grid size-6 place-items-center rounded-full hover:bg-white/20" aria-label={`${k} 삭제`}>
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
          <input
            id={inputId}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            maxLength={60}
            disabled={!hydrated || keywords.length >= MAX_KEYWORDS}
            aria-describedby={hintId}
            aria-invalid={Boolean(error)}
            placeholder={keywords.length ? "키워드 추가" : "커피, 캠핑, 선물"}
            className="h-9 min-w-[8rem] flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-ink-400 disabled:cursor-not-allowed"
          />
          <Button type="submit" size="sm" disabled={!value.trim() || keywords.length >= MAX_KEYWORDS} icon={<Plus className="size-4" aria-hidden />}>
            추가
          </Button>
        </div>
      </form>
      <p id={hintId} className={cn("mt-2 text-xs", error ? "font-semibold text-brick-600" : "text-ink-500")} aria-live="polite">
        {error ?? "Enter·쉼표로 추가하고, 여러 개를 한꺼번에 붙여 넣어도 돼요."}
      </p>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-ink-500">추천 키워드</p>
        <ul className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.filter((s) => !keywords.some((k) => normalizeKeyword(k) === normalizeKeyword(s))).map((s) => (
            <li key={s}>
              <button
                type="button"
                disabled={keywords.length >= MAX_KEYWORDS}
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

      {insights.length ? (
        <div className="mt-5 rounded-2xl bg-cream/70 p-3">
          <p className="mb-2 text-xs font-semibold text-ink-600">미리 보기 · 키워드 의미 확장 (규칙 기반, 분석 시 AI가 다시 해석해요)</p>
          <ul className="space-y-1.5">
            {insights.map((i) => (
              <li key={i.input} className="text-sm">
                <span className="font-semibold text-ink-900">{i.input}</span>
                <span className="text-ink-500"> → </span>
                {i.keys.length ? (
                  <span className="text-market-800">{i.keys.map((k) => `${TASTE_META[k].emoji} ${TASTE_META[k].label}`).join(", ")}</span>
                ) : (
                  <span className="text-ink-500">사전에 없는 단어 (AI 분석에서 해석)</span>
                )}
                {i.expanded.length ? <span className="text-xs text-ink-500"> · 관련: {i.expanded.join(", ")}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
