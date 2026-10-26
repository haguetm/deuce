import { RARITIES, type Rarity } from "@config/game";
import { mulberry32, tierSizes } from "@/lib/game/economy";
import rarityConfig from "../../../config/rarity.json";

/**
 * Deterministic fictional players for local development (pnpm db:seed:dev).
 * Names are assembled from invented syllables; no photo, no real person.
 * Every row is flagged is_dev_seed and refused by the database outside
 * development (players_dev_seed_guard).
 */

export interface FictionalPlayer {
  wikidataId: string;
  slug: string;
  name: string;
  sex: "male" | "female";
  birthDate: string;
  countryCode: string;
  hand: "right" | "left";
  heightCm: number;
  careerStartYear: number;
  careerEndYear: number | null;
  preferredSurface: "hard" | "clay" | "grass";
  pageviews12m: number;
  rarity: Rarity;
  rarityScore: number;
  stats: Record<string, number>;
  bio: { fr: string; en: string };
}

const FIRST_M = [
  "Taviro",
  "Lucan",
  "Orvel",
  "Matteon",
  "Kasim",
  "Ennor",
  "Dario",
  "Felan",
  "Iskar",
  "Rodan",
  "Selvin",
  "Bastien",
  "Holvar",
  "Jurek",
  "Nilo",
];
const FIRST_F = [
  "Ilvana",
  "Marisol",
  "Teodra",
  "Kaelin",
  "Zorya",
  "Elsabeth",
  "Nadine",
  "Oriane",
  "Valka",
  "Sefa",
  "Liora",
  "Mireva",
  "Anouka",
  "Brisa",
  "Hanne",
];
const LAST_A = [
  "Mend",
  "Var",
  "Kesh",
  "Doran",
  "Tel",
  "Brun",
  "Sor",
  "Halv",
  "Quen",
  "Ostr",
  "Pell",
  "Vint",
  "Gar",
  "Lusk",
  "Corv",
];
const LAST_B = [
  "ask",
  "elli",
  "ovic",
  "ard",
  "enko",
  "ström",
  "ez",
  "ani",
  "ier",
  "ova",
  "sen",
  "aud",
  "ini",
  "ek",
  "os",
];
const COUNTRIES = [
  "FR",
  "ES",
  "US",
  "IT",
  "DE",
  "AU",
  "AR",
  "GB",
  "CH",
  "CZ",
  "JP",
  "CA",
  "BR",
  "PL",
  "HR",
  "GR",
  "NO",
  "SE",
  "NL",
  "BE",
];
const SURFACES = ["hard", "clay", "grass"] as const;

const RANK_RANGE: Record<Rarity, [number, number]> = {
  mythic: [1, 1],
  legendary: [1, 2],
  epic: [2, 10],
  rare: [8, 30],
  uncommon: [25, 80],
  common: [60, 300],
};
const PAGEVIEWS_RANGE: Record<Rarity, [number, number]> = {
  mythic: [2_000_000, 5_000_000],
  legendary: [500_000, 2_000_000],
  epic: [100_000, 500_000],
  rare: [30_000, 100_000],
  uncommon: [5_000, 30_000],
  common: [500, 5_000],
};
const SLAM_RANGE: Record<Rarity, [number, number]> = {
  mythic: [12, 24],
  legendary: [3, 10],
  epic: [0, 3],
  rare: [0, 1],
  uncommon: [0, 0],
  common: [0, 0],
};

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const MAJORS = [
  "australian_open",
  "roland_garros",
  "wimbledon",
  "us_open",
] as const;

/**
 * Splits Grand Slam titles across the four events. Separate PRNG so adding
 * these stats does not change the names and values drawn before.
 */
function majorTitles(slams: number, seed: number): Record<string, number> {
  const random = mulberry32(seed);
  const counts = Object.fromEntries(
    MAJORS.map((m) => [`${m}_titles`, 0]),
  ) as Record<string, number>;
  for (let i = 0; i < slams; i++) {
    counts[`${MAJORS[Math.floor(random() * MAJORS.length)]}_titles`] += 1;
  }
  return counts;
}

export function fictionalPlayers(count = 100, seed = 2027): FictionalPlayer[] {
  const random = mulberry32(seed);
  const int = (min: number, max: number) =>
    min + Math.floor(random() * (max - min + 1));
  const pick = <T>(list: readonly T[]) =>
    list[Math.floor(random() * list.length)];

  const sizes = tierSizes(count, rarityConfig.tiers_by_percentile);
  const tiers: Rarity[] = [...RARITIES]
    .reverse()
    .flatMap((r) => Array<Rarity>(sizes[r]).fill(r));
  const usedNames = new Set<string>();

  return tiers.map((rarity, index) => {
    const sex = random() < 0.5 ? "male" : "female";
    let name: string;
    do {
      name = `${pick(sex === "male" ? FIRST_M : FIRST_F)} ${pick(LAST_A)}${pick(LAST_B)}`;
    } while (usedNames.has(name));
    usedNames.add(name);

    const birthYear = int(1950, 2005);
    const careerStart = birthYear + int(16, 19);
    const ended = birthYear < 1992 || random() < 0.2;
    const careerEnd = ended ? Math.min(careerStart + int(8, 20), 2026) : null;
    const [rMin, rMax] = RANK_RANGE[rarity];
    const [sMin, sMax] = SLAM_RANGE[rarity];
    const slams = int(sMin, sMax);
    const wins = int(
      rarity === "common" ? 20 : 150,
      rarity === "mythic" ? 1200 : rarity === "common" ? 250 : 800,
    );
    const surface = pick(SURFACES);

    return {
      wikidataId: `Q999${String(index + 1).padStart(6, "0")}`,
      slug: `dev-${slugify(name)}`,
      name,
      sex,
      birthDate: `${birthYear}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
      countryCode: pick(COUNTRIES),
      hand: random() < 0.85 ? "right" : "left",
      heightCm: sex === "male" ? int(175, 205) : int(160, 190),
      careerStartYear: careerStart,
      careerEndYear: careerEnd,
      preferredSurface: surface,
      pageviews12m: int(...PAGEVIEWS_RANGE[rarity]),
      rarity,
      rarityScore: Math.round((100 - (index * 100) / count) * 100) / 100,
      stats: {
        best_rank: int(rMin, rMax),
        weeks_at_no1:
          rarity === "mythic"
            ? int(150, 320)
            : rarity === "legendary"
              ? int(20, 150)
              : 0,
        grand_slam_titles: slams,
        grand_slam_finals: slams + int(0, Math.max(1, Math.ceil(slams / 2))),
        titles: slams + int(0, rarity === "common" ? 1 : 40),
        match_wins: wins,
        match_losses: Math.round(wins * (0.25 + random() * 0.6)),
        ...majorTitles(slams, seed * 1000 + index),
      },
      bio: {
        fr: `${name} est un personnage fictif du jeu de données de développement. Spécialiste de la surface ${surface === "hard" ? "dure" : surface === "clay" ? "terre battue" : "gazon"}.`,
        en: `${name} is a fictional character from the development dataset. ${surface[0].toUpperCase()}${surface.slice(1)} court specialist.`,
      },
    };
  });
}
