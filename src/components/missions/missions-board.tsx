"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  claimQuestsAction,
  claimStreakAction,
  type ClaimResult,
} from "@/app/[locale]/missions/actions";

export interface QuestsData {
  streak: {
    day: number;
    claimed_today: boolean;
    next_day: number;
    rewards: number[];
    last_day_boosters: number;
    grace_left: number;
    total: number;
  };
  quests: {
    kind: "welcome" | "daily" | "achievement";
    key: string;
    target: number;
    reward: number;
    progress: number;
    claimed: boolean;
  }[];
  bonus: {
    daily_boosters: number;
    daily_claimed: boolean;
    welcome_boosters: number;
    welcome_claimed: boolean;
  };
  resets_at: string;
  claimable: number;
}

/**
 * Streak, welcome quests (a rewarded tutorial), daily quests and
 * achievements. Progress comes from the database; claiming re-checks it.
 */
export function MissionsBoard({ data }: { data: QuestsData }) {
  const t = useTranslations("missions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const run = (action: () => Promise<ClaimResult>) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setToast(
          t(
            t.has(`errors.${result.error}`)
              ? `errors.${result.error}`
              : "errors.unknown",
          ),
        );
        return;
      }
      setToast(t("claimed", { aces: result.aces, boosters: result.boosters }));
      router.refresh();
    });

  const { streak } = data;
  const byKind = (kind: QuestsData["quests"][number]["kind"]) =>
    data.quests.filter((q) => q.kind === kind);
  const welcome = byKind("welcome");
  const welcomeDone = welcome.every((q) => q.claimed);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || data.claimable === 0}
          onClick={() =>
            run(async (): Promise<ClaimResult> => {
              let aces = 0;
              let boosters = 0;
              if (!streak.claimed_today) {
                const s = await claimStreakAction();
                if (s.ok) {
                  aces += s.aces;
                  boosters += s.boosters;
                }
              }
              const q = await claimQuestsAction();
              if (q.ok) {
                aces += q.aces;
                boosters += q.boosters;
              } else if (aces === 0 && boosters === 0) return q;
              return { ok: true, aces, boosters };
            })
          }
          className="rounded-full bg-ball px-6 py-3 font-semibold text-night disabled:opacity-40"
        >
          {t("claimAll", { count: data.claimable })}
        </button>
        <p role="status" aria-live="polite" className="text-sm text-ball">
          {toast}
        </p>
      </div>

      <section className="rounded-2xl border border-gold/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">{t("streakTitle")}</h2>
            <p className="text-sm text-cream/60">
              {t("streakHelp", { grace: streak.grace_left })}
            </p>
          </div>
          {streak.claimed_today ? (
            <span className="rounded-full border border-ball/50 px-3 py-1 text-sm text-ball">
              {t("streakClaimed")}
            </span>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(claimStreakAction)}
              className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-night"
            >
              {t("streakClaim", {
                day: streak.next_day,
                aces: streak.rewards[streak.next_day - 1],
              })}
            </button>
          )}
        </div>
        <ol className="grid grid-cols-7 gap-1.5">
          {streak.rewards.map((reward, i) => {
            const day = i + 1;
            const current = streak.claimed_today
              ? streak.day
              : streak.next_day - 1;
            const done = day <= current;
            const next = !streak.claimed_today && day === streak.next_day;
            return (
              <li
                key={day}
                className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center ${done ? "border-ball/60 bg-ball/10" : next ? "border-gold" : "border-cream/15"}`}
              >
                <span className="text-xs text-cream/60">
                  {t("day", { day })}
                </span>
                <span className="text-sm font-semibold">
                  {t("aces", { count: reward })}
                </span>
                {day === 7 && (
                  <span className="text-[10px] text-gold">
                    {t("plusBoosters", { count: streak.last_day_boosters })}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {!(welcomeDone && data.bonus.welcome_claimed) && (
        <QuestSection
          title={t("welcomeTitle")}
          subtitle={t("welcomeBonus", { count: data.bonus.welcome_boosters })}
          quests={welcome}
          pending={pending}
          onClaim={(key) => run(() => claimQuestsAction("welcome", key))}
        />
      )}

      <QuestSection
        title={t("dailyTitle")}
        subtitle={
          data.bonus.daily_claimed
            ? t("dailyBonusClaimed")
            : t("dailyBonus", { count: data.bonus.daily_boosters })
        }
        quests={byKind("daily")}
        pending={pending}
        onClaim={(key) => run(() => claimQuestsAction("daily", key))}
      />

      <QuestSection
        title={t("achievementsTitle")}
        subtitle={t("achievementsCount", {
          done: byKind("achievement").filter((q) => q.claimed).length,
          total: byKind("achievement").length,
        })}
        quests={byKind("achievement")}
        pending={pending}
        onClaim={(key) => run(() => claimQuestsAction("achievement", key))}
      />
    </div>
  );
}

function QuestSection({
  title,
  subtitle,
  quests,
  pending,
  onClaim,
}: {
  title: string;
  subtitle: string;
  quests: QuestsData["quests"];
  pending: boolean;
  onClaim: (key: string) => void;
}) {
  const t = useTranslations("missions");
  const tQuest = useTranslations("quests");
  const tRarity = useTranslations("rarity");
  // Quest keys come from the game config: typed loosely, checked by the
  // messages test (every config quest has a title in both languages).
  const quest = tQuest as unknown as (
    key: string,
    values?: Record<string, string | number>,
  ) => string;
  const values = {
    rare: tRarity("rare"),
    legendary: tRarity("legendary"),
    mythic: tRarity("mythic"),
  };
  return (
    <section>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-cream/60">{subtitle}</p>
      <ul className="flex flex-col gap-2">
        {quests.map((q) => {
          const complete = q.progress >= q.target;
          return (
            <li
              key={`${q.kind}-${q.key}`}
              className="flex items-center gap-3 rounded-xl border border-cream/15 px-4 py-3"
            >
              <div className="flex flex-1 flex-col gap-1.5">
                <span className="font-medium">
                  {quest(`${q.kind}.${q.key}.title`, {
                    ...values,
                    target: q.target,
                  })}
                </span>
                {tQuest.has(`${q.kind}.${q.key}.hint` as never) && (
                  <span className="text-xs text-cream/60">
                    {quest(`${q.kind}.${q.key}.hint`, {
                      ...values,
                      target: q.target,
                    })}
                  </span>
                )}
                <span className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream/10">
                    <span
                      className="block h-full rounded-full bg-ball"
                      style={{ width: `${(100 * q.progress) / q.target}%` }}
                    />
                  </span>
                  <span className="font-mono text-xs text-cream/70">
                    {q.progress}/{q.target}
                  </span>
                </span>
              </div>
              <span className="w-16 text-right text-sm text-gold">
                {t("aces", { count: q.reward })}
              </span>
              {q.claimed ? (
                <span className="w-24 text-center text-xs text-cream/50">
                  {t("done")}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={pending || !complete}
                  onClick={() => onClaim(q.key)}
                  className="w-24 rounded-full border border-ball px-3 py-1 text-xs font-semibold text-ball disabled:border-cream/20 disabled:text-cream/40"
                >
                  {complete ? t("claim") : t("inProgress")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
