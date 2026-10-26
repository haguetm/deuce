/**
 * Economy simulation: average aces earned per booster from recycling
 * duplicates, from the first booster to the late game.
 *   pnpm simulate:economy [catalogueSize] [boosters]
 */
import { gameConfig } from "../config/game";
import rarity from "../config/rarity.json";
import {
  asymptoticAcesPerBooster,
  dailyFixedAces,
  formatAcesCeiling,
  goldenRate,
  oneOffAces,
  simulatePlayer,
  tierSizes,
} from "../src/lib/game/economy";

const catalogueSize = Number(process.argv[2] ?? 4000);
const boosters = Number(process.argv[3] ?? 100_000);
const catalogue = tierSizes(catalogueSize, rarity.tiers_by_percentile);
const price = gameConfig.acesBooster.price;
const ceiling = asymptoticAcesPerBooster(gameConfig);

console.log(`Catalogue: ${catalogueSize} cards`, catalogue);
console.log(
  `Aces booster price: ${price}, daily cap ${gameConfig.acesBooster.dailyCap}\n`,
);

for (const seed of [1, 2, 3]) {
  const result = simulatePlayer(gameConfig, catalogue, boosters, seed);
  console.log(
    `Seed ${seed}: ${result.collectionSize}/${catalogueSize} cards collected`,
  );
  for (const w of result.windows) {
    console.log(
      `  boosters ${w.from}-${w.to}: ${w.acesPerBooster.toFixed(2)} aces/booster`,
    );
  }
}

console.log(
  `\nCeiling (every card a duplicate): ${ceiling.toFixed(2)} aces/booster`,
);
console.log(
  `= ${((100 * ceiling) / price).toFixed(1)} % of the aces booster price`,
);
console.log(
  `Free boosters needed to fund one aces booster: ${(price / ceiling).toFixed(1)} minimum`,
);
console.log(
  ceiling < price
    ? "OK: no free-booster loop."
    : "FAIL: recycling funds boosters.",
);

const golden = goldenRate(gameConfig);
console.log(
  `
Golden boosters: ${(100 * golden).toFixed(1)} % (one every ${(1 / golden).toFixed(1)} boosters, guaranteed at ${gameConfig.goldenBooster.pityAt})`,
);
const daily = dailyFixedAces(gameConfig);
console.log(
  `Fixed daily rewards (streak average + best daily quests): ${daily.toFixed(1)} aces/day = ${((100 * daily) / price).toFixed(0)} % of an aces booster`,
);
console.log(
  `One-off rewards (welcome quests + achievements): ${oneOffAces(gameConfig)} aces`,
);
for (const format of ["box", "qualifiers"] as const) {
  const value = formatAcesCeiling(gameConfig, format);
  const cost = gameConfig.shop[format].price;
  console.log(
    `Shop ${format}: at most ${value.toFixed(1)} aces back from recycling for ${cost} (${((100 * value) / cost).toFixed(0)} %)`,
  );
}
