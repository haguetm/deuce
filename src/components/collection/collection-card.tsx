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
} from "@/app/[locale]/collection/actions";

export interface CollectionCardData extends CardFrontData {
  quantity: number;
  wished: boolean;
}

/**
 * One card of the collection grid with its actions: a click opens it up
 * close (CardViewer); wish a missing card; for owned cards, showcase it,
 * recycle the duplicates of a high rarity (bulk recycling skips those).
 */
export function CollectionCard({
  card,
  catalogSize,
  showcase,
  onOpen,
}: {
  card: CollectionCardData;
  catalogSize: number;
  showcase: number[];
  onOpen: () => void;
}) {
  const t = useTranslations("collection");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const owned = card.quantity > 0;
  const inShowcase = showcase.includes(card.player_id);
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
        <button
          type="button"
          onClick={onOpen}
          aria-label={t("open", { name: card.name })}
          className="collection-card-open block w-full rounded-[0.9rem] text-left"
        >
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
          />
        </button>
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
          {highRarity && card.quantity > 1 && (
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
