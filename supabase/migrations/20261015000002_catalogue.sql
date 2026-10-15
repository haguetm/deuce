-- Card catalogue: players and their imported data, written only by the
-- pipeline (service role). Clients read through RLS policies.

create table public.data_sources (
  id text primary key,                 -- e.g. 'sackmann_atp'
  name text not null,
  url text not null,
  license text not null,               -- e.g. 'CC BY-NC-SA 4.0'
  license_url text not null,
  commercial_use_allowed boolean not null -- false = must be replaced before any monetization
);

create table public.players (
  id bigint generated always as identity primary key,
  wikidata_id text not null unique check (wikidata_id ~ '^Q[0-9]+$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  sex public.player_sex not null,
  birth_date date,
  country_code char(2) check (country_code ~ '^[A-Z]{2}$'), -- ISO 3166-1 alpha-2, sporting nationality
  hand public.playing_hand,
  height_cm smallint check (height_cm between 120 and 230),
  turned_pro smallint check (turned_pro between 1850 and 2100),
  career_start_year smallint,
  career_end_year smallint,            -- null = active
  preferred_surface public.court_surface,
  frwiki_title text,
  enwiki_title text,
  pageviews_12m integer check (pageviews_12m >= 0),
  rarity_score numeric(8, 4),
  rarity public.rarity_tier not null default 'common',   -- computed by the pipeline
  rarity_override public.rarity_tier,                     -- manual correction (SQL), audited
  rarity_effective public.rarity_tier
    generated always as (coalesce(rarity_override, rarity)) stored,
  in_catalog boolean not null default true,               -- false = never drawn, page hidden
  updated_at timestamptz not null default now()
);

create index players_rarity_idx on public.players (rarity_effective) where in_catalog;
create index players_country_idx on public.players (country_code) where in_catalog;
create index players_name_trgm_idx on public.players using gin (name extensions.gin_trgm_ops);

create table public.player_stats (
  player_id bigint not null references public.players (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]+$'),       -- e.g. 'grand_slam_titles'
  value_num numeric,
  value_text text,
  source_id text not null references public.data_sources (id),
  source_url text,                                        -- exact file or page used
  imported_at timestamptz not null default now(),
  primary key (player_id, key),
  check (value_num is not null or value_text is not null)
);

create index player_stats_source_idx on public.player_stats (source_id);

create table public.player_images (
  id bigint generated always as identity primary key,
  player_id bigint not null references public.players (id) on delete cascade,
  commons_file text not null,             -- 'File:Example.jpg'
  storage_path text not null,             -- key in R2 or Supabase Storage
  width smallint,
  height smallint,
  author text not null,
  license text not null,
  license_url text not null,
  source_url text not null,               -- Commons file page
  imported_at timestamptz not null default now(),
  is_primary boolean not null default true,
  hidden boolean not null default false,  -- true = silhouette shown instead
  hidden_at timestamptz,
  hidden_reason text,
  unique (player_id, commons_file)
);

create unique index player_images_one_primary_idx
  on public.player_images (player_id) where is_primary;

create table public.player_texts (
  player_id bigint not null references public.players (id) on delete cascade,
  lang text not null check (lang in ('fr', 'en')),
  extract text not null,
  article_url text not null,
  license text not null default 'CC BY-SA 4.0',
  revision_id bigint,                     -- Wikipedia revision used, for attribution history
  imported_at timestamptz not null default now(),
  primary key (player_id, lang)
);
