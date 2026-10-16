import { describe, expect, it } from "vitest";
import {
  bestCard,
  refilled,
  initialReveal,
  isHighRarity,
  revealOrder,
  revealReducer,
} from "@/lib/game/reveal";
import type { DrawnCard, OpeningResult } from "@/lib/game/types";

const state = {
  stock: 2,
  max_stock: 10,
  next_refill_at: null,
  bonus_stock: 0,
  aces_purchases_left: 3,
};
const card = (slot: number, rarity: DrawnCard["rarity"]): DrawnCard => ({
  slot,
  player_id: slot,
  slug: `p-${slot}`,
  name: `P ${slot}`,
  country_code: "FR",
  rarity,
  was_new: true,
  image: null,
});
const opening: OpeningResult = {
  opening_id: "o1",
  opened_at: "2026-10-16T10:00:00Z",
  source: "free",
  replayed: false,
  cards: [
    card(3, "common"),
    card(1, "rare"),
    card(5, "epic"),
    card(2, "common"),
    card(4, "uncommon"),
  ],
  state: { ...state, stock: 1 },
};

describe("reveal state machine", () => {
  it("goes idle -> opening -> revealing -> done, one card at a time", () => {
    let s = initialReveal(state);
    s = revealReducer(s, { type: "open" });
    expect(s.phase).toBe("opening");
    s = revealReducer(s, { type: "opened", opening });
    expect(s).toMatchObject({
      phase: "revealing",
      revealed: 0,
      state: { stock: 1 },
    });
    for (let i = 0; i < 4; i++) s = revealReducer(s, { type: "revealNext" });
    expect(s).toMatchObject({ phase: "revealing", revealed: 4 });
    s = revealReducer(s, { type: "revealNext" });
    expect(s.phase).toBe("done");
    s = revealReducer(s, { type: "again" });
    expect(s).toMatchObject({
      phase: "idle",
      error: null,
      state: { stock: 1 },
    });
  });

  it("can skip to the end", () => {
    let s = revealReducer(
      revealReducer(initialReveal(state), { type: "open" }),
      { type: "opened", opening },
    );
    s = revealReducer(s, { type: "revealAll" });
    expect(s.phase).toBe("done");
  });

  it("returns to idle with an error when the server refuses", () => {
    const s = revealReducer(
      revealReducer(initialReveal(state), { type: "open" }),
      {
        type: "failed",
        error: "no_booster_available",
      },
    );
    expect(s).toEqual({ phase: "idle", state, error: "no_booster_available" });
  });

  it("ignores a double click while a booster is opening", () => {
    const opening1 = revealReducer(initialReveal(state), { type: "open" });
    expect(revealReducer(opening1, { type: "open" })).toBe(opening1);
  });

  it("reveals in slot order, guaranteed slot last, and finds the best pull", () => {
    expect(revealOrder(opening.cards).map((c) => c.slot)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(bestCard(opening.cards)?.rarity).toBe("epic");
    expect(isHighRarity("epic")).toBe(true);
    expect(isHighRarity("rare")).toBe(false);
  });
});

describe("local refill tick", () => {
  it("adds one booster and schedules the next, stopping at the cap", () => {
    const s1 = refilled(
      { ...state, stock: 8, next_refill_at: "2026-10-16T10:00:00.000Z" },
      15,
    );
    expect(s1).toMatchObject({
      stock: 9,
      next_refill_at: "2026-10-16T10:15:00.000Z",
    });
    expect(refilled(s1, 15)).toMatchObject({ stock: 10, next_refill_at: null });
    expect(
      refilled({ ...state, stock: 10, next_refill_at: null }, 15).stock,
    ).toBe(10);
  });
});
