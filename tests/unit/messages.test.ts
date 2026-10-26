import { describe, expect, it } from "vitest";
import { gameConfig, RARITIES } from "@config/game";
import fr from "../../messages/fr.json";
import en from "../../messages/en.json";

function flattenKeys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? flattenKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("i18n messages", () => {
  it("fr and en expose exactly the same keys", () => {
    expect(flattenKeys(en).sort()).toEqual(flattenKeys(fr).sort());
  });

  it("no message is empty", () => {
    for (const messages of [fr, en]) {
      const empty = flattenKeys(messages).filter((key) => {
        const value = key
          .split(".")
          .reduce<unknown>(
            (o, k) => (o as Record<string, unknown>)[k],
            messages,
          );
        return typeof value !== "string" || value.trim() === "";
      });
      expect(empty).toEqual([]);
    }
  });
});

describe("game config keys have messages", () => {
  const has = (messages: object, key: string) =>
    key
      .split(".")
      .reduce<unknown>(
        (o, k) =>
          o && typeof o === "object"
            ? (o as Record<string, unknown>)[k]
            : undefined,
        messages,
      ) !== undefined;

  const keys = [
    ...gameConfig.welcomeQuests.map((q) => `quests.welcome.${q.key}.title`),
    ...gameConfig.dailyQuests.pool.map((q) => `quests.daily.${q.key}.title`),
    ...gameConfig.achievements.map((q) => `quests.achievement.${q.key}.title`),
    ...gameConfig.dailyThemes.calendar.map((t) => `dailyThemes.${t.key}`),
    ...gameConfig.dailyThemes.rotation.map((t) => `dailyThemes.${t.key}`),
    ...Object.keys(gameConfig.pools).map((p) => `pools.${p}`),
    ...gameConfig.collections.map((c) => `collections.${c.key}`),
    ...gameConfig.referral.milestones
      .filter((m) => m.badge)
      .map((m) => `badges.${m.badge}`),
    ...RARITIES.map((r) => `rarityShort.${r}`),
    ...Object.keys(gameConfig.grading.gradeWeights).map(
      (g) => `grading.labels.${g}`,
    ),
  ];

  it("every quest, theme, pool, collection and badge is translated", () => {
    for (const messages of [fr, en]) {
      expect(keys.filter((k) => !has(messages, k))).toEqual([]);
    }
  });
});
