/**
 * Single source of truth for the brand identity.
 *
 * Renaming the game = edit this file + the `brand` namespace in messages/*.json.
 * No other file may hardcode the name, colors, URLs or logo paths.
 */

export const brand = {
  /** Display name. Also used in share-image watermarks and the PWA manifest. */
  name: "Deuce",
  /** Short name for the PWA home-screen icon (max ~12 chars). */
  shortName: "Deuce",
  /** Wordmark shown in the header until the final logo lands in public/brand/. */
  wordmark: "DEUCE",
  /** Public site URL, overridable per environment (Vercel previews, prod). */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  /** Name of the in-game currency (singular key in messages: currency.*). */
  currencyCode: "aces",

  colors: {
    night: "#0B1B3A", // background
    ball: "#DFFF4F", // primary accent
    gold: "#C9A227", // borders, high rarities
    cream: "#F5F2E9", // text and card faces
    emerald: "#0F5132", // secondary accent
  },

  /** Rarity frame colors, from lowest to highest tier. */
  rarityColors: {
    common: "#8A93A6",
    uncommon: "#4FA36B",
    rare: "#3B82C4",
    epic: "#8E5BD0",
    legendary: "#C9A227",
    mythic: "#DFFF4F",
  },

  /**
   * Booster tube label colors, per pool or source. A pool without its own
   * color uses `default`.
   */
  packColors: {
    default: "#2F6F8F",
    all: "#2F6F8F",
    men: "#1F4E9C",
    women: "#B23A6B",
    daily: "#C9A227",
    box: "#5B3FA8",
    qualifiers: "#3B7F5C",
  },

  /**
   * Halo around a card still hidden in the booster stack: one color per pair
   * of rarities (gameConfig.glowTiers), so the halo never tells the exact rarity.
   */
  glowColors: {
    1: "#A8C3B0",
    2: "#6A7BFF",
    3: "#FFB02E",
  },

  /** 3D tube materials and the "pschitt" puff. */
  tube: {
    metal: "#C9CED6",
    aluminium: "#E4E7EB",
    gold: "#D4A62A",
    puff: "#F5F2E9",
  },

  /**
   * Logo assets. Placeholder until the final emblem is dropped in public/brand/.
   * Paths are relative to /public.
   */
  logo: {
    mark: "/brand/mark.svg",
    icon192: "/brand/icon-192.png",
    icon512: "/brand/icon-512.png",
  },

  links: {
    /** Discord invite, set per environment. Hidden in the UI when empty. */
    discord: process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? "",
  },
} as const;

export type Brand = typeof brand;
export type RarityKey = keyof typeof brand.rarityColors;
