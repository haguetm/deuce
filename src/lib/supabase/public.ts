import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * Anonymous Supabase client for public pages (feed, counters, public
 * profiles, shared openings). No cookie, no session: these pages stay
 * cacheable and only reach functions granted to `anon`.
 */
export function createSupabasePublicClient() {
  const env = supabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
