"use client";

import { useEffect, useRef, useState } from "react";
import { brand } from "@config/brand";
import type { TubeScene } from "./tube-scene";
import type { TubePhase, TubeViewProps } from "./tube-props";
import { TubeFallback } from "./tube-fallback";
import { exitDuration } from "./tube-timing";

/**
 * 3D tube: loads the Three.js scene on the client (dynamic import, so other
 * pages never ship it) and drives it from `phase`. The SVG tube stays on
 * screen until the scene is ready; a scene that arrives mid-opening waits
 * for the next booster. Any loading or rendering error calls `onFail`.
 */
export function Tube3D({
  onFail,
  onFps,
  ...props
}: TubeViewProps & {
  onFail: () => void;
  onFps: (average: number) => void;
}) {
  const { phase, golden, label, colorKey, disabled, onPull, onEmerged } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<TubeScene | null>(null);
  const [ready, setReady] = useState(false);
  // Latest props for the scene callbacks and the async import.
  const latest = useRef({ phase, onPull, onEmerged, onFail, onFps });
  useEffect(() => {
    latest.current = { phase, onPull, onEmerged, onFail, onFps };
  });

  useEffect(() => {
    let cancelled = false;
    import("./tube-scene")
      .then(({ createTubeScene }) => {
        if (cancelled || !canvas.current) return;
        const created = createTubeScene(canvas.current, {
          wordmark: brand.wordmark,
          label,
          font: getComputedStyle(document.body).fontFamily,
          colors: {
            pack: brand.packColors[colorKey],
            metal: brand.tube.metal,
            aluminium: brand.tube.aluminium,
            gold: brand.tube.gold,
            puff: brand.tube.puff,
            cream: brand.colors.cream,
            ball: brand.colors.ball,
            emerald: brand.colors.emerald,
          },
          onPull: () => latest.current.onPull(),
          onEmerged: () => latest.current.onEmerged(),
          onFps: (average) => latest.current.onFps(average),
        });
        // Arrived during an opening played by the SVG tube: keep the SVG.
        if (latest.current.phase !== "sealed") {
          created.dispose();
          return;
        }
        scene.current = created;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) latest.current.onFail();
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
    // Created once; label and color updates go through setLabel below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scene.current?.setLabel(label, brand.packColors[colorKey]);
  }, [label, colorKey, ready]);

  useEffect(() => {
    scene.current?.setEnabled(!disabled);
  }, [disabled, ready]);

  // Phase changes drive the scene.
  const previous = useRef<TubePhase>(phase);
  useEffect(() => {
    const s = scene.current;
    const from = previous.current;
    previous.current = phase;
    if (!s || from === phase) return;
    if (phase === "opening") s.pull();
    else if (phase === "emerging") s.resolve(golden);
    else if (phase === "sealed" && from === "opening") s.reject();
  }, [phase, golden, ready]);

  // Safety net: if the browser stops drawing frames (hidden tab, GPU reset),
  // the cards still come out. A second `emerged` is ignored by the reducer.
  useEffect(() => {
    if (phase !== "emerging" || !ready) return;
    const id = window.setTimeout(
      () => latest.current.onEmerged(),
      exitDuration(golden, false) + 1500,
    );
    return () => window.clearTimeout(id);
  }, [phase, golden, ready]);

  return (
    <div className="relative w-44 sm:w-52">
      <canvas
        ref={canvas}
        className={`tube-canvas block aspect-[200/340] w-full touch-none ${ready ? "" : "invisible"} ${disabled ? "opacity-50" : ""}`}
        aria-hidden="true"
      />
      {!ready && (
        <div className="absolute inset-0">
          <TubeFallback {...props} />
        </div>
      )}
    </div>
  );
}
