import type { CSSProperties } from "react";
import { brand } from "@config/brand";

/** Exposes brand colors as CSS variables consumed by globals.css. */
export function brandCssVariables(): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(brand.colors)) {
    vars[`--brand-${key}`] = value;
  }
  for (const [key, value] of Object.entries(brand.rarityColors)) {
    vars[`--rarity-${key}`] = value;
  }
  for (const [key, value] of Object.entries(brand.packColors)) {
    vars[`--pack-${key}`] = value;
  }
  for (const [key, value] of Object.entries(brand.glowColors)) {
    vars[`--glow-${key}`] = value;
  }
  return vars as CSSProperties;
}
