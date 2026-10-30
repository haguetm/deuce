import { z } from "zod";

/**
 * Referral and anti-abuse thresholds and weights, push dispatch endpoint.
 *
 * The repository is public, so the real values never appear in it: they are
 * read from environment variables and copied into the database
 * (private.settings) by scripts/sync-private-settings.ts. Only the variable
 * names live here. .env.example holds deliberately generic sample values.
 */
const nonNegativeInt = z.coerce.number().int().min(0);
const nonNegativeNumber = z.coerce.number().min(0);
const flag = z.enum(["true", "false"]).transform((v) => v === "true");

export const privateSettingsSchema = z.object({
  // Referral qualification (referee side)
  REFERRAL_REQUIRE_VERIFIED_EMAIL: flag,
  REFERRAL_MIN_BOOSTERS_OPENED: nonNegativeInt,
  REFERRAL_MIN_ACCOUNT_AGE_HOURS: nonNegativeInt,
  // Referral limits (referrer side)
  REFERRAL_MAX_REWARDS_PER_DAY: nonNegativeInt,
  REFERRAL_MAX_REWARDS_TOTAL: nonNegativeInt,
  // Multi-account suspicion score: sum of weights, compared to the threshold
  ABUSE_WEIGHT_NORMALIZED_EMAIL_MATCH: nonNegativeNumber,
  ABUSE_WEIGHT_DISPOSABLE_EMAIL_DOMAIN: nonNegativeNumber,
  ABUSE_WEIGHT_SIGNUP_BURST: nonNegativeNumber,
  ABUSE_SIGNUP_BURST_WINDOW_MINUTES: nonNegativeInt,
  ABUSE_SCORE_THRESHOLD: nonNegativeNumber,
  // Push reminders: pg_cron posts to this URL with this bearer secret (the
  // same secret is read by the Next.js dispatch route).
  PUSH_DISPATCH_URL: z.url(),
  PUSH_DISPATCH_SECRET: z.string().min(16),
});

export type PrivateSettings = z.infer<typeof privateSettingsSchema>;

/** Parses the environment; throws with the list of missing or invalid variables. */
export function parsePrivateSettings(
  env: Record<string, string | undefined>,
): PrivateSettings {
  const result = privateSettingsSchema.safeParse(env);
  if (!result.success) {
    const names = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid private settings: ${names}`);
  }
  return result.data;
}

/** Database keys: ENV_NAME -> env_name. */
export function toDatabaseEntries(settings: PrivateSettings) {
  return Object.entries(settings).map(([name, value]) => ({
    key: name.toLowerCase(),
    value,
  }));
}

/** Bearer secret expected by the push dispatch route (same value as in the database). */
export function pushDispatchSecret(): string | undefined {
  return process.env.PUSH_DISPATCH_SECRET || undefined;
}
