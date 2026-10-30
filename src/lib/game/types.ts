import type { PoolKey, Rarity } from "@config/game";

export interface CardImage {
  path: string;
  width: number | null;
  height: number | null;
  author: string;
  license: string;
  license_url: string;
  source_url: string;
}

export interface DrawnCard {
  slot: number;
  player_id: number;
  slug: string;
  name: string;
  country_code: string | null;
  rarity: Rarity;
  was_new: boolean;
  /** The card was on the player's wishlist. */
  was_wished?: boolean;
  catalog_number?: number;
  image: CardImage | null;
}

export interface BoosterState {
  stock: number;
  max_stock: number;
  next_refill_at: string | null;
  bonus_stock: number;
  aces_purchases_left: number;
  aces?: number;
  /** Boosters until the guaranteed golden booster (1 = the next one). */
  golden_in?: number;
  /** Boosters until the guaranteed top-rarity card. */
  mythic_in?: number;
  daily_available?: boolean;
  daily_theme?: string;
  box_left?: number;
  qualifiers_left?: number;
}

export const BOOSTER_SOURCES = [
  "free",
  "bonus",
  "aces",
  "daily",
  "box",
  "qualifiers",
] as const;
export type BoosterSource = (typeof BOOSTER_SOURCES)[number];

export interface OpeningResult {
  opening_id: string;
  opened_at: string;
  source: BoosterSource;
  golden?: boolean;
  mythic_pity?: boolean;
  /** Chosen pool, or the daily theme key. */
  pool?: string | null;
  catalog_size?: number;
  cards: DrawnCard[];
  state: BoosterState;
  replayed: boolean;
}

/** Stable error keys raised by open_booster, mapped to messages under booster.errors. */
export const OPEN_ERRORS = [
  "no_booster_available",
  "daily_cap_reached",
  "daily_already_claimed",
  "insufficient_balance",
  "invalid_pool",
  "link_account_required",
  "not_authenticated",
  "unknown",
] as const;
export type OpenError = (typeof OPEN_ERRORS)[number];

export type OpenResponse =
  { ok: true; opening: OpeningResult } | { ok: false; error: OpenError };

export type OpenBooster = (
  source: BoosterSource,
  requestId: string,
  pool?: PoolKey,
) => Promise<OpenResponse>;

/** Public card front (collection, profiles, shared openings). */
export interface CardFrontData {
  player_id: number;
  slug: string;
  name: string;
  country_code: string | null;
  rarity: Rarity;
  catalog_number?: number;
  image: CardImage | null;
}

/** Card back (get_card_back): details, statistics and texts for an owner only. */
export interface CardBackData {
  player_id: number;
  slug: string;
  name: string;
  country_code: string | null;
  rarity: Rarity;
  catalog_number?: number;
  image: CardImage | null;
  quantity: number;
  sex?: "male" | "female";
  birth_date?: string | null;
  hand?: "right" | "left" | null;
  height_cm?: number | null;
  career_start_year?: number | null;
  career_end_year?: number | null;
  preferred_surface?: "hard" | "clay" | "grass" | "carpet" | null;
  stats?: Record<string, number | string>;
  stats_source?: {
    name: string;
    url: string;
    license: string;
    license_url: string;
  } | null;
  texts?: Partial<
    Record<"fr" | "en", { extract: string; article_url: string; license: string }>
  >;
}

export function imageUrl(image: CardImage | null): string | null {
  if (!image) return null;
  const base = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/${image.path}`;
}
