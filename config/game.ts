/**
 * Public game parameters. Single source of truth for the booster loop and the
 * currency sinks; copied into the database (public.game_config) by
 * `pnpm config:generate`, which writes supabase/seed-game-config.sql.
 *
 * Drop rates are public by design (transparency page). Provisional values,
 * to tune with scripts/simulate-economy.ts.
 */

export const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
] as const;
export type Rarity = (typeof RARITIES)[number];

/** Probabilities in basis points (1/100 of a percent). Must sum to 10,000. */
export type RarityTable = Record<Rarity, number>;

/**
 * Card pool filter, evaluated in SQL (private.in_pool). Every key is optional;
 * an empty pool is the whole catalogue. A pool never changes the rarity odds:
 * when a pool has no card of the drawn rarity, the card comes from the whole
 * catalogue instead.
 */
export interface CardPool {
  sex?: "male" | "female";
  hand?: "right" | "left";
  country?: string;
  surface?: "hard" | "clay" | "grass" | "carpet";
  /** Career ended strictly before this year. */
  careerEndBefore?: number;
  /** Born on today's day and month (Paris time). */
  birthday?: boolean;
  /** Born in [bornFrom, bornTo] (years, inclusive). */
  bornFrom?: number;
  bornTo?: number;
}

/** Daily booster theme: `key` names the theme in messages (dailyThemes.*). */
export interface DailyTheme {
  key: string;
  pool: CardPool;
}

/** Calendar theme, active between two "MM-DD" dates inclusive (Paris time). */
export interface CalendarTheme extends DailyTheme {
  from: string;
  to: string;
}

export interface QuestDefinition {
  key: string;
  /** What is counted, see private.quest_progress(). */
  metric:
    | "boosters_opened"
    | "rare_or_better"
    | "left_handed"
    | "new_cards"
    | "daily_booster"
    | "recycled"
    | "wishlist"
    | "username"
    | "showcase";
  target: number;
  reward: number;
}

export interface AchievementDefinition {
  key: string;
  metric:
    | "boosters_opened"
    | "distinct_cards"
    | "has_rarity_legendary"
    | "has_rarity_mythic"
    | "collection_complete"
    | "career_slam"
    | "albums_complete";
  target: number;
  reward: number;
  /** For collection_complete: the collection key in `collections`. */
  collection?: string;
}

/**
 * Hand-picked albums. Membership is public (it only says a player belongs to
 * the album, never the underlying statistic). `slugs` lists players
 * explicitly; `stat` selects every player whose statistic reaches `min`.
 */
export interface CollectionDefinition {
  key: string;
  slugs?: string[];
  stat?: { key: string; min?: number; max?: number };
}

