import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  MissionsBoard,
  type QuestsData,
} from "@/components/missions/missions-board";
import { Link, redirect } from "@/i18n/navigation";
import {
  createSupabaseServerClient,
  getCurrentUser,
} from "@/lib/supabase/server";

// Per-user page: never prerendered or cached.
export const dynamic = "force-dynamic";

export default async function MissionsPage({
  params,
}: PageProps<"/[locale]/missions">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login", locale });
  const t = await getTranslations("missions");

  if (user.is_anonymous) {
    return (
      <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <p className="text-cream/80">{t("anonymous")}</p>
        <Link
          href="/login"
          className="rounded-full bg-ball px-6 py-3 font-semibold text-night"
        >
          {t("linkAccount")}
        </Link>
      </section>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_quests");
  if (error) throw new Error(error.message);

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-4xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-cream/70">{t("subtitle")}</p>
      </header>
      <MissionsBoard data={data as QuestsData} />
    </section>
  );
}
