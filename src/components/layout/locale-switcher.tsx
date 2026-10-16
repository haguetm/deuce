"use client";

import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/** Toggles between the two locales while staying on the same page. */
export function LocaleSwitcher() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const other =
    routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <button
      type="button"
      aria-label={t("language")}
      onClick={() =>
        router.replace(
          // @ts-expect-error -- params match the current pathname by construction
          { pathname, params },
          { locale: other },
        )
      }
      className="rounded-full border border-cream/30 px-3 py-1 text-sm hover:border-ball"
    >
      {t("switchTo")}
    </button>
  );
}
