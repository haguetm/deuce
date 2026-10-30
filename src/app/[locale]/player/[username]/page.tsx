import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CardFront } from "@/components/card/card-front";
import { PhotoCredits } from "@/components/card/photo-credits";
import type { CardFrontData } from "@/lib/game/types";
import { createSupabasePublicClient } from "@/lib/supabase/public";

// Public page, refreshed every minute.
export const revalidate = 60;

interface PublicProfile {
  username: string;
  since: string;
  badges: string[];
  distinct_cards: number;
  catalog_size: number;
  showcase: CardFrontData[];
}

async function loadProfile(username: string) {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return null;
  const supabase = createSupabasePublicClient();
  if (!supabase) return null;
  const { data } = await supabase.rpc("get_public_profile", {
    p_username: username,
  });
  return (data as PublicProfile | null) ?? null;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/player/[username]">) {
  const { locale, username } = await params;
  const t = await getTranslations({ locale, namespace: "player" });
  return { title: t("metaTitle", { username }) };
}

/** Public profile: showcase, badges and collection progress. */
export default async function PlayerPage({
  params,
}: PageProps<"/[locale]/player/[username]">) {
  const { locale, username } = await params;
  setRequestLocale(locale);
  const profile = await loadProfile(username);
  if (!profile) notFound();
  const t = await getTranslations("player");
  const tBadges = await getTranslations("badges");

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold">{profile.username}</h1>
        <p className="text-cream/70">
          {t("progress", {
            owned: profile.distinct_cards,
            total: profile.catalog_size,
          })}
        </p>
        {profile.badges.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {profile.badges.map((b) => (
              <li
                key={b}
                className="rounded-full border border-gold px-3 py-0.5 text-xs text-gold"
              >
                {tBadges(b as never)}
              </li>
            ))}
          </ul>
        )}
      </header>
      <h2 className="text-xl font-semibold">{t("showcase")}</h2>
      {profile.showcase.length === 0 ? (
        <p className="text-cream/70">{t("emptyShowcase")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {profile.showcase.map((c) => (
            <li key={c.player_id}>
              <CardFront
                name={c.name}
                countryCode={c.country_code}
                rarity={c.rarity}
                image={c.image}
                catalogNumber={c.catalog_number}
                catalogSize={profile.catalog_size}
              />
            </li>
          ))}
        </ul>
      )}
      <PhotoCredits cards={profile.showcase} />
    </section>
  );
}
