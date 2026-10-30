"use client";

import { useTranslations } from "next-intl";
import { gameConfig, type PoolKey } from "@config/game";

const POOLS = Object.keys(gameConfig.pools) as PoolKey[];

/** Choice of free booster: same stock and odds, different players. */
export function PoolPicker({
  value,
  onChange,
  disabled,
}: {
  value: PoolKey;
  onChange: (pool: PoolKey) => void;
  disabled: boolean;
}) {
  const t = useTranslations("pools");
  return (
    <fieldset className="flex flex-col items-center gap-2" disabled={disabled}>
      <legend className="mb-2 text-center text-sm text-cream/70">
        {t("legend")}
      </legend>
      <div className="flex flex-wrap justify-center gap-2">
        {POOLS.map((pool) => (
          <label
            key={pool}
            className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm ${value === pool ? "border-ball bg-ball text-night" : "border-cream/30 text-cream hover:border-ball"}`}
          >
            <input
              type="radio"
              name="pool"
              value={pool}
              checked={value === pool}
              onChange={() => onChange(pool)}
              className="sr-only"
            />
            {t(pool)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
