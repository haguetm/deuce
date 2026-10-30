"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClaimResult =
  | { ok: true; aces: number; boosters: number; day?: number }
  | { ok: false; error: string };

function errorKey(message: string) {
  return /^[a-z_]+$/.test(message) ? message : "unknown";
}

/** Today's login reward (the database checks the Paris date and the streak). */
export async function claimStreakAction(): Promise<ClaimResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("claim_login_streak");
  if (error) return { ok: false, error: errorKey(error.message) };
  const d = data as { day: number; aces: number; boosters: number };
  return { ok: true, aces: d.aces, boosters: d.boosters, day: d.day };
}

/** Every completed quest (or one kind / one quest); progress is checked in SQL. */
export async function claimQuestsAction(
  kind: string | null = null,
  key: string | null = null,
): Promise<ClaimResult> {
  const parsed = z
    .object({
      kind: z.enum(["welcome", "daily", "achievement"]).nullable(),
      key: z
        .string()
        .regex(/^[A-Za-z0-9_]+$/)
        .max(40)
        .nullable(),
    })
    .safeParse({ kind, key });
  if (!parsed.success) return { ok: false, error: "unknown" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("claim_quests", {
    p_kind: parsed.data.kind,
    p_key: parsed.data.key,
  });
  if (error) return { ok: false, error: errorKey(error.message) };
  const d = data as { aces: number; boosters: number };
  return { ok: true, aces: d.aces, boosters: d.boosters };
}
