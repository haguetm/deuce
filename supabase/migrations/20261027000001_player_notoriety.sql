-- Rarity inputs from Wikidata, written by the pipeline: the number of
-- Wikipedia editions with an article on the player (lasting notoriety, next
-- to the 12-month pageviews) and induction into the International Tennis Hall
-- of Fame (achievements before 1968, which the Sackmann statistics barely
-- cover).
alter table public.players
  add column sitelinks smallint check (sitelinks >= 0),
  add column hall_of_fame boolean not null default false;
