"use server";

import { z } from "zod";
import {
  createSupabaseServerClient,
  getCurrentUser,
} from "@/lib/supabase/server";
import {
  OPEN_ERRORS,
  type OpenError,
  type OpenResponse,
  type OpeningResult,
} from "@/lib/game/types";

const input = z.object({
  source: z.enum(["free", "bonus", "aces"]),
  requestId: z.string().min(8).max(100),
});

/**
 * Thin wrapper over the open_booster SQL function. Safe: it runs as the
 * signed-in user (anon key + session), so the database checks identity,
 * stock and balance; nothing here can grant a card on its own.
 */
export async function openBoosterAction(
  source: string,
  requestId: string,
): Promise<OpenResponse> {
  const parsed = input.safeParse({ source, requestId });
  if (!parsed.success) return { ok: false, error: "unknown" };
  if (!(await getCurrentUser()))
    return { ok: false, error: "not_authenticated" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("open_booster", {
    p_source: parsed.data.source,
    p_request_id: parsed.data.requestId,
  });
  if (error) {
    const known = OPEN_ERRORS.find((e) => error.message === e);
    return { ok: false, error: (known ?? "unknown") as OpenError };
  }
  return { ok: true, opening: data as OpeningResult };
}
