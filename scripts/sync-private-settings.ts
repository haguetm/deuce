/**
 * Copies referral / anti-abuse settings from environment variables into
 * private.settings. Run after each deployment or settings change:
 *   pnpm settings:sync            (reads .env.local)
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Prints key names only, never the values.
 */
import { createClient } from "@supabase/supabase-js";
import {
  parsePrivateSettings,
  toDatabaseEntries,
} from "../src/lib/server/private-settings";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  const entries = toDatabaseEntries(parsePrivateSettings(process.env));
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  for (const { key, value } of entries) {
    const { error } = await supabase.rpc("set_private_setting", {
      p_key: key,
      p_value: value,
    });
    if (error) throw new Error(`${key}: ${error.message}`);
    console.log(`synced ${key}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
