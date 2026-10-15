import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <section className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold text-ball">{t("title")}</h1>
      <p className="text-cream/80">{t("body")}</p>
      <Link href="/" className="underline decoration-gold underline-offset-4">
        {t("back")}
      </Link>
    </section>
  );
}
