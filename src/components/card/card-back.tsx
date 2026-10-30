"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { imageUrl, type CardBackData } from "@/lib/game/types";
import { CountryFlag } from "./country-flag";

const SLAMS = [
  "australian_open_titles",
  "roland_garros_titles",
  "wimbledon_titles",
  "us_open_titles",
] as const;

/**
 * Card back: the player's details, career statistics, Wikipedia biography
 * and every credit (photo, statistics, text). Only an owner gets the
 * details (`get_card_back`); others see what to do to unlock it.
 */
export function CardBack({ card }: { card: CardBackData | null }) {
  const t = useTranslations("cardBack");
  const tRarity = useTranslations("rarity");
  const locale = useLocale();
  const format = useFormatter();

  if (!card) {
    return (
      <Shell>
        <p className="m-auto animate-pulse text-sm text-cream/60">
          {t("loading")}
        </p>
      </Shell>
    );
  }

  const owned = card.quantity > 0 && card.stats !== undefined;
  const stat = (key: string) => {
    const v = card.stats?.[key];
    return v === undefined || v === null ? null : Number(v);
  };
  const wins = stat("match_wins");
  const losses = stat("match_losses");
  const played = (wins ?? 0) + (losses ?? 0);
  const text =
    card.texts?.[locale as "fr" | "en"] ?? card.texts?.en ?? card.texts?.fr;
  const country = card.country_code
    ? (new Intl.DisplayNames([locale], { type: "region" }).of(
        card.country_code,
      ) ?? card.country_code)
    : null;
  const age = card.birth_date ? yearsSince(card.birth_date) : null;
  const src = imageUrl(card.image);

  return (
    <Shell>
      <header className="flex items-center gap-3">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full object-cover object-[50%_30%] ring-2 ring-[color:var(--card-rarity)]"
            draggable={false}
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-bold leading-tight">
            {card.name}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-cream/70">
            <CountryFlag code={card.country_code} />
            {country}
            <span className="card-rarity-text font-semibold uppercase tracking-wider">
              · {tRarity(card.rarity)}
            </span>
          </p>
        </div>
      </header>

      {!owned ? (
        <p className="m-auto max-w-[16rem] text-center text-sm text-cream/70">
          {t("locked")}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {card.birth_date && (
              <Fact
                label={t("born")}
                value={`${format.dateTime(new Date(card.birth_date), { dateStyle: "medium" })}${age !== null && !card.career_end_year ? ` (${t("age", { age })})` : ""}`}
              />
            )}
            {card.hand && (
              <Fact label={t("plays")} value={t(`hand.${card.hand}`)} />
            )}
            {card.height_cm && (
              <Fact
                label={t("height")}
                value={`${(card.height_cm / 100).toFixed(2).replace(".", locale === "fr" ? "," : ".")} m`}
              />
            )}
            {card.career_start_year && (
              <Fact
                label={t("career")}
                value={
                  card.career_end_year
                    ? `${card.career_start_year}–${card.career_end_year}`
                    : t("since", { year: card.career_start_year })
                }
              />
            )}
            {card.preferred_surface && (
              <Fact
                label={t("surface")}
                value={t(`surfaces.${card.preferred_surface}`)}
              />
            )}
          </dl>

          <div className="grid grid-cols-3 gap-1.5">
            <Big
              label={t("bestRank")}
              value={stat("best_rank") ? `#${stat("best_rank")}` : "–"}
            />
            <Big label={t("titles")} value={String(stat("titles") ?? 0)} />
            <Big
              label={t("slams")}
              value={String(stat("grand_slam_titles") ?? 0)}
              strong={(stat("grand_slam_titles") ?? 0) > 0}
            />
            <Big
              label={t("record")}
              value={played ? `${wins ?? 0}–${losses ?? 0}` : "–"}
              hint={
                played
                  ? format.number((wins ?? 0) / played, { style: "percent" })
                  : undefined
              }
            />
            <Big
              label={t("slamFinals")}
              value={String(stat("grand_slam_finals") ?? 0)}
            />
            <Big
              label={t("weeksNo1")}
              value={String(stat("weeks_at_no1") ?? 0)}
            />
          </div>

          {(stat("grand_slam_titles") ?? 0) > 0 && (
            <ul className="flex flex-wrap gap-1 text-[10px]">
              {SLAMS.filter((k) => (stat(k) ?? 0) > 0).map((k) => (
                <li
                  key={k}
                  className="rounded-full border border-gold/60 px-2 py-0.5 text-gold"
                >
                  {t(`slam.${k}`, { count: stat(k) ?? 0 })}
                </li>
              ))}
            </ul>
          )}

          {text && (
            <div className="text-xs leading-relaxed text-cream/85">
              <p className="line-clamp-6">{text.extract}</p>
              <a
                href={text.article_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-ball underline-offset-2 hover:underline"
              >
                {t("readMore")}
              </a>
            </div>
          )}
        </>
      )}

      <footer className="mt-auto flex flex-col gap-0.5 border-t border-cream/15 pt-2 text-[10px] leading-snug text-cream/55">
        {card.image && (
          <a
            href={card.image.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {t("photoCredit", {
              author: card.image.author,
              license: card.image.license,
            })}
          </a>
        )}
        {owned && card.stats_source && (
          <a
            href={card.stats_source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {t("statsCredit", {
              source: card.stats_source.name,
              license: card.stats_source.license,
            })}
          </a>
        )}
        {owned && text && (
          <span>{t("textCredit", { license: text.license })}</span>
        )}
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-back-face flex h-full flex-col gap-2.5 overflow-y-auto p-3 text-cream">
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-cream/50">
        {label}
      </dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function Big({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-lg bg-cream/[0.06] px-2 py-1.5 text-center ring-1 ring-cream/10">
      <p
        className={`font-mono text-base font-bold leading-tight ${strong ? "text-gold" : ""}`}
      >
        {value}
      </p>
      <p className="text-[9px] uppercase leading-tight tracking-wider text-cream/55">
        {label}
        {hint && (
          <span className="block normal-case text-cream/70">{hint}</span>
        )}
      </p>
    </div>
  );
}

function yearsSince(isoDate: string): number {
  const born = new Date(isoDate);
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  if (
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())
  )
    years -= 1;
  return years;
}
