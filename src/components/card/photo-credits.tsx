"use client";

import { useTranslations } from "next-intl";
import type { CardFrontData } from "@/lib/game/types";

/**
 * Photo credits under a row of card fronts, for pages where the card back
 * (which carries the credit) cannot be opened: shared pulls, public profiles.
 */
export function PhotoCredits({ cards }: { cards: CardFrontData[] }) {
  const t = useTranslations("cardBack");
  const credited = cards.filter((c) => c.image);
  if (credited.length === 0) return null;
  return (
    <p className="text-[11px] leading-relaxed text-cream/50">
      {credited.map((c, i) => (
        <span key={c.player_id}>
          {i > 0 && " · "}
          <a
            href={c.image!.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {c.name} –{" "}
            {t("photoCredit", {
              author: c.image!.author,
              license: c.image!.license,
            })}
          </a>
        </span>
      ))}
    </p>
  );
}
