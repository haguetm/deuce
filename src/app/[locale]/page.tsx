import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { brand } from "@config/brand";
import { gameConfig } from "@config/game";
import { BigPullsTicker } from "@/components/home/big-pulls-ticker";
import { Link } from "@/i18n/navigation";
import { createSupabasePublicClient } from "@/lib/supabase/public";

// Public, identical for everyone: regenerated every 5 minutes at most.
export const revalidate = 300;

interface GlobalStats {
  boosters_opened: number;
  cards_drawn: number;
  mythic_drawn: number;
  players: number;
  catalog_size: number;
}

async function loadPublicData() {
  const supabase = createSupabasePublicClient();
  if (!supabase) return { stats: null, pulls: [] };
  const [stats, pulls] = await Promise.all([
    supabase.rpc("get_global_stats"),
    supabase.rpc("get_big_pulls", { p_limit: 20 }),
  ]);
  return {
    stats: (stats.data as GlobalStats | null) ?? null,
    pulls:
      (pulls.data as Parameters<typeof BigPullsTicker>[0]["initial"]) ?? [],
  };
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const format = await getFormatter();
  const { stats, pulls } = await loadPublicData();

  return (
    <>
      <BigPullsTicker initial={pulls} />
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <h1 className="text-5xl font-semibold tracking-[0.3em] text-cream">
          {brand.wordmark}
        </h1>
        <p className="text-xl text-ball">{t("brand.tagline")}</p>
        <p className="max-w-xl text-cream/80">{t("brand.pitch")}</p>
        <Link
          href="/boosters"
          className="rounded-full bg-ball px-8 py-3 text-lg font-semibold text-night hover:opacity-90"
        >
          {t("home.play")}
        </Link>
        <p className="text-sm text-cream/60">
          {t("home.trial", { count: gameConfig.anonymousTrial.boosters })}
        </p>
        {stats && stats.boosters_opened > 0 && (
          <dl className="grid w-full grid-cols-3 gap-3">
            {(
              [
                ["boosters", stats.boosters_opened],
                ["players", stats.players],
                ["mythic", stats.mythic_drawn],
              ] as const
            ).map(([key, value]) => (
              <div
                key={key}
                className="flex flex-col rounded-xl border border-gold/30 px-2 py-3"
              >
                <dt className="order-2 text-xs text-cream/70">
                  {t(`home.stats.${key}`)}
                </dt>
                <dd className="order-1 text-2xl font-semibold text-gold">
                  {format.number(value, { notation: "compact" })}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-sm text-gold">{t("brand.comingSoon")}</p>
        {brand.links.discord && (
          <a
            href={brand.links.discord}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-ball px-6 py-3 font-medium text-ball hover:opacity-90"
          >
            {t("home.joinDiscord")}
          </a>
        )}
      </section>
    </>
  );
}
