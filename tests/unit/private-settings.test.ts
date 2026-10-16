import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parsePrivateSettings,
  privateSettingsSchema,
  toDatabaseEntries,
} from "@/lib/server/private-settings";

const names = Object.keys(privateSettingsSchema.shape);

function exampleEnv(): Record<string, string> {
  const content = readFileSync(
    path.resolve(__dirname, "../../.env.example"),
    "utf8",
  );
  return Object.fromEntries(
    content
      .split("\n")
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => line.split("=", 2) as [string, string]),
  );
}

describe("private settings", () => {
  it(".env.example documents every setting with a parsable sample value", () => {
    const settings = parsePrivateSettings(exampleEnv());
    expect(Object.keys(settings).sort()).toEqual([...names].sort());
  });

  it("fails loudly and names the missing variables", () => {
    const env = exampleEnv();
    delete env.ABUSE_SCORE_THRESHOLD;
    expect(() => parsePrivateSettings(env)).toThrow(/ABUSE_SCORE_THRESHOLD/);
  });

  it("rejects negative or non-numeric values", () => {
    expect(() =>
      parsePrivateSettings({
        ...exampleEnv(),
        REFERRAL_MIN_BOOSTERS_OPENED: "-1",
      }),
    ).toThrow(/REFERRAL_MIN_BOOSTERS_OPENED/);
    expect(() =>
      parsePrivateSettings({
        ...exampleEnv(),
        ABUSE_WEIGHT_SIGNUP_BURST: "abc",
      }),
    ).toThrow(/ABUSE_WEIGHT_SIGNUP_BURST/);
  });

  it("maps env names to lowercase database keys", () => {
    const keys = toDatabaseEntries(parsePrivateSettings(exampleEnv())).map(
      (e) => e.key,
    );
    expect(keys).toContain("abuse_score_threshold");
    expect(keys.every((k) => /^[a-z0-9_]+$/.test(k))).toBe(true);
  });

  it("no setting value is hardcoded in src/, config/ or supabase/", () => {
    // Guard: setting names may appear only in the schema module, the sync
    // script, .env.example and this test.
    const hits = execSync(
      `git grep -l -E "${names.join("|")}" -- src config supabase || true`,
      { cwd: path.resolve(__dirname, "../.."), encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter((f) => f !== "src/lib/server/private-settings.ts");
    expect(hits).toEqual([]);
  });
});
