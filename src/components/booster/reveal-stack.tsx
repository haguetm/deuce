"use client";

import { useEffect, useRef, useState } from "react";
import { RARITIES, type Rarity } from "@config/game";
import { useTranslations } from "next-intl";
import { CardFront } from "@/components/card/card-front";
import { glowTier, isUpperOfPair, stackLayout } from "@/lib/game/glow";
import type { DrawnCard } from "@/lib/game/types";

/** Offset between two stacked cards, in px. */
const STEP = 8;
/** Cards dealt into the stack when it appears: delay between two, duration of one (ms). */
const DEAL_STAGGER = 110;
const DEAL_DURATION = 560;

/**
 * The cards out of the tube, face up and stacked. Card `cursor` is on top
 * and fully visible; only the edges of the next ones show, each with the
 * halo of its pair of rarities (gameConfig.glowTiers), which never changes.
 * The exact rarity appears on the frame once a card is on top, with a shine
 * when it is the better rarity of its pair. A rare card or better lands with
 * a burst of light in its color, bigger with the rarity (PullBurst). A click
 * (or Space, Enter, right arrow) slides the top card up and away. The
 * rarest cards come last (revealOrder).
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
  // Arrival from the tube: a flash, then the cards dealt into the stack from
  // below, deepest first. The top card shows its rarity once it has landed.
  const [dealing, setDealing] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const dealCount = shown.length;
  useEffect(() => {
    if (!dealing) return;
    const id = window.setTimeout(
      () => setDealing(false),
      (dealCount - 1) * DEAL_STAGGER + DEAL_DURATION,
    );
    return () => window.clearTimeout(id);
    // Only once, when the stack appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    stage.current?.focus({ preventScroll: true });
    stage.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  useEffect(() => {
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
      {dealing && (
        <div
          className="reveal-flash"
          style={{
            ["--flash" as string]: golden
              ? "var(--brand-gold)"
              : "var(--brand-ball)",
          }}
          aria-hidden="true"
        />
      )}
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
        onClick={() => !dealing && onAdvance()}
        aria-label={t("nextCard")}
        className="stack relative w-60 sm:w-72"
        style={{
          marginRight: `${(Math.min(cards.length, 6) - 1) * STEP}px`,
          marginBottom: `${(Math.min(cards.length, 6) - 1) * STEP}px`,
        }}
      >
        {top && !dealing && <PullBurst key={top.slot} rarity={top.rarity} />}
        {/* Sizing ghost: the stack takes the height of one card. */}
        <span className="block aspect-[5/7] w-full" aria-hidden="true" />
        {shown
          .slice()
          .reverse()
          .map((index, order) => {
            const card = cards[index];
            const depth = index - cursor;
            const isTop = depth === 0;
            const gone = depth < 0;
            const landed = isTop && !dealing;
            return (
              <div
                key={card.slot}
                className={`stack-card glow-${glowTier(card.rarity)} absolute inset-0 rounded-[0.9rem] ${gone ? "stack-gone" : ""} ${landed ? `stack-top pull-${pullLevel(card.rarity)}` : ""} ${dealing ? "stack-deal" : ""}`}
                style={{
                  ["--deal-delay" as string]: `${order * DEAL_STAGGER}ms`,
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
                  concealed={!landed && !gone}
                  badge={card.was_new ? t("new") : t("duplicate")}
                  highlight={card.was_wished ? t("wished") : undefined}
                  catalogNumber={card.catalog_number}
                  catalogSize={catalogSize}
                />
                {landed && (
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
        {top && !dealing && (
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

/** 0 = no effect (two lowest rarities), then 1 (rare) to 4 (top rarity). */
export function pullLevel(rarity: Rarity): number {
  return Math.max(0, RARITIES.indexOf(rarity) - 1);
}

/**
 * Light behind the card that just landed: turning rays and a flash in the
 * rarity color, sparks from epic up, a full-screen flash from legendary up.
 * Decorative only (aria-hidden); the rarity is announced in the text below.
 */
function PullBurst({ rarity }: { rarity: Rarity }) {
  const level = pullLevel(rarity);
  if (level === 0) return null;
  const sparks = level >= 2 ? 10 + level * 4 : 0;
  return (
    <div
      className={`pull-burst pull-burst-${level}`}
      style={{ ["--card-rarity" as string]: `var(--rarity-${rarity})` }}
      aria-hidden="true"
    >
      <span className="pull-rays" />
      <span className="pull-flash" />
      {Array.from({ length: sparks }, (_, i) => (
        <span
          key={i}
          className="pull-spark"
          style={{
            ["--a" as string]: `${(360 / sparks) * i + (i % 3) * 7}deg`,
            ["--d" as string]: `${140 + ((i * 37) % 90) + level * 25}px`,
            animationDelay: `${(i % 4) * 40}ms`,
          }}
        />
      ))}
      {level >= 3 && <span className="pull-screen" />}
    </div>
  );
}
