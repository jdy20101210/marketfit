import { TASTE_KEYS, TASTE_META, type TasteKey, type TasteVector } from "@/lib/recommendation/dimensions";
import { cn } from "@/components/ui/cn";

/**
 * 취향 vector 가로 막대 (단일 시리즈)
 * - 상위 항목만 브랜드 색으로 강조, 나머지는 회색 (emphasis)
 * - 값은 막대 끝에 표기, 표 보기 제공 (색에만 의존하지 않음)
 */
export function TasteBars({
  vector,
  emphasize = 5,
  limit,
  minScore = 0,
  title = "취향 점수 표",
  compareWith,
  compareLabel,
}: {
  vector: TasteVector;
  emphasize?: number;
  limit?: number;
  minScore?: number;
  title?: string;
  compareWith?: TasteVector;
  compareLabel?: string;
}) {
  const rows = TASTE_KEYS.map((key) => ({ key, value: vector[key] }))
    .filter((r) => r.value >= minScore)
    .sort((a, b) => b.value - a.value || TASTE_KEYS.indexOf(a.key) - TASTE_KEYS.indexOf(b.key))
    .slice(0, limit ?? TASTE_KEYS.length);
  const topKeys = new Set(rows.slice(0, emphasize).map((r) => r.key));

  return (
    <div>
      <ul className="space-y-2.5" aria-label={title}>
        {rows.map((row) => (
          <BarRow
            key={row.key}
            k={row.key}
            value={row.value}
            emphasized={topKeys.has(row.key)}
            compare={compareWith ? compareWith[row.key] : undefined}
            compareLabel={compareLabel}
          />
        ))}
      </ul>
      <details className="mt-4 text-sm text-ink-600">
        <summary className="cursor-pointer select-none font-medium text-ink-700 hover:text-ink-900">표로 보기</summary>
        <table className="mt-2 w-full border-collapse text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-ink-200 text-xs text-ink-500">
              <th scope="col" className="py-1.5 font-medium">
                취향
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                점수 (0~100)
              </th>
              {compareWith ? (
                <th scope="col" className="py-1.5 text-right font-medium">
                  {compareLabel ?? "비교"}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-ink-100">
                <th scope="row" className="py-1.5 font-normal text-ink-800">
                  {TASTE_META[row.key].label}
                </th>
                <td className="tabular py-1.5 text-right">{Math.round(row.value * 100)}</td>
                {compareWith ? <td className="tabular py-1.5 text-right">{Math.round(compareWith[row.key] * 100)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function BarRow({ k, value, emphasized, compare, compareLabel }: { k: TasteKey; value: number; emphasized: boolean; compare?: number; compareLabel?: string }) {
  const meta = TASTE_META[k];
  const pct = Math.round(value * 100);
  return (
    <li
      tabIndex={0}
      className="group relative grid grid-cols-[6.5rem_1fr_2.25rem] items-center gap-3 rounded-lg sm:grid-cols-[8rem_1fr_2.5rem]"
      aria-label={`${meta.label} ${pct}점${compare !== undefined ? `, ${compareLabel ?? "비교"} ${Math.round(compare * 100)}점` : ""}`}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-800">
        <span aria-hidden>{meta.emoji}</span>
        <span className="truncate">{meta.label}</span>
      </span>
      <span className="relative h-3 rounded-r-[4px] bg-ink-100">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-r-[4px] transition-[width,background-color] duration-500",
            emphasized ? "bg-market-600 group-hover:bg-market-500" : "bg-ink-300 group-hover:bg-ink-400",
          )}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
        {compare !== undefined && compare >= 0.01 ? (
          <span
            aria-hidden
            className="absolute -top-1 h-5 w-0.5 rounded-full bg-sign-600"
            style={{ left: `calc(${Math.round(compare * 100)}% - 1px)` }}
          />
        ) : null}
        <span
          role="tooltip"
          className="pointer-events-none absolute -top-9 left-0 z-10 hidden whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs text-white shadow-float group-hover:block group-focus:block"
        >
          <strong className="font-bold">{pct}</strong> · {meta.hint}
          {compare !== undefined ? ` · ${compareLabel ?? "비교"} ${Math.round(compare * 100)}` : ""}
        </span>
      </span>
      <span className={cn("tabular text-right text-sm", emphasized ? "font-bold text-ink-900" : "text-ink-500")}>{pct}</span>
    </li>
  );
}

export function ScoreMeter({ score, size = "md", label }: { score: number; size?: "sm" | "md"; label?: string }) {
  return (
    <div>
      {label ? <p className="mb-1.5 text-sm font-semibold text-ink-800">{label}</p> : null}
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-label={label ?? `추천 점수 ${score}점`}
        className={cn("relative overflow-hidden rounded-r-[4px] bg-market-100", size === "sm" ? "h-2" : "h-3")}
      >
        <div className="absolute inset-y-0 left-0 rounded-r-[4px] bg-market-600 transition-[width] duration-700" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
