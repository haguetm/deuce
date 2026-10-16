import type { Rarity } from "@config/game";

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
  image: CardImage | null;
}

export interface BoosterState {
  stock: number;
  max_stock: number;
  next_refill_at: string | null;
  bonus_stock: number;
  aces_purchases_left: number;
}

export interface OpeningResult {
  opening_id: string;
  opened_at: string;
  source: "free" | "bonus" | "aces";
  cards: DrawnCard[];
  state: BoosterState;
  replayed: boolean;
}

export type BoosterSource = OpeningResult["source"];

/** Stable error keys raised by open_booster, mapped to messages under booster.errors. */
export const OPEN_ERRORS = [
  "no_booster_available",
  "daily_cap_reached",
  "insufficient_balance",
  "not_authenticated",
  "unknown",
] as const;
export type OpenError = (typeof OPEN_ERRORS)[number];

export type OpenResponse =
  { ok: true; opening: OpeningResult } | { ok: false; error: OpenError };

export function imageUrl(image: CardImage | null): string | null {
  if (!image) return null;
  const base = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/${image.path}`;
}