export const gameConfig = {
  booster: {
    refillMinutes: 15,
    maxStock: 10,
    cardsPerBooster: 5,
    /** Last slot draws only from this rarity or better. */
    guaranteedSlotMinRarity: "uncommon" as Rarity,
  },

  /** Rarity draw table for every slot (the guaranteed slot renormalizes it). */
  dropRates: {
    common: 5500,
    uncommon: 2700,
    rare: 1200,
    epic: 450,
    legendary: 130,
    mythic: 20,
  } satisfies RarityTable,

  /**
   * Golden booster: any booster has `chanceBp` basis points of being golden;
   * after `pityAt - 1` boosters in a row without one, the next is golden for
   * sure. The counter restarts at every golden booster. A golden booster's
   * last slot draws from `minRarity` or better.
   */
  goldenBooster: {
    chanceBp: 300,
    pityAt: 30,
    minRarity: "rare" as Rarity,
  },

  /**
   * Top-rarity guarantee: the `pityAt`-th booster in a row without a mythic
   * card gets one in its last slot. Natural odds are unchanged otherwise.
   */
  mythicPity: {
    pityAt: 300,
  },

  /** Aces earned for each recycled duplicate copy. */
  recycleValues: {
    common: 1,
    uncommon: 3,
    rare: 8,
    epic: 25,
    legendary: 80,
    mythic: 400,
  } satisfies RarityTable,

  /** Bulk recycling never touches this rarity or better unless asked. */
  recycle: {
    bulkMaxRarity: "rare" as Rarity,
  },

  /** In-game currency sink: aces -> bonus booster. Never real money. */
  acesBooster: {
    price: 100,
    dailyCap: 3,
  },

  /** Other formats bought with aces only. Never real money. */
  shop: {
    /** 20 cards, one of them epic or better. */
    box: {
      price: 450,
      cards: 20,
      guaranteedSlotMinRarity: "epic" as Rarity,
      weeklyCap: 1,
    },
    /** 3 cards among the lesser-known players (rare at most). */
    qualifiers: {
      price: 40,
      cards: 3,
      maxRarity: "rare" as Rarity,
      dailyCap: 3,
    },
  },

  /** Free once a day (Paris time), on top of the stock, themed. */
  dailyBooster: {
    cards: 5,
    guaranteedSlotMinRarity: "rare" as Rarity,
  },

  /**
   * Free booster pools the player can choose from. They all use the same
   * stock and the same odds; only the players drawn change.
   */
  pools: {
    all: {},
    men: { sex: "male" },
    women: { sex: "female" },
    legends: { careerEndBefore: 1990 },
  } satisfies Record<string, CardPool>,

  /** Daily booster theme: a calendar theme when one is active, else rotation. */
  dailyThemes: {
    calendar: [
      {
        key: "australianOpen",
        from: "01-12",
        to: "02-01",
        pool: { country: "AU" },
      },
      {
        key: "claySeason",
        from: "04-06",
        to: "05-23",
        pool: { surface: "clay" },
      },
      {
        key: "rolandGarros",
        from: "05-24",
        to: "06-07",
        pool: { country: "FR" },
      },
      {
        key: "grassSeason",
        from: "06-08",
        to: "06-28",
        pool: { surface: "grass" },
      },
      { key: "wimbledon", from: "06-29", to: "07-12", pool: { country: "GB" } },
      { key: "usOpen", from: "08-30", to: "09-13", pool: { country: "US" } },
    ] satisfies CalendarTheme[],
    rotation: [
      { key: "lefties", pool: { hand: "left" } },
      { key: "birthdays", pool: { birthday: true } },
      { key: "legends", pool: { careerEndBefore: 1990 } },
      { key: "nineties", pool: { bornFrom: 1970, bornTo: 1979 } },
      { key: "women", pool: { sex: "female" } },
      { key: "clayCourters", pool: { surface: "clay" } },
      { key: "nextGen", pool: { bornFrom: 1998, bornTo: 2010 } },
    ] satisfies DailyTheme[],
  },

  /** 7-day login streak (Paris days). One missed day tolerated per week. */
  loginStreak: {
    rewards: [5, 5, 10, 10, 15, 15, 25],
    /** Extra bonus boosters on the last day of the streak. */
    lastDayBoosters: 1,
    gracePerWeek: 1,
  },

  /** Daily missions: 3 drawn each day from this list. */
  dailyQuests: {
    perDay: 3,
    /** Bonus boosters when the day's missions are all claimed. */
    allClaimedBoosters: 1,
    pool: [
      { key: "open3", metric: "boosters_opened", target: 3, reward: 10 },
      { key: "open8", metric: "boosters_opened", target: 8, reward: 15 },
      { key: "rare1", metric: "rare_or_better", target: 1, reward: 10 },
      { key: "rare3", metric: "rare_or_better", target: 3, reward: 15 },
      { key: "lefty", metric: "left_handed", target: 1, reward: 10 },
      { key: "new5", metric: "new_cards", target: 5, reward: 10 },
      { key: "daily", metric: "daily_booster", target: 1, reward: 10 },
    ] satisfies QuestDefinition[],
  },

  /** One-time onboarding missions ("first steps"), a rewarded tutorial. */
  welcomeQuests: [
    { key: "firstBooster", metric: "boosters_opened", target: 1, reward: 10 },
    { key: "recycle", metric: "recycled", target: 1, reward: 10 },
    { key: "wishlist", metric: "wishlist", target: 3, reward: 10 },
    { key: "username", metric: "username", target: 1, reward: 15 },
    { key: "showcase", metric: "showcase", target: 1, reward: 10 },
  ] satisfies QuestDefinition[],
  /** Bonus boosters when every welcome quest is claimed. */
  welcomeAllClaimedBoosters: 2,

  achievements: [
    { key: "firstServe", metric: "boosters_opened", target: 1, reward: 5 },
    { key: "loveGame", metric: "boosters_opened", target: 10, reward: 10 },
    { key: "tieBreak", metric: "boosters_opened", target: 100, reward: 40 },
    { key: "fiveSets", metric: "boosters_opened", target: 1000, reward: 200 },
    {
      key: "goOutside",
      metric: "boosters_opened",
      target: 10000,
      reward: 1000,
    },
    { key: "collector50", metric: "distinct_cards", target: 50, reward: 20 },
    { key: "collector250", metric: "distinct_cards", target: 250, reward: 75 },
    {
      key: "collector1000",
      metric: "distinct_cards",
      target: 1000,
      reward: 300,
    },
    { key: "firstSlam", metric: "has_rarity_legendary", target: 1, reward: 30 },
    { key: "goldenSlam", metric: "has_rarity_mythic", target: 1, reward: 100 },
    {
      key: "bigThree",
      metric: "collection_complete",
      target: 1,
      reward: 150,
      collection: "bigThree",
    },
    { key: "careerSlam", metric: "career_slam", target: 1, reward: 100 },
    { key: "album1", metric: "albums_complete", target: 1, reward: 50 },
    { key: "album10", metric: "albums_complete", target: 10, reward: 300 },
  ] satisfies AchievementDefinition[],

  /** Hand-picked albums shown next to the nation albums. */
  collections: [
    {
      key: "bigThree",
      slugs: ["roger-federer", "rafael-nadal", "novak-djokovic"],
    },
    {
      key: "rolandGarrosChampions",
      stat: { key: "roland_garros_titles", min: 1 },
    },
    { key: "worldNumberOnes", stat: { key: "best_rank", max: 1 } },
    { key: "grandSlamChampions", stat: { key: "grand_slam_titles", min: 1 } },
  ] satisfies CollectionDefinition[],

  /**
   * Referral rewards are public (players must know what they earn); the
   * qualification thresholds and anti-abuse settings are private
   * (private.settings, see docs/DECISIONS.md).
   */
  referral: {
    referrerBoosters: 3,
    refereeBoosters: 3,
    /** Extra rewards when the referrer reaches N qualified referrals. */
    milestones: [
      { referrals: 5, boosters: 2, badge: "recruiter" },
      { referrals: 10, boosters: 3, badge: null },
      { referrals: 20, boosters: 5, badge: "ambassador" },
    ],
  },

  /** Boosters an anonymous (not yet linked) account can open. */
  anonymousTrial: {
    boosters: 2,
    /** Unlinked anonymous accounts are deleted after this many idle days. */
    purgeAfterDays: 30,
  },

  /**
   * Grading: a copy gets a final grade after a delay, paid in aces by rarity.
   * Weights in basis points, grade 6 to 10.
   */
  grading: {
    durationHours: 24,
    maxConcurrent: 3,
    fees: {
      common: 40,
      uncommon: 80,
      rare: 150,
      epic: 300,
      legendary: 600,
      mythic: 1000,
    } satisfies RarityTable,
    gradeWeights: { 6: 1500, 7: 3000, 8: 3300, 9: 1900, 10: 300 },
  },

  /** Big pulls feed: rarities shown and how far back. */
  feed: {
    minRarity: "legendary" as Rarity,
    hours: 24,
  },

  /** Profile showcase size. */
  showcaseSize: 5,
} as const;

