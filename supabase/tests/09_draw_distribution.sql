-- Statistical checks of the draw on deterministic pseudo-random inputs
-- (reproducible, no flaky test). Chi-square thresholds at p = 0.001.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create temp table u as
  select i, private.rand_unit(extensions.digest(i::text, 'sha256'), 'test') as x
  from generate_series(1, 200000) i;

select ok((select min(x) >= 0 and max(x) < 1 from u), 'rand_unit stays in [0, 1)');

-- Standard slots: observed vs game_config.drop_rates (df = 5, critical 20.52)
create temp table standard as
  select private.draw_rarity(x, 'common') as tier from u;
create temp table expected as
  select key::public.rarity_tier as tier, value::numeric / 10000 as p
  from jsonb_each_text((select value from public.game_config where key = 'drop_rates'));

select cmp_ok(
  (select sum(power(coalesce(o.n, 0) - e.p * 200000, 2) / (e.p * 200000))
   from expected e left join (select tier, count(*) n from standard group by tier) o using (tier))::numeric,
  '<', 20.52, 'standard slots follow the published rates (chi-square)');

-- Guaranteed slot: no common, uncommon+ renormalized (df = 4, critical 18.47)
create temp table guaranteed as
  select private.draw_rarity(x, 'uncommon') as tier from u where i <= 100000;
select is_empty($$select 1 from guaranteed where tier = 'common'$$, 'guaranteed slot never draws a common');
select cmp_ok(
  (select sum(power(coalesce(o.n, 0) - e.p / (1 - (select p from expected where tier = 'common')) * 100000, 2)
              / (e.p / (1 - (select p from expected where tier = 'common')) * 100000))
   from expected e left join (select tier, count(*) n from guaranteed group by tier) o using (tier)
   where e.tier <> 'common')::numeric,
  '<', 18.47, 'guaranteed slot follows the renormalized rates (chi-square)');

-- Uniform pick inside a tier of 10 players (df = 9, critical 27.88)
insert into public.players (wikidata_id, slug, name, sex, rarity)
select 'Q' || (910000000 + g), 'uniform-' || g, 'Uniform ' || g, 'female', 'epic' from generate_series(1, 10) g;
create temp table picks as select private.pick_player('epic', x) as pid from u where i <= 50000;
select cmp_ok(
  (select sum(power(n - 5000, 2) / 5000.0) from (select count(*) n from picks group by pid) s)::numeric,
  '<', 27.88, 'cards are drawn uniformly inside a tier (chi-square)');
select is((select count(distinct pid)::int from picks), 10, 'every card of the tier can be drawn');

select * from finish();
rollback;
