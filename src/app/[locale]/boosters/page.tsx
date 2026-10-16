import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { BoosterOpener } from "@/components/booster/booster-opener";
import {
  createSupabaseServerClient,
  getCurrentUser,
} from "@/lib/supabase/server";
import type { BoosterState } from "@/lib/game/types";
import { openBoosterAction } from "./actions";

// Per-user page: never prerendered or cached.
export const dynamic = "force-dynamic";

export default async function BoostersPage({
  params,
}: PageProps<"/[locale]/boosters">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login", locale });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_booster_state");
  if (error) throw new Error(error.message);
  const t = await getTranslations("booster");

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-wide">{t("title")}</h1>
      <BoosterOpener
        initialState={data as BoosterState}
        open={openBoosterAction}
      />
    </section>
  );
}
