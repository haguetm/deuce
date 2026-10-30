"use client";

import { useTranslations } from "next-intl";
import { RARITIES, type Rarity } from "@config/game";
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
  /** Compact layout for grids and thumbnails. */
  compact?: boolean;
  /**
   * Card still covered in the booster stack: neutral frame, no rarity chip,
   * no rarity text, no holo, no badge. Nothing tells its exact rarity.
   */
  concealed?: boolean;
}

/**
 * Card front: photo, name, flag, rarity. The metal frame, the aura and the
 * holo all use the rarity color, and grow with the rarity (globals.css,
 * `.card-*`). The photo credit is on the back (CardBack).
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
  const holo = isHighRarity(rarity) && !missing && !concealed;
  const tier = RARITIES.indexOf(rarity) + 1;
  return (
    <figure
      className={`card relative aspect-[5/7] w-full ${concealed ? "card-concealed" : `card-${rarity}`} ${missing ? "card-missing" : ""}`}
      style={{
        ["--card-rarity" as string]: concealed
          ? "color-mix(in srgb, var(--brand-cream) 35%, var(--brand-night))"
          : `var(--rarity-${rarity})`,
      }}
    >
      <div className="card-face">
        <div className="card-photo">
          {src ? (
            // Pre-resized WebP from our own storage: next/image would only add a second resize.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={name}
              width={image?.width ?? undefined}
              height={image?.height ?? undefined}
              // Photos are cropped around the face, 36 % from the top
              // (pipeline/deuce_pipeline/images.py): keep it in view.
              className="h-full w-full object-cover object-[50%_36%]"
              loading="lazy"
              draggable={false}
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
          {holo && <span className="card-holo" aria-hidden="true" />}
          {!concealed && (
            <span
              className="card-chip absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase leading-none text-night"
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
                <span className="rounded-full bg-ball px-2 py-0.5 text-xs font-semibold text-night shadow">
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
        <figcaption
          className={`card-plate ${compact ? "px-2 py-1" : "px-3 py-1.5"}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`truncate font-bold text-cream ${compact ? "text-xs" : "text-base"}`}
            >
              {name}
            </span>
            <CountryFlag code={countryCode} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className={`card-rarity-text font-semibold uppercase tracking-wider ${compact ? "text-[9px]" : "text-[11px]"}`}
            >
              {concealed ? " " : t(`rarity.${rarity}`)}
            </span>
            {!concealed && (
              <span className="card-pips" aria-hidden="true">
                {RARITIES.map((r, i) => (
                  <i key={r} className={i < tier ? "on" : ""} />
                ))}
              </span>
            )}
          </div>
        </figcaption>
      </div>
    </figure>
  );
}
