"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { claimReferralAction } from "@/app/[locale]/profile/actions";

export interface ReferralStatus {
  code: string;
  rewarded: number;
  pending: number;
  referred: string | null;
  can_claim: boolean;
  rewards: {
    referrer_boosters: number;
    referee_boosters: number;
    milestones: { referrals: number; boosters: number; badge: string | null }[];
  };
}

/**
 * Referral: the player's link, progress towards the milestones, and (for a
 * new account) the code of whoever invited them. Rewards are public; the
 * qualification rules stay private.
 */
export function ReferralPanel({ status }: { status: ReferralStatus }) {
  const t = useTranslations("referral");
  const tBadges = useTranslations("badges");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const link = () => `${window.location.origin}/${locale}?ref=${status.code}`;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-gold/40 p-4">
      <div>
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <p className="text-sm text-cream/70">
          {t("pitch", {
            referrer: status.rewards.referrer_boosters,
            referee: status.rewards.referee_boosters,
          })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-cream/10 px-2 py-1 font-mono">
          {status.code}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              if (navigator.share)
                await navigator.share({ title: t("shareTitle"), url: link() });
              else {
                await navigator.clipboard.writeText(link());
                setCopied(true);
              }
            } catch {
              // Share sheet closed: nothing to do.
            }
          }}
          className="rounded-full border border-gold px-4 py-1.5 text-sm text-gold"
        >
          {copied ? t("copied") : t("share")}
        </button>
      </div>
      <p className="text-sm">
        {t("progress", { rewarded: status.rewarded, pending: status.pending })}
      </p>
      <ol className="flex flex-wrap gap-2 text-xs">
        {status.rewards.milestones.map((m) => (
          <li
            key={m.referrals}
            className={`rounded-full border px-3 py-1 ${status.rewarded >= m.referrals ? "border-ball text-ball" : "border-cream/20 text-cream/70"}`}
          >
            {t("milestone", { referrals: m.referrals, boosters: m.boosters })}
            {m.badge && <> · {tBadges(m.badge as never)}</>}
          </li>
        ))}
      </ol>
      <p className="text-xs text-cream/50">{t("rules")}</p>

      {status.can_claim && (
        <form
          className="flex flex-wrap items-end gap-2 border-t border-cream/10 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await claimReferralAction(code);
              setMessage(
                result.ok
                  ? t("claimed")
                  : t(
                      t.has(`errors.${result.error}`)
                        ? `errors.${result.error}`
                        : "errors.unknown",
                    ),
              );
              if (result.ok) router.refresh();
            });
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            {t("invitedBy")}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded-lg border border-cream/30 bg-night px-3 py-1.5 font-mono"
            />
          </label>
          <button
            type="submit"
            disabled={pending || code.length < 4}
            className="rounded-full bg-ball px-4 py-1.5 text-sm font-semibold text-night disabled:opacity-40"
          >
            {t("claim")}
          </button>
        </form>
      )}
      {status.referred && (
        <p className="text-xs text-cream/60">
          {t(`status.${status.referred}` as never)}
        </p>
      )}
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-ball">
        {message}
      </p>
    </section>
  );
}
