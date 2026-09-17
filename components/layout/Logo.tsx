import { cn } from "@/components/ui/cn";
import { BRAND_COLORS, LOGO_VIEWBOX, MARK_VIEWBOX, PATH_AWNING, PATH_PIN, PATH_WORD_FIT, PATH_WORD_MARKET } from "./logoPaths";

type A11yProps = {
  /** 스크린리더용 이름. 링크 등에 이미 이름이 있으면 null로 두어 중복 낭독을 막습니다. */
  label?: string | null;
};

const LOGO_RATIO = (() => {
  const [, , w, h] = LOGO_VIEWBOX.split(" ").map(Number);
  return `${w} / ${h}`;
})();

function a11y(label: string | null | undefined, fallback: string) {
  const name = label === undefined ? fallback : label;
  return name ? ({ role: "img", "aria-label": name } as const) : ({ "aria-hidden": true } as const);
}

/**
 * MarketFit 공식 심볼 — 노란 차양(시장) + 라임 그린 위치 핀(사람·연결)
 * 기본은 장식용(aria-hidden). 단독으로 의미가 있을 때 label을 주세요.
 */
export function LogoMark({ className, label = null }: { className?: string } & A11yProps) {
  return (
    <svg viewBox={MARK_VIEWBOX} className={cn("size-8 shrink-0", className)} focusable="false" {...a11y(label, "MarketFit")}>
      <path fill={BRAND_COLORS.awning} d={PATH_AWNING} />
      <path fill={BRAND_COLORS.fit} d={PATH_PIN} />
    </svg>
  );
}

/**
 * MarketFit 공식 가로형 로고 (심볼 + 워드마크)
 * - tone="light": 밝은 배경용 (Market = 차콜)
 * - tone="dark":  어두운 배경·사진 위 (Market = 흰색)
 * 높이만 지정하면 비율(약 4.4:1)이 유지됩니다. 권장 최소 높이 24px.
 */
export function Logo({ className, tone = "light", label }: { className?: string; tone?: "light" | "dark" } & A11yProps) {
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      className={cn("h-8 w-auto shrink-0", className)}
      style={{ aspectRatio: LOGO_RATIO }}
      focusable="false"
      {...a11y(label, "MarketFit")}
    >
      <path fill={BRAND_COLORS.awning} d={PATH_AWNING} />
      <path fill={BRAND_COLORS.fit} d={PATH_PIN} />
      <path fill={BRAND_COLORS.fit} d={PATH_WORD_FIT} />
      <path fill={tone === "dark" ? BRAND_COLORS.onDark : BRAND_COLORS.charcoal} fillRule="evenodd" d={PATH_WORD_MARKET} />
    </svg>
  );
}