export type GameConfig = typeof gameConfig;
export type PoolKey = keyof GameConfig["pools"];

/** Rows written to public.game_config (snake_case keys, JSON values). */
export function gameConfigRows(config: GameConfig = gameConfig) {
  return {
    booster: {
      refill_minutes: config.booster.refillMinutes,
      max_stock: config.booster.maxStock,
      cards_per_booster: config.booster.cardsPerBooster,
      guaranteed_slot_min_rarity: config.booster.guaranteedSlotMinRarity,
    },
    drop_rates: config.dropRates,
    golden_booster: {
      chance_bp: config.goldenBooster.chanceBp,
      pity_at: config.goldenBooster.pityAt,
      min_rarity: config.goldenBooster.minRarity,
    },
    mythic_pity: { pity_at: config.mythicPity.pityAt },
    recycle_values: config.recycleValues,
    recycle: { bulk_max_rarity: config.recycle.bulkMaxRarity },
    aces_booster: {
      price: config.acesBooster.price,
      daily_cap: config.acesBooster.dailyCap,
    },
    shop: {
      box: {
        price: config.shop.box.price,
        cards: config.shop.box.cards,
        guaranteed_slot_min_rarity: config.shop.box.guaranteedSlotMinRarity,
        weekly_cap: config.shop.box.weeklyCap,
      },
      qualifiers: {
        price: config.shop.qualifiers.price,
        cards: config.shop.qualifiers.cards,
        max_rarity: config.shop.qualifiers.maxRarity,
        daily_cap: config.shop.qualifiers.dailyCap,
      },
    },
    daily_booster: {
      cards: config.dailyBooster.cards,
      guaranteed_slot_min_rarity: config.dailyBooster.guaranteedSlotMinRarity,
    },
    pools: Object.fromEntries(
      Object.entries(config.pools).map(([key, pool]) => [key, poolRow(pool)]),
    ),
    daily_themes: {
      calendar: config.dailyThemes.calendar.map((t) => ({
        key: t.key,
        from: t.from,
        to: t.to,
        pool: poolRow(t.pool),
      })),
      rotation: config.dailyThemes.rotation.map((t) => ({
        key: t.key,
        pool: poolRow(t.pool),
      })),
    },
    login_streak: {
      rewards: config.loginStreak.rewards,
      last_day_boosters: config.loginStreak.lastDayBoosters,
      grace_per_week: config.loginStreak.gracePerWeek,
    },
    daily_quests: {
      per_day: config.dailyQuests.perDay,
      all_claimed_boosters: config.dailyQuests.allClaimedBoosters,
      pool: config.dailyQuests.pool,
    },
    welcome_quests: {
      quests: config.welcomeQuests,
      all_claimed_boosters: config.welcomeAllClaimedBoosters,
    },
    achievements: config.achievements,
    collections: config.collections,
    referral: {
      referrer_boosters: config.referral.referrerBoosters,
      referee_boosters: config.referral.refereeBoosters,
      milestones: config.referral.milestones,
    },
    anonymous_trial: {
      boosters: config.anonymousTrial.boosters,
      purge_after_days: config.anonymousTrial.purgeAfterDays,
    },
    grading: {
      duration_hours: config.grading.durationHours,
      max_concurrent: config.grading.maxConcurrent,
      fees: config.grading.fees,
      grade_weights: config.grading.gradeWeights,
    },
    feed: { min_rarity: config.feed.minRarity, hours: config.feed.hours },
    showcase_size: config.showcaseSize,
  };
}

/** Pool filter as stored in game_config (snake_case keys). */
function poolRow(pool: CardPool) {
  return {
    ...(pool.sex && { sex: pool.sex }),
    ...(pool.hand && { hand: pool.hand }),
    ...(pool.country && { country: pool.country }),
    ...(pool.surface && { surface: pool.surface }),
    ...(pool.careerEndBefore !== undefined && {
      career_end_before: pool.careerEndBefore,
    }),
    ...(pool.birthday && { birthday: true }),
    ...(pool.bornFrom !== undefined && { born_from: pool.bornFrom }),
    ...(pool.bornTo !== undefined && { born_to: pool.bornTo }),
  };
}
