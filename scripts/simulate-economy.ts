/**
 * Economy simulation: average aces earned per booster from recycling
 * duplicates, from the first booster to the late game.
 *   pnpm simulate:economy [catalogueSize] [boosters]
 */
import { gameConfig } from "../config/game";
import rarity from "../config/rarity.json";
import {
  asymptoticAcesPerBooster,
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
