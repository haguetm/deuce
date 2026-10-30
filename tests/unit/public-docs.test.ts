import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * docs/LEGAL.md is public: attributions, licenses, fan-project notice and
 * takedown procedure only. Internal risk analysis lives in docs/private/
 * (git-ignored).
 */
const FORBIDDEN = [
  /avocat/i,
  /lawyer/i,
  /risque/i,
  /\brisk/i,
  /jonum/i,
  /loot ?box/i,
  /à valider/i,
  /hypoth[eè]se/i,
  /⚖️/,
  /droit à l'image/i,
  /\bINPI\b/,
  /\bEUIPO\b/,
];

describe("public legal page", () => {
  const content = readFileSync(
    path.resolve(__dirname, "../../docs/LEGAL.md"),
    "utf8",
  );

  it("contains no internal risk-analysis terms", () => {
    expect(FORBIDDEN.filter((re) => re.test(content)).map(String)).toEqual([]);
  });

  it("keeps the mandatory public sections", () => {
    for (const heading of [
      "Projet de fans non officiel",
      "Licences",
      "Attributions",
      "Demande de retrait",
    ]) {
      expect(content).toContain(heading);
    }
  });
});
