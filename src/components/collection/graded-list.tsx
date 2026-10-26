"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { Rarity } from "@config/game";

export interface GradedCard {
  id: string;
  player_id: number;
  name: string;
  rarity: Rarity;
  certificate: string;
  submitted_at: string;
  ready_at: string;
  grade: number | null;
}

/** Copies sent to grading: pending ones with their date, then the grade. */
export function GradedList({ cards }: { cards: GradedCard[] }) {
  const t = useTranslations("grading");
  const format = useFormatter();
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-cream/20 p-4">
      <p className="font-semibold">{t("title")}</p>
      {cards.length === 0 ? (
        <p className="text-sm text-cream/70">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {cards.slice(0, 8).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span
                className="truncate"
                style={{ color: `var(--rarity-${c.rarity})` }}
              >
                {c.name}
              </span>
              <span className="shrink-0 font-mono text-xs text-cream/80">
                {c.grade === null
                  ? t("pending", {
                      date: format.dateTime(new Date(c.ready_at), {
                        dateStyle: "short",
                        timeStyle: "short",
                      }),
                    })
                  : t("result", {
                      grade: c.grade,
                      label: t(`labels.${c.grade}`),
                      certificate: c.certificate,
                    })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
