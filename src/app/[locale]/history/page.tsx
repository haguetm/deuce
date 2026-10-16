import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import type { Rarity } from "@config/game";
import { redirect } from "@/i18n/navigation";
import {
  createSupabaseServerClient,
  getCurrentUser,
} from "@/lib/supabase/server";

interface OpeningRow {
  id: string;
  opened_at: string;
  source: "free" | "bonus" | "aces";
  booster_opening_cards: {
    slot: number;
    rarity: Rarity;
    was_new: boolean;
    players: { name: string } | null;
  }[];
}

// Per-user page: never prerendered or cached.
export const dynamic = "force-dynamic";

export default async function HistoryPage({
  params,
}: PageProps<"/[locale]/history">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login", locale });

  // RLS limits rows to the caller's own openings; the seed column is not selectable.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("booster_openings")
    .select(
      "id, opened_at, source, booster_opening_cards(slot, rarity, was_new, players(name))",
    )
    .order("opened_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);

  const t = await getTranslations();
  const format = await getFormatter();
  const openings = (data ?? []) as unknown as OpeningRow[];

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-semibold">{t("history.title")}</h1>
      {openings.length === 0 ? (
        <p className="text-cream/70">{t("history.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {openings.map((o) => (
            <li key={o.id} className="rounded-xl border border-gold/30 p-4">
              <p className="mb-2 text-sm text-cream/70">
                {t("history.openedAt", {
                  date: format.dateTime(new Date(o.opened_at), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })}
                {" · "}
                {t(`history.source.${o.source}`)}
              </p>
              <ul className="flex flex-wrap gap-2">
                {[...o.booster_opening_cards]
                  .sort((a, b) => a.slot - b.slot)
                  .map((c) => (
                    <li
                      key={c.slot}
                      className="rounded-full border px-3 py-1 text-sm"
                      style={{ borderColor: `var(--rarity-${c.rarity})` }}
                    >
                      {c.players?.name} · {t(`rarity.${c.rarity}`)}
                      {c.was_new && <span className="ml-1 text-ball">★</span>}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
