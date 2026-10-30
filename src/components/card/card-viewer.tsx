"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { getCardBackAction } from "@/app/[locale]/collection/actions";
import type { CardBackData, CardFrontData } from "@/lib/game/types";
import { CardBack } from "./card-back";
import { CardFront } from "./card-front";

/** Most tilt, in degrees, when the pointer is on the edge of the card. */
const MAX_TILT = 14;

/**
 * A card up close: it tilts toward the pointer (glare and holo follow), a
 * click or "Flip" turns it over to its back, arrows move through the list.
 * Esc, the backdrop or the close button leave. The back is read once per
 * card and kept while the viewer is open.
 */
export function CardViewer({
  cards,
  index,
  catalogSize,
  onIndex,
  onClose,
}: {
  cards: CardFrontData[];
  index: number;
  catalogSize?: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("viewer");
  const card = cards[index];
  const [flipped, setFlipped] = useState(false);
  const [backs, setBacks] = useState<Record<number, CardBackData>>({});
  const tilt = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= cards.length) return;
      setFlipped(false);
      onIndex(next);
    },
    [cards.length, index, onIndex],
  );

  // Back read in the background as soon as the card shows.
  useEffect(() => {
    if (!card || backs[card.player_id]) return;
    let live = true;
    getCardBackAction(card.player_id).then((result) => {
      if (!live) return;
      // Unreadable back (signed out, dev preview): shown as locked.
      const data = result.ok ? result.data : { ...card, quantity: 0 };
      setBacks((b) => ({ ...b, [card.player_id]: data }));
    });
    return () => {
      live = false;
    };
  }, [card, backs]);

  useEffect(() => {
    dialog.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "f" || e.key === "F") setFlipped((f) => !f);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [go, onClose]);

  const onMove = (e: React.PointerEvent) => {
    const el = tilt.current;
    if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 2 * MAX_TILT}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 2 * MAX_TILT}deg`);
    el.style.setProperty("--glare-x", `${x * 100}%`);
    el.style.setProperty("--glare-y", `${y * 100}%`);
    el.style.setProperty("--holo-x", `${x * 100}%`);
  };
  const onLeave = () => {
    const el = tilt.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  if (!card) return null;
  const back = backs[card.player_id] ?? null;

  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={t("label", { name: card.name })}
      tabIndex={-1}
      className="card-viewer fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-5 p-4 outline-none"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        className="absolute right-4 top-4 rounded-full border border-cream/30 bg-night/70 px-3 py-1 text-lg text-cream hover:border-cream"
      >
        ✕
      </button>

      <div className="flex items-center gap-3 sm:gap-6">
        <NavButton
          label={t("previous")}
          disabled={index === 0}
          onClick={() => go(-1)}
        >
          ‹
        </NavButton>

        <div
          ref={tilt}
          className="viewer-tilt"
          // As large as fits: 22rem wide at most, room left for the buttons.
          style={{ width: "min(78vw, 22rem, calc((100dvh - 11rem) * 5 / 7))" }}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
        >
          {/* The labelled "Flip" button below is the accessible control;
              a click on the card does the same, except on a credit link. */}
          <div
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest("a"))
                setFlipped((f) => !f);
            }}
            className={`viewer-flip relative block aspect-[5/7] w-full cursor-pointer ${flipped ? "is-flipped" : ""}`}
          >
            <span className="viewer-side">
              <CardFront
                name={card.name}
                countryCode={card.country_code}
                rarity={card.rarity}
                image={card.image}
                catalogNumber={card.catalog_number}
                catalogSize={catalogSize}
              />
              <span className="viewer-glare" aria-hidden="true" />
            </span>
            <span className="viewer-side viewer-back">
              <span
                className={`card card-${card.rarity} block h-full`}
                style={{
                  ["--card-rarity" as string]: `var(--rarity-${card.rarity})`,
                }}
              >
                <span className="card-face block h-full text-left">
                  <CardBack card={back} />
                </span>
              </span>
            </span>
          </div>
        </div>

        <NavButton
          label={t("next")}
          disabled={index === cards.length - 1}
          onClick={() => go(1)}
        >
          ›
        </NavButton>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          className="rounded-full bg-ball px-5 py-2 text-sm font-semibold text-night"
        >
          {flipped ? t("showFront") : t("showBack")}
        </button>
        <span className="font-mono text-xs text-cream/60">
          {index + 1}/{cards.length}
        </span>
      </div>
      <p className="hidden text-xs text-cream/40 sm:block">{t("hint")}</p>
    </div>,
    document.body,
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-full border border-cream/30 bg-night/70 px-3 py-1 text-3xl leading-none text-cream disabled:opacity-20"
    >
      {children}
    </button>
  );
}
