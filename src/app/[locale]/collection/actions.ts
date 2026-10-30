"use server";

import { z } from "zod";
import { RARITIES } from "@config/game";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CardBackData } from "@/lib/game/types";

/**
 * Collection mutations. Each one is a thin wrapper over a SECURITY DEFINER
 * SQL function acting as the signed-in user: ownership, balance and caps are
 * checked by the database.
 */

export type ActionResult<T = unknown> =
  { ok: true; data: T } | { ok: false; error: string };

async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<ActionResult<T>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    // Stable error keys from the SQL functions, anything else is "unknown".
    const key = /^[a-z_]+$/.test(error.message) ? error.message : "unknown";
    return { ok: false, error: key };
  }
  return { ok: true, data: data as T };
}

const playerId = z.coerce.number().int().positive();
const requestId = z.string().min(8).max(100);

export async function setWishlistAction(id: number, wished: boolean) {
  const parsed = playerId.safeParse(id);
  if (!parsed.success) return { ok: false, error: "unknown" } as const;
  return rpc<boolean>("set_wishlist", {
    p_player_id: parsed.data,
    p_wished: Boolean(wished),
  });
}

export async function recycleAction(
  request: string,
  maxRarity: string | null,
  id: number | null = null,
) {
  const parsed = z
    .object({
      request: requestId,
      maxRarity: z.enum(RARITIES).nullable(),
      id: playerId.nullable(),
    })
    .safeParse({ request, maxRarity, id });
  if (!parsed.success) return { ok: false, error: "unknown" } as const;
  return rpc<{ copies: number; aces: number; balance: number }>(
    "recycle_duplicates",
    {
      p_request_id: parsed.data.request,
      p_max_rarity: parsed.data.maxRarity,
      p_player_id: parsed.data.id,
    },
  );
}

/** Card back, read when a card is opened (details only for an owner). */
export async function getCardBackAction(id: number) {
  const parsed = playerId.safeParse(id);
  if (!parsed.success) return { ok: false, error: "unknown" } as const;
  return rpc<CardBackData>("get_card_back", { p_player_id: parsed.data });
}

export async function setShowcaseAction(ids: number[]) {
  const parsed = z.array(playerId).max(10).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "unknown" } as const;
  return rpc<number[]>("set_showcase", { p_player_ids: parsed.data });
}
