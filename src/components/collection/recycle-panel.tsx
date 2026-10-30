"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { recycleAction } from "@/app/[locale]/collection/actions";

export interface RecyclePreview {
  max_rarity: string;
  copies: number;
  aces: number;
}

/**
 * Bulk recycling: shows what it would give before doing it. Rarities above
 * the bulk limit are never included here (one card at a time instead).
 */
export function RecyclePanel({ preview }: { preview: RecyclePreview }) {
  const t = useTranslations("collection");
  const tRarity = useTranslations("rarity");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<{ copies: number; aces: number } | null>(
    null,
  );
  const [error, setError] = useState(false);

  const recycle = () =>
    startTransition(async () => {
      setError(false);
      const result = await recycleAction(crypto.randomUUID(), null);
      if (!result.ok) return setError(true);
      setDone({ copies: result.data.copies, aces: result.data.aces });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-cream/20 p-4">
      <p className="font-semibold">{t("recycleTitle")}</p>
      <p className="text-sm text-cream/70">
        {t("recycleHelp", { rarity: tRarity(preview.max_rarity as never) })}
      </p>
      {done ? (
        <p role="status" className="text-sm text-ball">
          {t("recycled", done)}
        </p>
      ) : preview.copies > 0 ? (
        <button
          type="button"
          disabled={pending}
          onClick={recycle}
          className="self-start rounded-full bg-ball px-5 py-2 text-sm font-semibold text-night disabled:opacity-50"
        >
          {t("recycleButton", { copies: preview.copies, aces: preview.aces })}
        </button>
      ) : (
        <p className="text-sm text-cream/50">{t("nothingToRecycle")}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-cream/70">
          {t("errors.unknown")}
        </p>
      )}
    </div>
  );
}
