"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CardFront } from "@/components/card/card-front";
import { glowsBeforeFlip } from "@/lib/game/reveal";
import type { DrawnCard } from "@/lib/game/types";

/**
 * One card on stage at a time. Its back glows in the rarity color for the
 * better rarities; the next action flips it, the one after moves on. A tap
 * (or a swipe ending on the card), Space, Enter or the right arrow advance; "Reveal all"
 * skips to the summary. A strip of thumbnails keeps the cards already seen.
 */
export function RevealStage({
  cards,
  revealed,
  cursor,
  golden,
  catalogSize,
  onAdvance,
  onRevealAll,
}: {
  cards: DrawnCard[];
  revealed: number;
  cursor: number;
  golden: boolean;
  catalogSize?: number;
  onAdvance: () => void;
  onRevealAll: () => void;
}) {
  const t = useTranslations("booster");
  const tRarity = useTranslations("rarity");
  const card = cards[cursor];
  const flipped = revealed > cursor;
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
      {golden && cursor === 0 && !flipped && (
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
        aria-label={flipped ? t("nextCard") : t("tapToReveal")}
        className="card-slot w-60 sm:w-72"
      >
        <div
          key={card.slot}
          className={`card-flip card-enter ${flipped ? "is-revealed" : ""}`}
        >
          <div className="card-face card-back">
            <div
              className={`flex aspect-[5/7] w-full items-center justify-center rounded-xl border-2 border-gold bg-emerald/40 ${glowsBeforeFlip(card.rarity) ? "card-tease" : ""}`}
              style={{
                ["--card-rarity" as string]: `var(--rarity-${card.rarity})`,
              }}
            >
              <span
                className="h-14 w-14 rounded-full bg-ball/80"
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="card-face card-front" aria-hidden={!flipped}>
            {flipped && (
              <CardFront
                name={card.name}
                countryCode={card.country_code}
                rarity={card.rarity}
                image={card.image}
                badge={card.was_new ? t("new") : t("duplicate")}
                highlight={card.was_wished ? t("wished") : undefined}
                catalogNumber={card.catalog_number}
                catalogSize={catalogSize}
              />
            )}
          </div>
        </div>
      </button>

      <div className="min-h-14 text-center" aria-live="polite">
        {flipped && (
          <>
            <p
              className="text-sm font-semibold uppercase tracking-widest"
              style={{ color: `var(--rarity-${card.rarity})` }}
            >
              {tRarity(card.rarity)}
            </p>
            <p className="text-2xl font-semibold">{card.name}</p>
          </>
        )}
      </div>

      <ol className="flex flex-wrap justify-center gap-1.5" aria-hidden="true">
        {cards.map((c, i) => (
          <li
            key={c.slot}
            className={`h-10 w-7 rounded border-2 ${i < revealed ? "" : "border-cream/20 bg-emerald/30"} ${i === cursor ? "ring-2 ring-ball" : ""}`}
            style={
              i < revealed
                ? {
                    borderColor: `var(--rarity-${c.rarity})`,
                    background: `color-mix(in srgb, var(--rarity-${c.rarity}) 35%, transparent)`,
                  }
                : undefined
            }
          />
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="text-sm text-cream/60">
          {flipped ? t("hintNext") : t("hintFlip")}
        </span>
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
