import { describe, expect, it } from "vitest";
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
