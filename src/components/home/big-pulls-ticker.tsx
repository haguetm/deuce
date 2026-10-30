"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Rarity } from "@config/game";
import { CountryFlag } from "@/components/card/country-flag";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { supabaseEnv } from "@/lib/supabase/env";

interface BigPull {
  opened_at: string;
  rarity: Rarity;
  name: string;
  slug: string;
  country_code: string | null;
  username: string | null;
}

const REFRESH_MS = 30_000;

/**
 * Live ticker of the latest top-rarity pulls (game_config.feed). Players
 * appear only under the username they chose, and can opt out.
 */
export function BigPullsTicker({ initial }: { initial: BigPull[] }) {
  const t = useTranslations("feed");
  const tRarity = useTranslations("rarity");
  const [pulls, setPulls] = useState(initial);

  useEffect(() => {
    if (!supabaseEnv()) return;
    const supabase = createSupabaseBrowserClient();
    const id = setInterval(async () => {
      if (document.hidden) return;
      const { data } = await supabase.rpc("get_big_pulls", { p_limit: 20 });
      if (data) setPulls(data as BigPull[]);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  if (pulls.length === 0) return null;
  // Rendered twice so the CSS loop is seamless.
  const items = [...pulls, ...pulls];
  return (
    <section
      className="ticker w-full overflow-hidden border-y border-gold/30 bg-night/80 py-2"
      aria-label={t("label")}
    >
      <ul className="ticker-track flex w-max gap-8 whitespace-nowrap text-sm">
        {items.map((p, i) => (
          <li
            key={`${p.opened_at}-${p.slug}-${i}`}
            className="flex items-center gap-2"
            aria-hidden={i >= pulls.length}
          >
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-night"
              style={{ background: `var(--rarity-${p.rarity})` }}
            >
              {tRarity(p.rarity)}
            </span>
            <CountryFlag code={p.country_code} />
            <span className="font-semibold">{p.name}</span>
            <span className="text-cream/60">
              {p.username ? t("by", { username: p.username }) : t("anonymous")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
