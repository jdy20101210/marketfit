import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "sign" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-market-700 text-white hover:bg-market-800 shadow-card disabled:bg-market-700/60",
  secondary: "bg-paper text-ink-800 border border-ink-200 hover:border-ink-300 hover:bg-white",
  sign: "bg-sign-400 text-ink-900 hover:bg-sign-300 shadow-card",
  ghost: "text-ink-700 hover:bg-ink-100",
  danger: "bg-paper text-brick-600 border border-brick-100 hover:bg-brick-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5 rounded-xl",
  md: "h-11 px-5 text-[15px] gap-2 rounded-2xl",
  lg: "h-14 px-6 text-base gap-2.5 rounded-2xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center font-semibold transition-colors select-none",
    "disabled:cursor-not-allowed disabled:opacity-70",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode };

export function Button({ variant, size, loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function LinkButton({ variant, size, icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}
