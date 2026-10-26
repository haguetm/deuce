-- Collection page: filters, pagination, wishlist and graded copies.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'u1@test.local');
insert into public.players (wikidata_id, slug, name, sex, country_code, rarity)
select 'Q' || (970000000 + g), 'col-' || g, 'Col ' || g, 'male',
       case when g <= 5 then 'FR' else 'ES' end, case when g % 2 = 0 then 'rare' else 'common' end::public.rarity_tier
from generate_series(1, 10) g;
insert into public.user_cards (user_id, player_id, quantity)
select '11111111-1111-1111-1111-111111111111', id, case when slug = 'col-1' then 3 else 1 end
from public.players where slug in ('col-1', 'col-2', 'col-6');
insert into public.wishlist (user_id, player_id)
select '11111111-1111-1111-1111-111111111111', id from public.players where slug = 'col-3';

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((public.get_collection() ->> 'total')::int, 3, 'owned cards by default');
select is((public.get_collection('missing') ->> 'total')::int, 7, 'missing cards are listed');
select is((public.get_collection('wished') -> 'cards' -> 0 ->> 'slug'), 'col-3', 'wished cards');
select is((public.get_collection('duplicates') -> 'cards' -> 0 ->> 'quantity')::int, 3, 'duplicates with their quantity');
select is((public.get_collection('all', 'rare') ->> 'total')::int, 5, 'rarity filter');
select is((public.get_collection('all', null, 'fr') ->> 'total')::int, 5, 'country filter');
select is(jsonb_array_length(public.get_collection('all', null, null, null, null, 8, 4) -> 'cards'), 2, 'pagination');
select throws_ok($$select public.get_collection('nope')$$, 'P0001', 'invalid_filter', 'filters are validated');
reset role;

select * from finish();
rollback;
