/** Durations of the tube opening, in ms (shared by the 3D scene and the SVG tube). */
export const TUBE_TIMING = {
  /** Seal peeled to mid-course while the server answers. */
  pull: 600,
  /** Metal turning gold (golden booster only). */
  golden: 500,
  /** Seal torn off, air puff. */
  puff: 400,
  /** Cards rising out of the tube. */
  rise: 500,
  /** Whole exit in reduced-motion mode (fades only). */
  reduced: 300,
} as const;

/** Time from the server answer to the cards being out of the tube. */
export function exitDuration(golden: boolean, reduced: boolean): number {
  if (reduced) return TUBE_TIMING.reduced;
  return (
    (golden ? TUBE_TIMING.golden : 0) + TUBE_TIMING.puff + TUBE_TIMING.rise
  );
}
