"use client";

import { useLocale, useTranslations } from "next-intl";

/** Flag as regional-indicator emoji with an accessible country name. */
export function CountryFlag({ code }: { code: string | null }) {
  const locale = useLocale();
  const t = useTranslations("card");
  if (!code) return null;
  const emoji = String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
  const country =
    new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  return (
    <span
      role="img"
      aria-label={t("flag", { country })}
      title={country}
      className="text-lg leading-none"
    >
      {emoji}
    </span>
  );
}
