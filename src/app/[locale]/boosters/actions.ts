"use server";

import { z } from "zod";
import { gameConfig, type PoolKey } from "@config/game";
import {
  createSupabaseServerClient,
  getCurrentUser,
} from "@/lib/supabase/server";
import {
  BOOSTER_SOURCES,
  OPEN_ERRORS,
  type OpenError,
  type OpenResponse,
  type OpeningResult,
} from "@/lib/game/types";

const input = z.object({
  source: z.enum(BOOSTER_SOURCES),
  requestId: z.string().min(8).max(100),
  pool: z.enum(Object.keys(gameConfig.pools) as [PoolKey, ...PoolKey[]]),
});

/**
 * Thin wrapper over the open_booster SQL function. Safe: it runs as the
 * signed-in user (anon key + session), so the database checks identity,
 * stock and balance; nothing here can grant a card on its own.
 */
export async function openBoosterAction(
  source: string,
  requestId: string,
  pool: string = "all",
): Promise<OpenResponse> {
  const parsed = input.safeParse({ source, requestId, pool });
  if (!parsed.success) return { ok: false, error: "unknown" };
  if (!(await getCurrentUser()))
    return { ok: false, error: "not_authenticated" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("open_booster", {
    p_source: parsed.data.source,
    p_request_id: parsed.data.requestId,
    p_pool: parsed.data.pool,
  });
  if (error) {
    const known = OPEN_ERRORS.find((e) => error.message === e);
    return { ok: false, error: (known ?? "unknown") as OpenError };
  }
  return { ok: true, opening: data as OpeningResult };
}

/** Marks one of the caller's openings as shared (its link becomes public). */
export async function shareOpeningAction(openingId: string): Promise<boolean> {
  if (!z.uuid().safeParse(openingId).success) return false;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("share_opening", {
    p_opening: openingId,
  });
  return !error;
}
