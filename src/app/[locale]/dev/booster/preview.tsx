"use client";

import { useCallback, useRef } from "react";
import { BoosterOpener } from "@/components/booster/booster-opener";
import { fictionalPlayers } from "@/lib/dev/fictional-players";
import type {
  BoosterSource,
  BoosterState,
  OpenResponse,
} from "@/lib/game/types";

const players = fictionalPlayers();

/**
 * Development-only preview with a fake server: fictional players, fixed
 * pull, and every other booster golden to check both tube endings.
 */
export function BoosterPreview({ initial }: { initial: BoosterState }) {
  const count = useRef(0);
  const open = useCallback(
    async (source: BoosterSource): Promise<OpenResponse> => {
      await new Promise((r) => setTimeout(r, 700));
      count.current += 1;
      const picks = [
        players[60],
        players[45],
        players[80],
        players[20],
        players[3],
      ];
      return {
        ok: true,
        opening: {
          opening_id: crypto.randomUUID(),
          opened_at: new Date().toISOString(),
          source,
          golden: count.current % 2 === 0,
          catalog_size: players.length,
          replayed: false,
          state: { ...initial, stock: initial.stock - 1 },
          cards: picks.map((p, i) => ({
            slot: i + 1,
            player_id: i + 1,
            slug: p.slug,
            name: p.name,
            country_code: p.countryCode,
            rarity: p.rarity,
            was_new: i !== 1,
            catalog_number: i * 17 + 3,
            image: null,
          })),
        },
      };
    },
    [initial],
  );
  return <BoosterOpener initialState={initial} open={open} />;
}
