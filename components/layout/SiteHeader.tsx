"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Compass, Home, MapPinned, Sparkles, Store, UserRound } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Logo } from "./Logo";

const NAV = [
  { href: "/discover", label: "취향 분석", icon: Sparkles },
  { href: "/market-map", label: "추천 지도", icon: MapPinned },
  { href: "/profile", label: "내 기록", icon: UserRound },
  { href: "/market-insight", label: "시장 인사이트", icon: BarChart3 },
  { href: "/merchant", label: "상인 인사이트", icon: Store },
];

const TABS = [
  { href: "/", label: "홈", icon: Home },
  { href: "/discover", label: "분석", icon: Sparkles },
  { href: "/market-map", label: "지도", icon: Compass },
  { href: "/profile", label: "내 기록", icon: UserRound },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/discover") return pathname.startsWith("/discover") || pathname.startsWith("/analysis");
  if (href === "/market-map") return pathname.startsWith("/market-map") || pathname.startsWith("/store");
  return pathname.startsWith(href);
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-paper focus:px-4 focus:py-2 focus:shadow-float">
        본문으로 건너뛰기
      </a>
      <header className="sticky top-0 z-40 border-b border-ink-200/60 bg-cream/85 backdrop-blur-md">
        <div aria-hidden className="awning-scallop h-3 w-full" />
        <div className="container-page flex h-14 items-center justify-between gap-4">
          <Link href="/" aria-label="MarketFit 홈" className="-my-1 rounded-lg py-1">
            <Logo label={null} className="h-8 sm:h-9" />
          </Link>
          <nav aria-label="주요 메뉴" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                        active ? "bg-market-700 text-white" : "text-ink-700 hover:bg-ink-100",
                      )}
                    >
                      <item.icon className="size-4" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <Link href="/merchant" className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-100 md:hidden">
            상인 인사이트
          </Link>
        </div>
      </header>
      <nav
        aria-label="하단 메뉴"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200/70 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="grid grid-cols-4">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", active ? "text-market-700" : "text-ink-500")}
                >
                  <tab.icon className={cn("size-5", active && "stroke-[2.4]")} aria-hidden />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
