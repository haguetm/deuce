/**
 * How the booster tube is drawn:
 *   "3d"       Three.js scene, GPU-accelerated;
 *   "fallback" flat SVG tube (no WebGL, software rendering, too slow);
 *   "reduced"  the SVG tube with fades only (prefers-reduced-motion).
 * Pure decision logic, tested with fake probes; the browser probe is below.
 */
export type RenderMode = "3d" | "fallback" | "reduced";

export interface RenderProbe {
  reducedMotion: boolean;
  /** WebGL context obtained with failIfMajorPerformanceCaveat. */
  webgl: boolean;
  /** Unmasked renderer name, when the browser tells it. */
  renderer: string | null;
}

/** Below this average frame rate at rest, the 3D scene gives way to SVG. */
export const MIN_FPS = 24;

/** Renderer names of software (CPU) rasterizers. */
const SOFTWARE_RENDERERS = [
  /swiftshader/i,
  /llvmpipe/i,
  /basic render/i,
  /software/i,
];

export function decideRenderMode(probe: RenderProbe): RenderMode {
  if (probe.reducedMotion) return "reduced";
  if (!probe.webgl) return "fallback";
  if (
    probe.renderer &&
    SOFTWARE_RENDERERS.some((re) => re.test(probe.renderer!))
  )
    return "fallback";
  return "3d";
}

/** Average frame rate measured at rest decides whether the 3D scene stays. */
export function fpsIsEnough(averageFps: number): boolean {
  return averageFps >= MIN_FPS;
}

/** Browser probe: a throw-away canvas, released right after. */
export function probeBrowser(): RenderProbe {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const canvas = document.createElement("canvas");
  const options = { failIfMajorPerformanceCaveat: true };
  const gl = (canvas.getContext("webgl2", options) ??
    canvas.getContext("webgl", options)) as WebGLRenderingContext | null;
  if (!gl) return { reducedMotion, webgl: false, renderer: null };
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = info
    ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
    : null;
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return { reducedMotion, webgl: true, renderer };
}
