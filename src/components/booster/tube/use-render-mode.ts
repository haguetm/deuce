"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  decideRenderMode,
  fpsIsEnough,
  probeBrowser,
  type RenderMode,
} from "./render-mode";

// Probed once per page load; the answer never changes during a session.
let probed: RenderMode | null = null;
const noSubscribe = () => () => {};
function clientMode(): RenderMode {
  if (probed === null) {
    try {
      probed = decideRenderMode(probeBrowser());
    } catch {
      probed = "fallback";
    }
  }
  return probed;
}

/**
 * Render mode of the booster tube, decided before any interaction. The 3D
 * scene reports its frame rate at rest (`reportFps`) or a failure
 * (`fail`); either can only downgrade to the SVG fallback.
 */
export function useRenderMode() {
  // Server render and first paint: the SVG tube (no WebGL on the server).
  const detected = useSyncExternalStore(
    noSubscribe,
    clientMode,
    () => "fallback" as const,
  );
  const [downgraded, setDowngraded] = useState(false);
  const fail = useCallback(() => setDowngraded(true), []);
  const reportFps = useCallback((averageFps: number) => {
    if (!fpsIsEnough(averageFps)) setDowngraded(true);
  }, []);
  const mode: RenderMode =
    downgraded && detected === "3d" ? "fallback" : detected;
  return { mode, reportFps, fail };
}
