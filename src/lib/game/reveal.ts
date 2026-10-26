import { gameConfig, RARITIES } from "@config/game";
import type {
  BoosterState,
  DrawnCard,
  OpenError,
  OpeningResult,
} from "./types";

/**
 * Client-side reveal state machine. Purely presentational: the cards are
 * already drawn and saved by the server before the first one is shown.
 *   idle -> open -> opening (tube opening, server call in flight)
 *   opening -> opened -> emerging (tube plays golden, puff, cards rising)
 *   opening -> failed -> idle (with the error)
 *   emerging -> emerged (sent by the tube) -> revealing, cursor 0
 *   revealing -> revealNext (top card slides away) ... -> done
 * Cards come out face up: card `cursor` is on top of the stack and counts
 * as revealed as soon as it gets there.
 */
export type RevealState =
  | { phase: "idle"; state: BoosterState; error: OpenError | null }
  | { phase: "opening"; state: BoosterState }
  | { phase: "emerging"; state: BoosterState; opening: OpeningResult }
  | {
      phase: "revealing";
      state: BoosterState;
      opening: OpeningResult;
      cursor: number;
    }
  | { phase: "done"; state: BoosterState; opening: OpeningResult };

export type RevealAction =
  | { type: "open" }
  | { type: "opened"; opening: OpeningResult }
  | { type: "failed"; error: OpenError }
  | { type: "emerged" }
  | { type: "revealNext" }
  | { type: "revealAll" }
  | { type: "again" }
  | { type: "refill"; refillMinutes: number };

export function initialReveal(state: BoosterState): RevealState {
  return { phase: "idle", state, error: null };
}

export function revealReducer(
  current: RevealState,
  action: RevealAction,
): RevealState {
  switch (action.type) {
    case "open":
      return current.phase === "idle" || current.phase === "done"
        ? { phase: "opening", state: current.state }
        : current;
    case "opened":
      return current.phase === "opening"
        ? {
            phase: "emerging",
            state: action.opening.state,
            opening: action.opening,
          }
        : current;
    case "emerged":
      return current.phase === "emerging"
        ? { ...current, phase: "revealing", cursor: 0 }
        : current;
    case "failed":
      return current.phase === "opening"
        ? { phase: "idle", state: current.state, error: action.error }
        : current;
    case "revealNext": {
      if (current.phase !== "revealing") return current;
      const next = current.cursor + 1;
      return next >= current.opening.cards.length
        ? { phase: "done", state: current.state, opening: current.opening }
        : { ...current, cursor: next };
    }
    case "revealAll":
      return current.phase === "revealing"
        ? { phase: "done", state: current.state, opening: current.opening }
        : current;
    case "refill":
      return {
        ...current,
        state: refilled(current.state, action.refillMinutes),
      } as RevealState;
    case "again":
      return current.phase === "done"
        ? { phase: "idle", state: current.state, error: null }
        : current;
  }
}

/** Local +1 when the countdown elapses (display only, the server stays authoritative). */
export function refilled(
  state: BoosterState,
  refillMinutes: number,
): BoosterState {
  if (!state.next_refill_at || state.stock >= state.max_stock) return state;
  const stock = state.stock + 1;
  return {
    ...state,
    stock,
    next_refill_at:
      stock >= state.max_stock
        ? null
        : new Date(
            new Date(state.next_refill_at).getTime() + refillMinutes * 60_000,
          ).toISOString(),
  };
}

/** Cards in reveal order: slot order, so the guaranteed slot comes last. */
export function revealOrder(cards: DrawnCard[]): DrawnCard[] {
  return [...cards].sort((a, b) => a.slot - b.slot);
}

/** Highest rarity first: used to pick the "best pull" for the summary. */
const ORDER = RARITIES;
export function bestCard(cards: DrawnCard[]): DrawnCard | undefined {
  return [...cards].sort(
    (a, b) => ORDER.indexOf(b.rarity) - ORDER.indexOf(a.rarity),
  )[0];
}

/** Rarities that get the holographic finish. */
export function isHighRarity(rarity: DrawnCard["rarity"]): boolean {
  return ORDER.indexOf(rarity) >= ORDER.indexOf("epic");
}

/** Cards in fan order for the summary: best card in the middle. */
export function fanOrder(cards: DrawnCard[]): DrawnCard[] {
  const sorted = [...cards].sort(
    (a, b) => ORDER.indexOf(b.rarity) - ORDER.indexOf(a.rarity),
  );
  const fan: DrawnCard[] = [];
  sorted.forEach((card, i) =>
    i % 2 === 1 ? fan.push(card) : fan.unshift(card),
  );
  return fan;
}

/** Summary figures: new cards, duplicates and what recycling them would give. */
export function openingSummary(cards: DrawnCard[]) {
  const duplicates = cards.filter((c) => !c.was_new);
  return {
    newCards: cards.length - duplicates.length,
    duplicates: duplicates.length,
    duplicateAces: duplicates.reduce(
      (sum, c) => sum + gameConfig.recycleValues[c.rarity],
      0,
    ),
  };
}
