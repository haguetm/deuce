"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { gameConfig, type PoolKey } from "@config/game";
import { Link } from "@/i18n/navigation";
import { initialReveal, revealOrder, revealReducer } from "@/lib/game/reveal";
import {
  imageUrl,
  type BoosterSource,
  type BoosterState,
  type OpenBooster,
} from "@/lib/game/types";
import { BoosterPack, type PackVariant } from "./booster-pack";
import { PoolPicker } from "./pool-picker";
import { RevealStage } from "./reveal-stage";
import { RevealSummary } from "./reveal-summary";
import { StatusChips } from "./status-chips";

interface BoosterOpenerProps {
  initialState: BoosterState;
  open: OpenBooster;
  share?: (openingId: string) => Promise<boolean>;
  /** Anonymous trial account: only free boosters, then link the account. */
  anonymous?: boolean;
}

const VARIANT: Record<BoosterSource, PackVariant> = {
  free: "standard",
  bonus: "standard",
  aces: "standard",
  daily: "daily",
  box: "box",
  qualifiers: "qualifiers",
};

/**
 * Booster lobby, opening and card-by-card reveal. The server draws and saves
 * the cards before anything is shown; this component only stages the reveal.
 */
export function BoosterOpener({
  initialState,
  open,
  share,
  anonymous = false,
}: BoosterOpenerProps) {
  const t = useTranslations("booster");
  const tShop = useTranslations("shop");
  const tThemes = useTranslations("dailyThemes");
  const tRarity = useTranslations("rarity");
  const [state, dispatch] = useReducer(
    revealReducer,
    initialState,
    initialReveal,
  );
  const [pool, setPool] = useState<PoolKey>("all");
  const [source, setSource] = useState<BoosterSource>("free");
  // Same request id until the server answers, so a retry after a network
  // error replays the same opening instead of opening a second booster.
  const pendingRequest = useRef<{ key: string; id: string } | null>(null);
  const startOpening = useCallback(
    async (next: BoosterSource) => {
      const key = `${next}:${pool}`;
      if (!pendingRequest.current || pendingRequest.current.key !== key) {
        pendingRequest.current = { key, id: crypto.randomUUID() };
      }
      setSource(next);
      dispatch({ type: "open" });
      try {
        const response = await open(next, pendingRequest.current.id, pool);
        pendingRequest.current = null;
        // Load every photo now, so none pops in during the reveal.
        if (response.ok) {
          for (const card of response.opening.cards) {
            const src = imageUrl(card.image);
            if (src) new Image().src = src;
          }
        }
        dispatch(
          response.ok
            ? { type: "opened", opening: response.opening }
            : { type: "failed", error: response.error },
        );
      } catch {
        dispatch({ type: "failed", error: "unknown" });
      }
    },
    [open, pool],
  );

  const onRefill = useCallback(
    () =>
      dispatch({
        type: "refill",
        refillMinutes: gameConfig.booster.refillMinutes,
      }),
    [],
  );
  const onAdvance = useCallback(() => dispatch({ type: "revealNext" }), []);
  const onRevealAll = useCallback(() => dispatch({ type: "revealAll" }), []);

  const booster = state.state;
  const aces = booster.aces ?? 0;

  // Interim, until the tube animates the exit: the cards are out at once.
  useEffect(() => {
    if (state.phase === "emerging") dispatch({ type: "emerged" });
  }, [state.phase]);

  if (state.phase === "revealing") {
    return (
      <RevealStage
        cards={revealOrder(state.opening.cards)}
        cursor={state.cursor}
        golden={Boolean(state.opening.golden)}
        catalogSize={state.opening.catalog_size}
        onAdvance={onAdvance}
        onRevealAll={onRevealAll}
      />
    );
  }

  if (state.phase === "done") {
    return (
      <RevealSummary
        opening={{
          ...state.opening,
          cards: revealOrder(state.opening.cards),
        }}
        canOpenAgain={booster.stock > 0 || booster.bonus_stock > 0}
        onAgain={() => dispatch({ type: "again" })}
        share={anonymous ? undefined : share}
      />
    );
  }

  const busy = state.phase === "opening";
  const trialOver =
    anonymous &&
    state.phase === "idle" &&
    state.error === "link_account_required";
  const canFree = !busy && booster.stock > 0;
  const packTitle =
    source === "daily"
      ? t("dailyPack")
      : source === "box" || source === "qualifiers"
        ? tShop(`${source}.name`)
        : t("packLabel");

  return (
    <section
      className="flex w-full flex-col items-center gap-6"
      aria-busy={busy}
    >
      <StatusChips state={booster} onRefill={onRefill} />

      {anonymous && (
        <div className="w-full max-w-xl rounded-xl border border-ball/50 bg-ball/10 px-4 py-3 text-center text-sm">
          <p>
            {t("trialNotice", { count: gameConfig.anonymousTrial.boosters })}
          </p>
          <Link
            href="/login"
            className="mt-2 inline-block font-semibold text-ball underline"
          >
            {t("linkAccount")}
          </Link>
        </div>
      )}

      {!anonymous && booster.daily_available && (
        <div className="daily-card flex w-full max-w-xl flex-col items-center gap-2 rounded-2xl border border-gold/60 px-4 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gold">
              {t("dailyKicker")}
            </p>
            <p className="text-lg font-semibold">
              {booster.daily_theme
                ? tThemes(booster.daily_theme)
                : t("dailyPack")}
            </p>
            <p className="text-sm text-cream/70">
              {t("dailyGuarantee", {
                rarity: tRarity(
                  gameConfig.dailyBooster.guaranteedSlotMinRarity,
                ),
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => startOpening("daily")}
            disabled={busy}
            className="rounded-full bg-gold px-5 py-2 font-semibold text-night disabled:opacity-40"
          >
            {t("openDaily")}
          </button>
        </div>
      )}

      {!anonymous && (
        <PoolPicker value={pool} onChange={setPool} disabled={busy} />
      )}

      <BoosterPack
        variant={busy ? VARIANT[source] : "standard"}
        title={busy ? packTitle : t("packLabel")}
        disabled={!canFree}
        busy={busy}
        onOpen={() => startOpening("free")}
      />

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => startOpening("free")}
          disabled={!canFree}
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
          {trialOver && (
            <>
              {" "}
              <Link href="/login" className="font-semibold text-ball underline">
                {t("linkAccount")}
              </Link>
            </>
          )}
        </p>
      )}

      {!anonymous && (
        <section className="w-full max-w-3xl" aria-labelledby="shop-title">
          <h2 id="shop-title" className="mb-1 text-xl font-semibold">
            {tShop("title")}
          </h2>
          <p className="mb-3 text-sm text-cream/60">{tShop("subtitle")}</p>
          <ul className="grid gap-3 sm:grid-cols-3">
            <ShopItem
              name={tShop("aces.name")}
              description={tShop("aces.description")}
              price={gameConfig.acesBooster.price}
              left={tShop("leftToday", { count: booster.aces_purchases_left })}
              disabled={
                busy ||
                booster.aces_purchases_left < 1 ||
                aces < gameConfig.acesBooster.price
              }
              onBuy={() => startOpening("aces")}
            />
            <ShopItem
              name={tShop("box.name")}
              description={tShop("box.description", {
                cards: gameConfig.shop.box.cards,
                rarity: tRarity(gameConfig.shop.box.guaranteedSlotMinRarity),
              })}
              price={gameConfig.shop.box.price}
              left={tShop("leftWeek", { count: booster.box_left ?? 0 })}
              disabled={
                busy ||
                (booster.box_left ?? 0) < 1 ||
                aces < gameConfig.shop.box.price
              }
              onBuy={() => startOpening("box")}
            />
            <ShopItem
              name={tShop("qualifiers.name")}
              description={tShop("qualifiers.description", {
                cards: gameConfig.shop.qualifiers.cards,
              })}
              price={gameConfig.shop.qualifiers.price}
              left={tShop("leftToday", { count: booster.qualifiers_left ?? 0 })}
              disabled={
                busy ||
                (booster.qualifiers_left ?? 0) < 1 ||
                aces < gameConfig.shop.qualifiers.price
              }
              onBuy={() => startOpening("qualifiers")}
            />
          </ul>
        </section>
      )}
    </section>
  );
}

function ShopItem({
  name,
  description,
  price,
  left,
  disabled,
  onBuy,
}: {
  name: string;
  description: string;
  price: number;
  left: string;
  disabled: boolean;
  onBuy: () => void;
}) {
  const t = useTranslations("shop");
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-cream/20 p-4">
      <p className="font-semibold">{name}</p>
      <p className="flex-1 text-sm text-cream/70">{description}</p>
      <p className="text-xs text-cream/50">{left}</p>
      <button
        type="button"
        onClick={onBuy}
        disabled={disabled}
        className="rounded-full border border-gold px-4 py-2 text-sm font-semibold text-gold disabled:opacity-40"
      >
        {t("buy", { price })}
      </button>
    </li>
  );
}
