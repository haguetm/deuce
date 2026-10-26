"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useSession } from "./use-session";

/**
 * Phone navigation: fixed bottom bar, the "Open" action in the middle within
 * thumb reach, with a badge for the boosters waiting (free + bonus).
 */
export function MobileTabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { signedIn } = useSession();
  const [waiting, setWaiting] = useState<number | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    createSupabaseBrowserClient()
      .rpc("get_booster_state")
      .then(({ data }) => {
        if (cancelled || !data) return;
        const s = data as { stock: number; bonus_stock: number };
        setWaiting(s.stock + s.bonus_stock);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, pathname]);

  const tab = (
    href: "/" | "/collection" | "/missions" | "/profile",
    label: string,
  ) => {
    const active = pathname === href;
    return (
      <Link
        href={signedIn || href === "/" ? href : "/login"}
        aria-current={active ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-ball" : "text-cream/70"}`}
      >
        <TabIcon name={href} />
        {label}
      </Link>
    );
  };

  return (
    <nav
      aria-label={t("mobile")}
      className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-gold/30 bg-night/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {tab("/", t("home"))}
      {tab("/collection", t("collection"))}
      <Link
        href="/boosters"
        className="relative -mt-6 flex flex-1 flex-col items-center gap-0.5 pb-2 text-[11px] text-ball"
        aria-current={pathname === "/boosters" ? "page" : undefined}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ball text-night shadow-[0_0_20px_var(--brand-ball)]">
          <TabIcon name="/boosters" />
        </span>
        {t("open")}
        {signedIn && waiting !== null && waiting > 0 && (
          <span className="absolute right-[calc(50%-34px)] top-0 min-w-5 rounded-full bg-gold px-1 text-center text-[11px] font-bold text-night">
            {waiting}
          </span>
        )}
      </Link>
      {tab("/missions", t("missions"))}
      {tab("/profile", t("profile"))}
    </nav>
  );
}

function TabIcon({ name }: { name: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "/":
      return (
        <svg {...common}>
          <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "/collection":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="8" height="12" rx="1.5" />
          <rect x="13" y="8" width="8" height="12" rx="1.5" />
        </svg>
      );
    case "/boosters":
      return (
        <svg {...common} width={28} height={28}>
          <circle cx="12" cy="12" r="9" />
          <path d="M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8" />
        </svg>
      );
    case "/missions":
      return (
        <svg {...common}>
          <path d="M9 11l3 3 8-8" />
          <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
      );
  }
}
