"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CardFront } from "@/components/card/card-front";
import { CardViewer } from "@/components/card/card-viewer";
import { getPathname, Link } from "@/i18n/navigation";
import { bestCard, fanOrder, openingSummary } from "@/lib/game/reveal";
import type { DrawnCard, OpeningResult } from "@/lib/game/types";

/**
 * End of an opening: the cards in a fan (best one in the middle, larger) or
 * a grid for big formats, what was new, what duplicates are worth, and the
 * next actions: open another, see the collection, share the pull. A card
 * opens up close in the viewer, where it can be turned over.
 */
export function RevealSummary({
  opening,
  canOpenAgain,
  onAgain,
  share,
}: {
  opening: OpeningResult;
  canOpenAgain: boolean;
  onAgain: () => void;
  share?: (openingId: string) => Promise<boolean>;
}) {
  const t = useTranslations("summary");
  const tBooster = useTranslations("booster");
  const locale = useLocale();
  const [shareState, setShareState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const cards = opening.cards;
  const best = bestCard(cards);
  const { newCards, duplicates, duplicateAces } = openingSummary(cards);
  const fan = cards.length <= 5;
  const shown = fan ? fanOrder(cards) : cards;
  const [open, setOpen] = useState<number | null>(null);

  const onShare = async () => {
    if (!share) return;
    const ok = await share(opening.opening_id);
    if (!ok) return setShareState("error");
    const url = `${window.location.origin}${getPathname({
      href: { pathname: "/share/[id]", params: { id: opening.opening_id } },
      locale,
    })}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: t("shareTitle"), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch {
      // Share sheet closed by the user: nothing to report.
    }
  };

  return (
    <section className="flex w-full flex-col items-center gap-6">
      <h2 className="text-2xl font-semibold text-gold">
        {opening.golden ? t("titleGolden") : t("title")}
      </h2>
      {best && (
        <p className="text-cream/80">{t("bestPull", { name: best.name })}</p>
      )}

      {fan ? (
        <ol className="flex w-full max-w-3xl items-end justify-center">
          {shown.map((card, i, all) => {
            const offset = i - (all.length - 1) / 2;
            const isBest = card === best;
            return (
              <li
                key={card.slot}
                className={`summary-fan-card -mx-3 sm:-mx-2 ${isBest ? "z-10 w-36 sm:w-44" : "w-24 sm:w-36"}`}
                style={{
                  transform: `rotate(${offset * 6}deg) translateY(${Math.abs(offset) * 10}px)`,
                }}
              >
                <SummaryCard
                  card={card}
                  opening={opening}
                  onOpen={() => setOpen(i)}
                />
              </li>
            );
          })}
        </ol>
      ) : (
        <ol className="card-grid grid w-full max-w-5xl grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
          {shown.map((card, i) => (
            <li key={card.slot}>
              <SummaryCard
                card={card}
                opening={opening}
                onOpen={() => setOpen(i)}
              />
            </li>
          ))}
        </ol>
      )}

      <p className="text-center text-sm text-cream/80">
        {t("counts", { newCards, duplicates })}
        {duplicates > 0 && (
          <> · {t("duplicateValue", { aces: duplicateAces })}</>
        )}
        {opening.mythic_pity && <> · {t("pity")}</>}
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onAgain}
          className="rounded-full bg-ball px-6 py-3 font-semibold text-night"
        >
          {canOpenAgain ? tBooster("again") : tBooster("close")}
        </button>
        <Link
          href="/collection"
          className="rounded-full border border-cream/40 px-6 py-3 text-cream"
        >
          {t("collection")}
        </Link>
        {share && (
          <button
            type="button"
            onClick={onShare}
            className="rounded-full border border-gold px-6 py-3 text-gold"
          >
            {shareState === "copied" ? t("copied") : t("share")}
          </button>
        )}
        <Link
          href="/missions"
          className="rounded-full border border-cream/20 px-6 py-3 text-cream/80"
        >
          {t("missions")}
        </Link>
      </div>
      {open !== null && (
        <CardViewer
          cards={shown}
          index={open}
          catalogSize={opening.catalog_size}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
      {shareState === "error" && (
        <p role="alert" className="text-sm text-cream/70">
          {t("shareError")}
        </p>
      )}
    </section>
  );
}

function SummaryCard({
  card,
  opening,
  onOpen,
}: {
  card: DrawnCard;
  opening: OpeningResult;
  onOpen: () => void;
}) {
  const t = useTranslations("booster");
  const tCollection = useTranslations("collection");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={tCollection("open", { name: card.name })}
      className="block w-full rounded-[0.9rem] text-left"
    >
      <CardFront
        compact
        name={card.name}
        countryCode={card.country_code}
        rarity={card.rarity}
        image={card.image}
        badge={card.was_new ? t("new") : undefined}
        highlight={card.was_wished ? t("wished") : undefined}
        catalogNumber={card.catalog_number}
        catalogSize={opening.catalog_size}
      />
    </button>
  );
}
