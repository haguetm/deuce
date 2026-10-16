"use client";

import { useTranslations } from "next-intl";
import type { Rarity } from "@config/game";
import { imageUrl, type CardImage } from "@/lib/game/types";
import { isHighRarity } from "@/lib/game/reveal";
import { CountryFlag } from "./country-flag";

interface CardFrontProps {
  name: string;
  countryCode: string | null;
  rarity: Rarity;
  image: CardImage | null;
  badge?: string;
}

/**
 * Card front: photo (or silhouette), name, flag, rarity. Every displayed
 * photo carries its credit line (author and license, linked to Commons).
 */
export function CardFront({
  name,
  countryCode,
  rarity,
  image,
  badge,
}: CardFrontProps) {
  const t = useTranslations();
  const src = imageUrl(image);
  return (
    <figure
      className={`card-frame relative flex aspect-[5/7] w-full flex-col overflow-hidden rounded-xl border-2 border-gold bg-night ${isHighRarity(rarity) ? "card-holo" : ""}`}
      style={{ ["--card-rarity" as string]: `var(--rarity-${rarity})` }}
    >
      <div className="relative m-2 flex-1 overflow-hidden rounded-lg border border-[color:var(--card-rarity)] bg-cream/5">
        {src ? (
          // Pre-resized WebP from our own storage: next/image would only add a second resize.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name}
            width={image?.width ?? undefined}
            height={image?.height ?? undefined}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-end justify-center"
            aria-label={t("card.silhouette")}
            role="img"
          >
            <svg
              viewBox="0 0 100 120"
              className="h-4/5 w-4/5 fill-cream/15"
              aria-hidden="true"
            >
              <circle cx="50" cy="35" r="20" />
              <path d="M10 120c0-30 18-48 40-48s40 18 40 48z" />
            </svg>
          </div>
        )}
        {badge && (
          <span className="absolute left-2 top-2 rounded-full bg-ball px-2 py-0.5 text-xs font-semibold text-night">
            {badge}
          </span>
        )}
      </div>
      <figcaption className="px-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold text-cream">{name}</span>
          <CountryFlag code={countryCode} />
        </div>
        <span className="text-xs font-medium uppercase tracking-wider text-[color:var(--card-rarity)]">
          {t(`rarity.${rarity}`)}
        </span>
        {image && (
          <a
            href={image.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block truncate text-[10px] text-cream/60 underline-offset-2 hover:underline"
          >
            {t("card.photoCredit", {
              author: image.author,
              license: image.license,
            })}
          </a>
        )}
      </figcaption>
    </figure>
  );
}
