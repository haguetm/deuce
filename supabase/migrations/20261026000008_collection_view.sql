-- Collection page: one call returns a filtered, paginated slice of the
-- catalogue with the caller's quantities, wishlist and graded copies.
-- Missing cards are listed too (card fronts are public), so the player sees
-- what is left to find.

create function public.get_collection(
  p_filter text default 'owned',          -- all | owned | missing | wished | duplicates
  p_rarity public.rarity_tier default null,
  p_country text default null,
  p_collection text default null,
  p_query text default null,
  p_offset integer default 0,
  p_limit integer default 48
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  q text := nullif(trim(p_query), '');
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_filter not in ('all', 'owned', 'missing', 'wished', 'duplicates') then
    raise exception 'invalid_filter' using errcode = 'P0001';
  end if;
  return (
    with mine as (
      select player_id, quantity from public.user_cards where user_id = uid
    ),
    graded as (
      select player_id, count(*)::integer as copies from public.graded_cards where user_id = uid group by player_id
    ),
    wished as (
      select player_id from public.wishlist where user_id = uid
    ),
    rows as (
      select p.id, p.name, coalesce(m.quantity, 0) as quantity,
             w.player_id is not null as wished, coalesce(g.copies, 0) as graded
      from public.players p
      left join mine m on m.player_id = p.id
      left join wished w on w.player_id = p.id
      left join graded g on g.player_id = p.id
      where p.in_catalog
        and (p_rarity is null or p.rarity_effective = p_rarity)
        and (p_country is null or p.country_code = upper(p_country))
        and (p_collection is null or p.id in (select private.collection_members(p_collection)))
        and (q is null or p.name ilike '%' || replace(replace(q, '%', ''), '_', '') || '%')
        and case p_filter
              when 'owned' then m.player_id is not null
              when 'missing' then m.player_id is null
              when 'wished' then w.player_id is not null
              when 'duplicates' then coalesce(m.quantity, 0) > 1
              else true end
    )
    select jsonb_build_object(
      'total', (select count(*) from rows),
      'cards', coalesce((
        select jsonb_agg(private.card_front_json(r.id)
                         || jsonb_build_object('quantity', r.quantity, 'wished', r.wished, 'graded', r.graded)
                         order by r.id)
        from (select * from rows order by id
              offset greatest(coalesce(p_offset, 0), 0)
              limit least(greatest(coalesce(p_limit, 48), 1), 96)) r
      ), '[]'::jsonb),
      'stats', jsonb_build_object(
        'distinct', (select count(*) from mine),
        'copies', (select coalesce(sum(quantity), 0) from mine),
        'catalog_size', public.catalog_size(),
        'showcase', (select to_jsonb(showcase) from public.profiles where id = uid))
    )
  );
end;
$$;

revoke execute on function public.get_collection(text, public.rarity_tier, text, text, text, integer, integer)
  from public, anon;
grant execute on function public.get_collection(text, public.rarity_tier, text, text, text, integer, integer)
  to authenticated;
