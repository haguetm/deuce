-- Extensions and shared enum types.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Rarity tiers, lowest to highest. Display names live in messages/*.json.
create type public.rarity_tier as enum (
  'common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'
);

create type public.player_sex as enum ('male', 'female');
create type public.playing_hand as enum ('right', 'left');
create type public.court_surface as enum ('hard', 'clay', 'grass', 'carpet');

-- How a booster was obtained. 'aces' = bought with in-game currency only.
create type public.booster_source as enum ('free', 'bonus', 'aces');

-- Every reason a ledger line can exist. Adding a reason requires a migration,
-- which keeps every currency entry point reviewable in one place.
create type public.ledger_reason as enum (
  'recycle',          -- duplicate recycled (credit)
  'booster_purchase', -- booster bought with aces (debit)
  'referral',         -- referral reward (credit)
  'achievement',      -- phase 2
  'quest',            -- phase 2
  'admin_adjustment'  -- manual correction, always audited
);

create type public.referral_status as enum ('pending', 'qualified', 'rewarded', 'rejected');
create type public.takedown_status as enum ('pending', 'accepted', 'rejected');
