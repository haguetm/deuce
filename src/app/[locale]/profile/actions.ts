"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfileResult = { ok: true } | { ok: false; error: string };

async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<ProfileResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(name, args);
  if (error)
    return {
      ok: false,
      error: /^[a-z_]+$/.test(error.message) ? error.message : "unknown",
    };
  return { ok: true };
}

export async function setUsernameAction(username: string) {
  const parsed = z
    .string()
    .regex(/^[A-Za-z0-9_]{3,20}$/)
    .safeParse(username);
  if (!parsed.success) return { ok: false, error: "invalid_username" } as const;
  return rpc("set_username", { p_username: parsed.data });
}

export async function setPreferencesAction(
  showInFeed: boolean,
  publicProfile: boolean,
) {
  return rpc("set_profile_preferences", {
    p_show_in_feed: Boolean(showInFeed),
    p_public_profile: Boolean(publicProfile),
  });
}

export async function claimReferralAction(code: string) {
  const parsed = z.string().trim().min(4).max(20).safeParse(code);
  if (!parsed.success)
    return { ok: false, error: "invalid_referral_code" } as const;
  return rpc("claim_referral", { p_code: parsed.data });
}

const subscription = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(100),
  stockFull: z.boolean(),
  streak: z.boolean(),
});

export async function savePushAction(input: z.input<typeof subscription>) {
  const parsed = subscription.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "invalid_subscription" } as const;
  return rpc("save_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth: parsed.data.auth,
    p_stock_full: parsed.data.stockFull,
    p_streak: parsed.data.streak,
  });
}

export async function deletePushAction(endpoint: string) {
  const parsed = z.string().max(1000).safeParse(endpoint);
  if (!parsed.success) return { ok: false, error: "unknown" } as const;
  return rpc("delete_push_subscription", { p_endpoint: parsed.data });
}

export async function getPushAction(
  endpoint: string,
): Promise<{ stock_full: boolean; streak: boolean } | null> {
  const parsed = z.string().max(1000).safeParse(endpoint);
  if (!parsed.success) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_push_subscription", {
    p_endpoint: parsed.data,
  });
  return (data as { stock_full: boolean; streak: boolean } | null) ?? null;
}
