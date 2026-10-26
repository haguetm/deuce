import { describe, expect, it } from "vitest";
import {
  decideRenderMode,
  fpsIsEnough,
  MIN_FPS,
} from "@/components/booster/tube/render-mode";

const gpu = {
  reducedMotion: false,
  webgl: true,
  renderer: "ANGLE (NVIDIA GeForce RTX 3060)",
};

describe("booster tube render mode", () => {
  it("uses 3D with a GPU", () => {
    expect(decideRenderMode(gpu)).toBe("3d");
    expect(decideRenderMode({ ...gpu, renderer: null })).toBe("3d");
  });

  it("respects reduced motion first", () => {
    expect(decideRenderMode({ ...gpu, reducedMotion: true })).toBe("reduced");
  });

  it("falls back without an accelerated WebGL context", () => {
    expect(decideRenderMode({ ...gpu, webgl: false, renderer: null })).toBe(
      "fallback",
    );
  });

  it("falls back on software rasterizers", () => {
    for (const renderer of [
      "Google SwiftShader",
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))",
      "llvmpipe (LLVM 15.0.7, 256 bits)",
      "Microsoft Basic Render Driver",
    ]) {
      expect(decideRenderMode({ ...gpu, renderer }), renderer).toBe("fallback");
    }
  });

  it("keeps 3D only at a fluid frame rate (iOS low power caps at 30)", () => {
    expect(fpsIsEnough(60)).toBe(true);
    expect(fpsIsEnough(30)).toBe(true);
    expect(fpsIsEnough(MIN_FPS - 1)).toBe(false);
  });
});
