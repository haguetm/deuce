import type { PackColorKey } from "@/lib/game/glow";

/** Tube state, driven by the reveal state machine. */
export type TubePhase = "sealed" | "opening" | "emerging";

/** Props shared by the 3D tube and the SVG fallback. */
export interface TubeViewProps {
  phase: TubePhase;
  /** Known once the server answered (phase "emerging"). */
  golden: boolean;
  /** Label printed on the tube (translated booster name). */
  label: string;
  colorKey: PackColorKey;
  disabled: boolean;
  /** Fades only (prefers-reduced-motion). */
  reduced: boolean;
  /** The seal was pulled: start the opening. */
  onPull: () => void;
  /** The cards are out of the tube. */
  onEmerged: () => void;
}
