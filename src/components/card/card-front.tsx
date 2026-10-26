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
  /** Second badge, highlighted (e.g. "wished!"). */
  highlight?: string;
  catalogNumber?: number;
  catalogSize?: number;
  /** Missing card: dimmed photo, no holo. */
  missing?: boolean;
  /** Compact layout for grids and thumbnails (no credit line). */
  compact?: boolean;
  /**
   * Card still covered in the booster stack: neutral frame, no rarity chip,
   * no rarity text, no holo, no badge. Nothing tells its exact rarity.
   */
  concealed?: boolean;
}

/**
 * Card front: photo (or silhouette), name, flag, rarity. The frame, the
 * rarity chip and the holo all use the rarity color. Every displayed photo
 * carries its credit (author and license, linked to Commons); compact
 * thumbnails shorten it to a link whose title holds the full credit.
 */
export function CardFront({
  name,
  countryCode,
  rarity,
  image,
  badge,
  highlight,
  catalogNumber,
  catalogSize,
  missing = false,
  compact = false,
  concealed = false,
}: CardFrontProps) {
  const t = useTranslations();
  const src = imageUrl(image);
  const frameColor = concealed
    ? "color-mix(in srgb, var(--brand-cream) 25%, transparent)"
    : `var(--rarity-${rarity})`;
  const holo = isHighRarity(rarity) && !missing && !concealed;
  return (
    <figure
      className={`card-frame relative flex aspect-[5/7] w-full flex-col overflow-hidden rounded-xl border-2 border-[color:var(--card-rarity)] bg-night ${holo ? "card-holo" : ""} ${missing ? "opacity-60 grayscale" : ""}`}
      style={{ ["--card-rarity" as string]: frameColor }}
    >
      <div className="relative m-1.5 flex-1 overflow-hidden rounded-lg border border-[color:var(--card-rarity)] bg-cream/5">
        {src && !missing ? (
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
        {!concealed && (
          <span
            className="absolute right-1.5 top-1.5 rounded-full bg-[color:var(--card-rarity)] px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-night"
            title={t(`rarity.${rarity}`)}
          >
            {t(`rarityShort.${rarity}`)}
          </span>
        )}
        {!concealed && (badge || highlight) && (
          <span className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
            {highlight && (
              <span className="card-wished rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-night">
                {highlight}
              </span>
            )}
            {badge && (
              <span className="rounded-full bg-ball px-2 py-0.5 text-xs font-semibold text-night">
                {badge}
              </span>
            )}
          </span>
        )}
        {catalogNumber !== undefined && (
          <span className="absolute bottom-1 left-1.5 rounded bg-night/70 px-1 font-mono text-[10px] text-cream/80">
            {t("card.number", {
              number: String(catalogNumber).padStart(3, "0"),
              total: catalogSize ?? "?",
            })}
          </span>
        )}
      </div>
      <figcaption className={compact ? "px-2 pb-1.5" : "px-3 pb-2"}>
        <div className="flex items-center justify-between gap-2">
          <span
            className={`truncate font-semibold text-cream ${compact ? "text-xs" : ""}`}
          >
            {name}
          </span>
          <CountryFlag code={countryCode} />
        </div>
        <span
          className={`font-medium uppercase tracking-wider text-[color:var(--card-rarity)] ${compact ? "text-[10px]" : "text-xs"}`}
        >
          {concealed ? "\u00a0" : t(`rarity.${rarity}`)}
        </span>
        {image && !missing && (
          <a
            href={image.source_url}
            target="_blank"
            rel="noopener noreferrer"
            title={t("card.photoCredit", {
              author: image.author,
              license: image.license,
            })}
            className="mt-1 block truncate text-[10px] text-cream/60 underline-offset-2 hover:underline"
          >
            {compact
              ? t("card.photoCreditShort")
              : t("card.photoCredit", {
                  author: image.author,
                  license: image.license,
                })}
          </a>
        )}
      </figcaption>
    </figure>
  );
}
