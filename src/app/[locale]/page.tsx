import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { brand } from "@config/brand";

export default function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations();

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1 className="text-5xl font-semibold tracking-[0.3em] text-cream">
        {brand.wordmark}
      </h1>
      <p className="text-xl text-ball">{t("brand.tagline")}</p>
      <p className="max-w-xl text-cream/80">{t("brand.pitch")}</p>
      <p className="text-sm text-gold">{t("brand.comingSoon")}</p>
      {brand.links.discord && (
        <a
          href={brand.links.discord}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-ball px-6 py-3 font-medium text-night hover:opacity-90"
        >
          {t("home.joinDiscord")}
        </a>
      )}
    </section>
  );
}
