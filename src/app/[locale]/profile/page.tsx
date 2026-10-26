import { getTranslations, setRequestLocale } from "next-intl/server";
import { CardFront } from "@/components/card/card-front";
import { ProfileSettings } from "@/components/profile/profile-settings";
import { PushPanel } from "@/components/profile/push-panel";
import { SignOutButton } from "@/components/layout/sign-out-button";
import {
  ReferralPanel,
  type ReferralStatus,
} from "@/components/profile/referral-panel";
import { Link, redirect } from "@/i18n/navigation";
import type { CardFrontData } from "@/lib/game/types";
import {
  createSupabaseServerClient,
  getCurrentUser,
} from "@/lib/supabase/server";

// Per-user page: never prerendered or cached.
export const dynamic = "force-dynamic";

interface MyProfile {
  username: string | null;
  referral_code: string;
  show_in_feed: boolean;
  public_profile: boolean;
  badges: string[];
  showcase: CardFrontData[];
  is_anonymous: boolean;
  distinct_cards: number;
  catalog_size: number;
}

export default async function ProfilePage({
  params,
}: PageProps<"/[locale]/profile">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login", locale });
  const t = await getTranslations("profile");
  const tBadges = await getTranslations("badges");

  const supabase = await createSupabaseServerClient();
  const [profile, referral] = await Promise.all([
    supabase.rpc("get_my_profile"),
    supabase.rpc("get_referral_status"),
  ]);
  if (profile.error) throw new Error(profile.error.message);
  if (referral.error) throw new Error(referral.error.message);
  const me = profile.data as MyProfile;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold">{me.username ?? t("title")}</h1>
        <p className="text-cream/70">
          {t("summary", { owned: me.distinct_cards, total: me.catalog_size })}
        </p>
        {me.badges.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {me.badges.map((b) => (
              <li
                key={b}
                className="rounded-full border border-gold px-3 py-0.5 text-xs text-gold"
              >
                {tBadges(b as never)}
              </li>
            ))}
          </ul>
        )}
        {me.username && me.public_profile && (
          <Link
            href={{
              pathname: "/player/[username]",
              params: { username: me.username },
            }}
            className="text-sm text-ball underline"
          >
            {t("viewPublic")}
          </Link>
        )}
      </header>

      {me.is_anonymous && (
        <div className="rounded-xl border border-ball/50 bg-ball/10 p-4 text-sm">
          <p>{t("anonymous")}</p>
          <Link
            href="/login"
            className="mt-2 inline-block font-semibold text-ball underline"
          >
            {t("linkAccount")}
          </Link>
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-cream/20 p-4">
        <h2 className="text-xl font-semibold">{t("showcaseTitle")}</h2>
        {me.showcase.length === 0 ? (
          <p className="text-sm text-cream/70">{t("showcaseEmpty")}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {me.showcase.map((c) => (
              <li key={c.player_id}>
                <CardFront
                  compact
                  name={c.name}
                  countryCode={c.country_code}
                  rarity={c.rarity}
                  image={c.image}
                  catalogNumber={c.catalog_number}
                  catalogSize={me.catalog_size}
                />
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/collection"
          className="self-start text-sm text-ball underline"
        >
          {t("showcaseEdit")}
        </Link>
      </section>

      {!me.is_anonymous && (
        <>
          <ProfileSettings
            username={me.username}
            showInFeed={me.show_in_feed}
            publicProfile={me.public_profile}
          />
          <ReferralPanel status={referral.data as ReferralStatus} />
          <PushPanel />
        </>
      )}
      <SignOutButton />
    </section>
  );
}
