import { useTranslations } from "next-intl";

/**
 * Legal mentions required on every page: fan-project disclaimer and data
 * attributions (Sackmann CC BY-NC-SA, Wikipedia CC BY-SA, Commons).
 */
export function SiteFooter() {
  const t = useTranslations("footer");
  return (
    <footer className="border-t border-gold/30 text-xs text-cream/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6">
        <p className="font-medium text-cream">{t("fanProject")}</p>
        <p>{t("statsCredit")}</p>
        <p>{t("textCredit")}</p>
        <p>{t("free")}</p>
      </div>
    </footer>
  );
}
