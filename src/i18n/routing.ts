import { defineRouting } from "next-intl/routing";

/**
 * Locales and localized pathnames. Every user-facing route is declared here
 * so French and English URLs stay readable (/fr/retrait vs /en/takedown).
 */
export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  localePrefix: "always",
  // No locale cookie: the locale lives in the URL, so the site sets zero
  // cookies for anonymous visitors (see docs/LEGAL.md).
  localeCookie: false,
  pathnames: {
    "/": "/",
    "/takedown": { fr: "/retrait", en: "/takedown" },
    "/odds": { fr: "/probabilites", en: "/odds" },
    "/login": { fr: "/connexion", en: "/login" },
    "/boosters": "/boosters",
    "/history": { fr: "/historique", en: "/history" },
    "/dev/booster": "/dev/booster",
  },
});

export type Locale = (typeof routing.locales)[number];
