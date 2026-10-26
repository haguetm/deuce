import type { MetadataRoute } from "next";
import { brand } from "@config/brand";
import { routing } from "@/i18n/routing";

/** Installable app (home-screen icon, no address bar). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    start_url: `/${routing.defaultLocale}/boosters`,
    display: "standalone",
    background_color: brand.colors.night,
    theme_color: brand.colors.night,
    icons: [{ src: brand.logo.mark, sizes: "any", type: "image/svg+xml" }],
  };
}
