"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

export type PackVariant = "standard" | "daily" | "box" | "qualifiers";

/** Distance (px) the lid must be pulled up to open the pack. */
const PULL_THRESHOLD = 70;

/**
 * Sealed pack shaped like a can of tennis balls. Pulling the lid up opens
 * it (pointer drag, touch included); the separate "Open" button and the
 * keyboard do the same, so the gesture is never required.
 */
export function BoosterPack({
  variant,
  title,
  disabled,
  busy,
  onOpen,
}: {
  variant: PackVariant;
  title: string;
  disabled: boolean;
  busy: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("booster");
  const start = useRef<number | null>(null);
  const [pull, setPull] = useState(0);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || busy) return;
    start.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current === null) return;
    setPull(Math.max(0, Math.min(120, start.current - e.clientY)));
  };
  const onPointerUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (pull >= PULL_THRESHOLD) onOpen();
    setPull(0);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`booster-pack booster-${variant} relative aspect-[5/7] w-44 touch-none select-none rounded-2xl border-2 sm:w-52 ${disabled ? "opacity-50" : ""} ${busy ? "booster-pack-opening" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-hidden="true"
      >
        <span
          className={`booster-lid absolute -top-3 left-1/2 h-8 w-4/5 rounded-t-xl ${busy ? "booster-lid-pop" : ""}`}
          style={
            busy
              ? undefined
              : {
                  transform: `translate(-50%, ${-pull}px) rotate(${-pull / 8}deg)`,
                }
          }
        />
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3 text-center">
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-9 w-9 rounded-full bg-ball shadow-[0_0_18px_var(--brand-ball)]"
              />
            ))}
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-cream/90">
            {title}
          </span>
        </span>
      </div>
      {!disabled && !busy && (
        <p className="text-xs text-cream/60">{t("pullHint")}</p>
      )}
    </div>
  );
}
