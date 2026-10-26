import "server-only";
import { cache } from "react";
import type { CardFrontData } from "@/lib/game/types";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export interface SharedOpening {
  opening_id: string;
  opened_at: string;
  source: string;
  golden: boolean;
  username: string | null;
  catalog_size: number;
  cards: (CardFrontData & { slot: number; was_new: boolean })[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An opening its owner chose to share (null otherwise). */
export const loadSharedOpening = cache(
  async (id: string): Promise<SharedOpening | null> => {
    if (!UUID.test(id)) return null;
    const supabase = createSupabasePublicClient();
    if (!supabase) return null;
    const { data } = await supabase.rpc("get_shared_opening", {
      p_opening: id,
    });
    return (data as SharedOpening | null) ?? null;
  },
);
