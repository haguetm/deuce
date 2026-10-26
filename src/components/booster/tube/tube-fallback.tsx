"use client";

import { useEffect, useRef, useState } from "react";
import { brand } from "@config/brand";
import type { TubeViewProps } from "./tube-props";
import { exitDuration } from "./tube-timing";

/** Distance (px) the seal tab must be pulled up to open the tube. */
const PULL_THRESHOLD = 60;

/**
 * Flat SVG tennis-ball tube: used when 3D is unavailable or too slow, and
 * (fades only) under prefers-reduced-motion. Same steps as the 3D scene:
 * seal pulled to mid-course while the server answers, gold tint for a golden
 * booster, seal torn off with an air puff, cards rising out.
 */
export function TubeFallback({
  phase,
  golden,
  label,
  colorKey,
  disabled,
  reduced,
  onPull,
  onEmerged,
}: TubeViewProps) {
  const start = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);

  useEffect(() => {
    if (phase !== "emerging") return;
    const id = window.setTimeout(onEmerged, exitDuration(golden, reduced));
    return () => window.clearTimeout(id);
  }, [phase, golden, reduced, onEmerged]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || phase !== "sealed") return;
    start.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current === null) return;
    setDrag(Math.max(0, Math.min(80, start.current - e.clientY)));
  };
  const onPointerUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (drag >= PULL_THRESHOLD) onPull();
    setDrag(0);
  };

  return (
    <div
      className={`tube tube-${phase} ${golden && phase === "emerging" ? "tube-golden" : ""} ${reduced ? "tube-reduced" : ""} ${disabled ? "opacity-50" : ""} relative w-44 touch-none select-none sm:w-52`}
      style={{ ["--pack" as string]: `var(--pack-${colorKey})` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 340" className="w-full overflow-visible">
        <defs>
          <linearGradient id="tube-metal" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" className="tube-stop-dark" />
            <stop offset="0.35" className="tube-stop-light" />
            <stop offset="0.6" className="tube-stop-mid" />
            <stop offset="1" className="tube-stop-dark" />
          </linearGradient>
          <clipPath id="tube-inside">
            <rect x="44" y="-200" width="112" height="262" />
          </clipPath>
        </defs>

        {/* Cards rising out of the tube */}
        <g clipPath="url(#tube-inside)">
          {[0, 1, 2].map((i) => (
            <rect
              key={i}
              className="tube-card"
              x={56 + i * 4}
              y={70 - i * 4}
              width="84"
              height="118"
              rx="6"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </g>

        {/* Body, label and rims */}
        <rect
          x="40"
          y="60"
          width="120"
          height="252"
          rx="14"
          fill="url(#tube-metal)"
        />
        <rect x="40" y="132" width="120" height="118" className="tube-label" />
        <text x="100" y="178" textAnchor="middle" className="tube-wordmark">
          {brand.wordmark}
        </text>
        <text x="100" y="206" textAnchor="middle" className="tube-name">
          {label}
        </text>
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={72 + i * 28}
            cy="232"
            r="9"
            className="tube-ball"
          />
        ))}
        <ellipse cx="100" cy="312" rx="60" ry="10" className="tube-rim" />
        <ellipse cx="100" cy="60" rx="60" ry="14" className="tube-rim" />

        {/* Seal with its pull ring */}
        <g
          className="tube-seal"
          style={
            phase === "sealed" && drag > 0
              ? {
                  transform: `translateY(${-drag / 3}px) scaleY(${1 - drag / 200})`,
                }
              : undefined
          }
        >
          <ellipse cx="100" cy="58" rx="56" ry="11" className="tube-foil" />
          <circle cx="100" cy="70" r="9" className="tube-ring" />
        </g>

        {/* Air puff */}
        {[-40, -20, 0, 20, 40].map((dx, i) => (
          <circle
            key={dx}
            cx={100 + dx}
            cy="50"
            r="10"
            className="tube-puff"
            style={{
              ["--dx" as string]: `${dx}px`,
              animationDelay: `${i * 30}ms`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
