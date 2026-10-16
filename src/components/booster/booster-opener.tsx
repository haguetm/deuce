"use client";

import { useCallback, useReducer, useRef } from "react";
import { useTranslations } from "next-intl";
import { gameConfig } from "@config/game";
import { CardFront } from "@/components/card/card-front";
import {
  bestCard,
  initialReveal,
  isHighRarity,
  revealOrder,
  revealReducer,
} from "@/lib/game/reveal";
import type {
  BoosterSource,
  BoosterState,
  OpenResponse,
} from "@/lib/game/types";
import { RefillCountdown } from "./refill-countdown";

interface BoosterOpenerProps {
  initialState: BoosterState;
  open: (source: BoosterSource, requestId: string) => Promise<OpenResponse>;
}

/**
 * Booster opening and card-by-card reveal. The server draws and saves the
 * cards before anything is shown; this component only stages the reveal.
 */
export function BoosterOpener({ initialState, open }: BoosterOpenerProps) {
  const t = useTranslations("booster");
  const tRarity = useTranslations("rarity");
  const [state, dispatch] = useReducer(
    revealReducer,
    initialState,
    initialReveal,
  );
  // Same request id until the server answers, so a retry after a network
  // error replays the same opening instead of opening a second booster.
  const pendingRequest = useRef<{ source: BoosterSource; id: string } | null>(
    null,
  );
  const startOpening = useCallback(
    async (source: BoosterSource) => {
      if (!pendingRequest.current || pendingRequest.current.source !== source) {
        pendingRequest.current = { source, id: crypto.randomUUID() };
      }
      dispatch({ type: "open" });
      try {
        const response = await open(source, pendingRequest.current.id);
        pendingRequest.current = null;
        dispatch(
          response.ok
            ? { type: "opened", opening: response.opening }
            : { type: "failed", error: response.error },
        );
      } catch {
        dispatch({ type: "failed", error: "unknown" });
      }
    },
    [open],
  );

  const onRefill = useCallback(
    () =>
      dispatch({
        type: "refill",
        refillMinutes: gameConfig.booster.refillMinutes,
      }),
    [],
  );

  const booster = state.state;
  const status = (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="text-lg font-semibold">
        {t("stock", { count: booster.stock })}{" "}
        <span className="text-sm font-normal text-cream/60">
          {t("stockOf", { max: booster.max_stock })}
        </span>
      </p>
      {booster.next_refill_at ? (
        <p className="text-sm text-cream/70">
          {t.rich("nextRefill", {
            countdown: () => (
              <RefillCountdown
                target={booster.next_refill_at!}
                onElapsed={onRefill}
              />
            ),
          })}
        </p>
      ) : (
        <p className="text-sm text-cream/70">{t("full")}</p>
      )}
      {booster.bonus_stock > 0 && (
        <p className="text-sm text-ball">
          {t("bonus", { count: booster.bonus_stock })}
        </p>
      )}
    </div>
  );

  if (state.phase === "idle" || state.phase === "opening") {
    const busy = state.phase === "opening";
    return (
      <section className="flex flex-col items-center gap-6" aria-busy={busy}>
        {status}
        <button
          type="button"
          onClick={() => startOpening("free")}
          disabled={busy || booster.stock < 1}
          aria-label={t("open")}
          className={`booster-pack group relative aspect-[5/7] w-48 rounded-2xl border-2 border-gold disabled:opacity-50 ${busy ? "booster-pack-opening" : ""}`}
        >
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span
              className="h-12 w-12 rounded-full bg-ball shadow-[0_0_24px_var(--brand-ball)]"
              aria-hidden="true"
            />
            <span className="text-xs uppercase tracking-[0.3em] text-cream/80">
              {t("packLabel")}
            </span>
          </span>
        </button>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => startOpening("free")}
            disabled={busy || booster.stock < 1}
            className="rounded-full bg-ball px-6 py-3 font-semibold text-night disabled:opacity-40"
          >
            {t("open")}
          </button>
          {booster.bonus_stock > 0 && (
            <button
              type="button"
              onClick={() => startOpening("bonus")}
              disabled={busy}
              className="rounded-full border border-ball px-6 py-3 font-semibold text-ball disabled:opacity-40"
            >
              {t("openBonus")}
            </button>
          )}
        </div>
        <p aria-live="polite" className="min-h-6 text-sm text-cream/70">
          {busy ? t("opening") : ""}
        </p>
        {state.phase === "idle" && state.error && (
          <p
            role="alert"
            className="rounded-lg border border-gold/50 px-4 py-2 text-sm text-cream"
          >
            {t(`errors.${state.error}`)}
          </p>
        )}
      </section>
    );
  }

  const cards = revealOrder(state.opening.cards);
  const revealedCount = state.phase === "done" ? cards.length : state.revealed;
  const best = bestCard(cards);
  const lastRevealed = revealedCount > 0 ? cards[revealedCount - 1] : null;

  return (
    <section className="flex w-full flex-col items-center gap-6">
      <ol className="grid w-full max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card, index) => {
          const isRevealed = index < revealedCount;
          const isNext = state.phase === "revealing" && index === revealedCount;
          return (
            <li
              key={card.slot}
              className="card-slot"
              aria-label={t("cardOf", {
                index: index + 1,
                total: cards.length,
              })}
            >
              <div className={`card-flip ${isRevealed ? "is-revealed" : ""}`}>
                <div className="card-face card-back">
                  <button
                    type="button"
                    disabled={!isNext}
                    onClick={() => dispatch({ type: "revealNext" })}
                    aria-label={t("tapToReveal")}
                    className={`flex aspect-[5/7] w-full items-center justify-center rounded-xl border-2 border-gold bg-emerald/40 ${isNext && isHighRarity(card.rarity) ? "card-tease" : ""}`}
                    style={{
                      ["--card-rarity" as string]: `var(--rarity-${card.rarity})`,
                    }}
                  >
                    <span
                      className="h-10 w-10 rounded-full bg-ball/80"
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <div className="card-face card-front" aria-hidden={!isRevealed}>
                  {isRevealed && (
                    <CardFront
                      name={card.name}
                      countryCode={card.country_code}
                      rarity={card.rarity}
                      image={card.image}
                      badge={card.was_new ? t("new") : t("duplicate")}
                    />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <p aria-live="polite" className="sr-only">
        {lastRevealed &&
          `${lastRevealed.name}, ${tRarity(lastRevealed.rarity)}`}
      </p>

      {state.phase === "revealing" ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => dispatch({ type: "revealNext" })}
            className="rounded-full bg-ball px-6 py-3 font-semibold text-night"
          >
            {t("tapToReveal")}
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "revealAll" })}
            className="rounded-full border border-cream/40 px-6 py-3 text-cream"
          >
            {t("revealAll")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-xl font-semibold text-gold">
            {t("summaryTitle")}
          </h2>
          {best && (
            <p className="text-cream/80">
              {t("bestPull", { name: best.name })}
            </p>
          )}
          {status}
          <button
            type="button"
            onClick={() => dispatch({ type: "again" })}
            className="rounded-full bg-ball px-6 py-3 font-semibold text-night"
          >
            {booster.stock > 0 ? t("again") : t("close")}
          </button>
        </div>
      )}
    </section>
  );
}
