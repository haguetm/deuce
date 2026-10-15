import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { brand } from "@config/brand";
import { routing } from "@/i18n/routing";
import { brandCssVariables } from "@/lib/brand-css";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import "../globals.css";

const inter = Inter({ variable: "--font-sans-family", subsets: ["latin"] });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return {
    metadataBase: new URL(brand.siteUrl),
    title: t("metaTitle", { name: brand.name }),
    description: t("metaDescription"),
    icons: { icon: brand.logo.mark },
  };
}

export const viewport: Viewport = {
  themeColor: brand.colors.night,
};

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("skip");

  return (
    <html
      lang={locale}
      style={brandCssVariables()}
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-ball focus:px-3 focus:py-2 focus:text-night"
        >
          {t("toContent")}
        </a>
        <NextIntlClientProvider>
          <SiteHeader />
          <main id="main" className="flex flex-1 flex-col">
            {children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
