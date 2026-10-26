import { getTranslations, setRequestLocale } from "next-intl/server";
import { BoosterOpener } from "@/components/booster/booster-opener";
import { TryWithoutAccount } from "@/components/auth/try-without-account";
import { Link } from "@/i18n/navigation";
import {
  createSupabaseServerClient,
  getCurrentUser,
} from "@/lib/supabase/server";
import { supabaseEnv } from "@/lib/supabase/env";
import type { BoosterState } from "@/lib/game/types";
import { openBoosterAction, shareOpeningAction } from "./actions";

// Per-user page: never prerendered or cached.
export const dynamic = "force-dynamic";

export default async function BoostersPage({
  params,
}: PageProps<"/[locale]/boosters">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("booster");
  const user = await getCurrentUser();

  // Visitors can try the game before creating an account (anonymous trial,
  // started by an explicit click: no session cookie before that).
  if (!user) {
    return (
      <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-4 py-16 text-center">
        <h1 className="text-3xl font-semibold tracking-wide">{t("title")}</h1>
        <p className="text-cream/80">{t("trialPitch")}</p>
        {supabaseEnv() && <TryWithoutAccount />}
        <Link href="/login" className="text-sm text-ball underline">
          {t("haveAccount")}
        </Link>
      </section>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_booster_state");
  if (error) throw new Error(error.message);

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-wide">{t("title")}</h1>
      <BoosterOpener
        initialState={data as BoosterState}
        open={openBoosterAction}
        share={shareOpeningAction}
        anonymous={Boolean(user.is_anonymous)}
      />
    </section>
  );
}
