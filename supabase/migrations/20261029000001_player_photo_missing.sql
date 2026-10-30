-- A card without a photo has no interest: the pipeline takes the player out
-- of the catalogue and sets this flag, then puts them back (and clears it)
-- once a free photo is found. Manual exclusions never have the flag, so the
-- pipeline never brings them back.
alter table public.players
  add column photo_missing boolean not null default false;
