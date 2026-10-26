"use client";

import { useTranslations } from "next-intl";
import type { BoosterState } from "@/lib/game/types";
import { RefillCountdown } from "./refill-countdown";

/**
 * One row of compact counters: what is waiting for the player right now and
 * how close the next guaranteed reward is.
 */
export function StatusChips({
  state,
  onRefill,
}: {
  state: BoosterState;
  onRefill: () => void;
}) {
  const t = useTranslations("chips");
  const full = state.stock >= state.max_stock;
  return (
    <ul className="flex w-full flex-wrap justify-center gap-2 text-sm">
      <Chip tone="ball" label={t("stockLabel")}>
        <span className="font-semibold">
          {t("stock", { stock: state.stock, max: state.max_stock })}
        </span>
        <span className="text-cream/70">
          {full || !state.next_refill_at ? (
            t("full")
          ) : (
            <>
              {t("next")}{" "}
              <RefillCountdown
                target={state.next_refill_at}
                onElapsed={onRefill}
              />
            </>
          )}
        </span>
      </Chip>
      {state.bonus_stock > 0 && (
        <Chip tone="ball" label={t("bonusLabel")}>
          <span className="font-semibold">
            {t("bonus", { count: state.bonus_stock })}
          </span>
        </Chip>
      )}
      {state.aces !== undefined && (
        <Chip tone="cream" label={t("acesLabel")}>
          <span className="font-semibold">
            {t("aces", { count: state.aces })}
          </span>
        </Chip>
      )}
      {state.golden_in !== undefined && (
        <Chip tone="gold" label={t("goldenLabel")}>
          <span className="font-semibold">
            {t("golden", { count: state.golden_in })}
          </span>
        </Chip>
      )}
      {state.mythic_in !== undefined && (
        <Chip tone="mythic" label={t("mythicLabel")}>
          <span className="font-semibold">
            {t("mythic", { count: state.mythic_in })}
          </span>
        </Chip>
      )}
    </ul>
  );
}

const TONES = {
  ball: "border-ball/50",
  cream: "border-cream/30",
  gold: "border-gold/60",
  mythic: "border-[color:var(--rarity-mythic)]/60",
} as const;

function Chip({
  tone,
  label,
  children,
}: {
  tone: keyof typeof TONES;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li
      className={`flex items-center gap-2 rounded-full border bg-night/60 px-3 py-1.5 ${TONES[tone]}`}
    >
      <span className="sr-only">{label}</span>
      {children}
    </li>
  );
}
