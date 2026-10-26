"use client";

import { useTranslations } from "next-intl";
import { packLabel } from "@/lib/game/glow";
import type { BoosterSource } from "@/lib/game/types";
import { Tube3D } from "./tube-3d";
import { TubeFallback } from "./tube-fallback";
import type { TubePhase } from "./tube-props";
import { useRenderMode } from "./use-render-mode";

/**
 * The booster as a tennis-ball tube. Picks the drawing (3D scene, SVG
 * fallback, or fades only) and the label for the source, then plays the
 * opening driven by `phase`.
 */
export function BoosterTube({
  source,
  pool,
  dailyTheme,
  phase,
  golden,
  disabled,
  onPull,
  onEmerged,
}: {
  source: BoosterSource;
  pool: string;
  dailyTheme?: string | null;
  phase: TubePhase;
  golden: boolean;
  disabled: boolean;
  onPull: () => void;
  onEmerged: () => void;
}) {
  const t = useTranslations();
  const { mode, fail, reportFps } = useRenderMode();
  const { message, color } = packLabel(source, pool, dailyTheme);
  const label = t.has(message as never)
    ? t(message as never)
    : t("booster.packLabel");

  const view = {
    phase,
    golden,
    label,
    colorKey: color,
    disabled,
    reduced: mode === "reduced",
    onPull,
    onEmerged,
  };
  return mode === "3d" ? (
    <Tube3D {...view} onFail={fail} onFps={reportFps} />
  ) : (
    <TubeFallback {...view} />
  );
}
