import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CardFront } from "@/components/card/card-front";
import { PhotoCredits } from "@/components/card/photo-credits";
import { Link } from "@/i18n/navigation";
import { bestCardFront } from "@/lib/game/best-card";
import { loadSharedOpening } from "@/lib/game/shared-opening";

// A shared opening never changes: cache it for a day.
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/share/[id]">) {
  const { locale, id } = await params;
  const opening = await loadSharedOpening(id);
  const t = await getTranslations({ locale, namespace: "share" });
  const best = opening ? bestCardFront(opening.cards) : undefined;
  return {
    title: best ? t("metaTitle", { name: best.name }) : t("title"),
    description: t("metaDescription"),
  };
}

/** Public page of a shared pull, with its link preview (opengraph-image). */
export default async function SharePage({
  params,
}: PageProps<"/[locale]/share/[id]">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const opening = await loadSharedOpening(id);
  if (!opening) notFound();
  const t = await getTranslations("share");

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-4 py-10 text-center">
      <h1 className="text-3xl font-semibold">
        {opening.username
          ? t("byPlayer", { username: opening.username })
          : t("title")}
      </h1>
      {opening.golden && <p className="text-gold">{t("golden")}</p>}
      <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-5">
        {opening.cards.map((c) => (
          <li key={c.slot}>
            <CardFront
              name={c.name}
              countryCode={c.country_code}
              rarity={c.rarity}
              image={c.image}
              catalogNumber={c.catalog_number}
              catalogSize={opening.catalog_size}
            />
          </li>
        ))}
      </ul>
      <PhotoCredits cards={opening.cards} />
      <Link
        href="/boosters"
        className="rounded-full bg-ball px-6 py-3 font-semibold text-night"
      >
        {t("cta")}
      </Link>
    </section>
  );
}
