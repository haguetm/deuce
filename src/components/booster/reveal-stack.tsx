"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CardFront } from "@/components/card/card-front";
import { glowTier, isUpperOfPair, stackLayout } from "@/lib/game/glow";
import type { DrawnCard } from "@/lib/game/types";

/** Offset between two stacked cards, in px. */
const STEP = 8;

/**
 * The cards out of the tube, face up and stacked. Card `cursor` is on top
 * and fully visible; only the edges of the next ones show, each with the
 * halo of its pair of rarities (gameConfig.glowTiers), which never changes.
 * The exact rarity appears on the frame once a card is on top, with a shine
 * when it is the better rarity of its pair. A click (or Space, Enter, right
 * arrow) slides the top card up and away.
 */
export function RevealStack({
  cards,
  cursor,
  golden,
  catalogSize,
  onAdvance,
  onRevealAll,
}: {
  cards: DrawnCard[];
  cursor: number;
  golden: boolean;
  catalogSize?: number;
  onAdvance: () => void;
  onRevealAll: () => void;
}) {
  const t = useTranslations("booster");
  const tRarity = useTranslations("rarity");
  const top = cards[cursor];
  const { visible, hidden } = stackLayout(cards.length, cursor);
  // The card that just left stays mounted to play its slide-out transition.
  const shown = cursor > 0 ? [cursor - 1, ...visible] : visible;
  const stage = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stage.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const onControl =
        document.activeElement instanceof HTMLButtonElement ||
        document.activeElement instanceof HTMLAnchorElement;
      if (
        e.key === "ArrowRight" ||
        ((e.key === " " || e.key === "Enter") && !onControl)
      ) {
        // Space/Enter on a focused button already click it.
        e.preventDefault();
        onAdvance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAdvance]);

  return (
    <section className="flex w-full flex-col items-center gap-4">
      {golden && cursor === 0 && (
        <p className="golden-banner rounded-full border border-gold px-4 py-1 text-sm font-semibold uppercase tracking-[0.2em] text-gold">
          {t("goldenBooster")}
        </p>
      )}
      <p className="font-mono text-sm text-cream/70" aria-hidden="true">
        {t("counter", { index: cursor + 1, total: cards.length })}
      </p>

      <button
        ref={stage}
        type="button"
        onClick={onAdvance}
        aria-label={t("nextCard")}
        className="stack relative w-60 sm:w-72"
        style={{
          marginRight: `${(Math.min(cards.length, 6) - 1) * STEP}px`,
          marginBottom: `${(Math.min(cards.length, 6) - 1) * STEP}px`,
        }}
      >
        {/* Sizing ghost: the stack takes the height of one card. */}
        <span className="block aspect-[5/7] w-full" aria-hidden="true" />
        {shown
          .slice()
          .reverse()
          .map((index) => {
            const card = cards[index];
            const depth = index - cursor;
            const isTop = depth === 0;
            const gone = depth < 0;
            return (
              <div
                key={card.slot}
                className={`stack-card glow-${glowTier(card.rarity)} absolute inset-0 rounded-xl ${gone ? "stack-gone" : ""}`}
                style={{
                  zIndex: 100 - depth,
                  transform: gone
                    ? undefined
                    : `translate(${depth * STEP}px, ${depth * STEP}px)`,
                }}
                aria-hidden={!isTop}
              >
                <CardFront
                  name={card.name}
                  countryCode={card.country_code}
                  rarity={card.rarity}
                  image={card.image}
                  concealed={!isTop && !gone}
                  badge={card.was_new ? t("new") : t("duplicate")}
                  highlight={card.was_wished ? t("wished") : undefined}
                  catalogNumber={card.catalog_number}
                  catalogSize={catalogSize}
                />
                {isTop && (
                  <span
                    key={`frame-${card.slot}`}
                    className={`frame-draw ${isUpperOfPair(card.rarity) ? "frame-shine" : ""}`}
                    style={{
                      ["--card-rarity" as string]: `var(--rarity-${card.rarity})`,
                    }}
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })}
        {hidden > 0 && (
          <span className="absolute -bottom-3 -right-3 z-[200] rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-night">
            {t("moreCards", { count: hidden })}
          </span>
        )}
      </button>

      <div className="min-h-14 text-center" aria-live="polite">
        {top && (
          <>
            <p
              className="text-sm font-semibold uppercase tracking-widest"
              style={{ color: `var(--rarity-${top.rarity})` }}
            >
              {tRarity(top.rarity)}
            </p>
            <p className="text-2xl font-semibold">{top.name}</p>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="text-sm text-cream/60">{t("hintNext")}</span>
        <button
          type="button"
          onClick={onRevealAll}
          className="rounded-full border border-cream/40 px-5 py-2 text-sm text-cream"
        >
          {t("revealAll")}
        </button>
      </div>
      <p className="hidden text-xs text-cream/40 sm:block">
        {t("keyboardHint")}
      </p>
    </section>
  );
}
