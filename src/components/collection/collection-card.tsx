"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { gameConfig } from "@config/game";
import { CardFront } from "@/components/card/card-front";
import { useRouter } from "@/i18n/navigation";
import type { CardFrontData } from "@/lib/game/types";
import {
  recycleAction,
  setShowcaseAction,
  setWishlistAction,
  submitGradingAction,
} from "@/app/[locale]/collection/actions";

export interface CollectionCardData extends CardFrontData {
  quantity: number;
  wished: boolean;
  graded: number;
}

/**
 * One card of the collection grid with its actions: wish a missing card;
 * for owned cards, showcase it, send a copy to grading, recycle the
 * duplicates of a high rarity (bulk recycling skips those).
 */
export function CollectionCard({
  card,
  catalogSize,
  showcase,
  aces,
}: {
  card: CollectionCardData;
  catalogSize: number;
  showcase: number[];
  aces: number;
}) {
  const t = useTranslations("collection");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const owned = card.quantity > 0;
  const inShowcase = showcase.includes(card.player_id);
  const fee = gameConfig.grading.fees[card.rarity];
  const ungraded = card.quantity - card.graded;
  const highRarity =
    gameConfig.recycleValues[card.rarity] >
    gameConfig.recycleValues[gameConfig.recycle.bulkMaxRarity];

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error ?? "unknown");
      else router.refresh();
    });

  return (
    <li className="flex flex-col gap-1.5">
      <div className="relative">
        <CardFront
          compact
          missing={!owned}
          name={card.name}
          countryCode={card.country_code}
          rarity={card.rarity}
          image={card.image}
          catalogNumber={card.catalog_number}
          catalogSize={catalogSize}
          badge={
            card.quantity > 1
              ? t("copies", { count: card.quantity })
              : undefined
          }
          highlight={
            card.graded > 0 ? t("graded", { count: card.graded }) : undefined
          }
        />
        {!owned && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => setWishlistAction(card.player_id, !card.wished))
            }
            aria-pressed={card.wished}
            aria-label={card.wished ? t("unwish") : t("wish")}
            className={`absolute bottom-8 right-1.5 rounded-full border px-2 py-1 text-sm ${card.wished ? "border-gold bg-gold text-night" : "border-cream/40 bg-night/80 text-cream"}`}
          >
            {card.wished ? "♥" : "♡"}
          </button>
        )}
      </div>
      {owned && (
        <div className="flex flex-wrap gap-1 text-[11px]">
          <button
            type="button"
            disabled={
              pending ||
              (!inShowcase && showcase.length >= gameConfig.showcaseSize)
            }
            onClick={() =>
              run(() =>
                setShowcaseAction(
                  inShowcase
                    ? showcase.filter((id) => id !== card.player_id)
                    : [...showcase, card.player_id],
                ),
              )
            }
            aria-pressed={inShowcase}
            className={`rounded-full border px-2 py-0.5 disabled:opacity-40 ${inShowcase ? "border-ball text-ball" : "border-cream/30 text-cream/80"}`}
          >
            {inShowcase ? t("inShowcase") : t("toShowcase")}
          </button>
          <button
            type="button"
            disabled={pending || ungraded < 1 || aces < fee}
            onClick={() => {
              if (window.confirm(t("gradeConfirm", { name: card.name, fee })))
                run(() =>
                  submitGradingAction(card.player_id, crypto.randomUUID()),
                );
            }}
            className="rounded-full border border-cream/30 px-2 py-0.5 text-cream/80 disabled:opacity-40"
          >
            {t("grade", { fee })}
          </button>
          {highRarity && card.quantity - Math.max(1, card.graded) > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(t("recycleOneConfirm", { name: card.name })))
                  run(() =>
                    recycleAction(crypto.randomUUID(), null, card.player_id),
                  );
              }}
              className="rounded-full border border-gold/60 px-2 py-0.5 text-gold"
            >
              {t("recycleOne")}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-[11px] text-cream/70">
          {t(t.has(`errors.${error}`) ? `errors.${error}` : "errors.unknown")}
        </p>
      )}
    </li>
  );
}
