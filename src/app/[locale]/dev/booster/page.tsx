import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { BoosterPreview } from "./preview";

function previewState() {
  return {
    stock: 3,
    max_stock: 10,
    next_refill_at: new Date(Date.now() + 9 * 60_000).toISOString(),
    bonus_stock: 1,
    aces_purchases_left: 3,
  };
}

/** Visual check of the reveal without Supabase. Not available in production. */
export default async function DevBoosterPage({
  params,
}: PageProps<"/[locale]/dev/booster">) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_DEV_PREVIEW !== "1"
  )
    notFound();
  await connection(); // render per request: the countdown target depends on the current time
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dev");
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-10">
      <p className="rounded bg-gold/20 px-3 py-1 text-sm">
        {t("previewBanner")}
      </p>
      <BoosterPreview initial={previewState()} />
    </section>
  );
}
