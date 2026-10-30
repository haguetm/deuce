-- Collection: sort orders, and the card back (statistics, biography, photo
-- credit) read in one call when a card is opened.

drop function public.get_collection(text, public.rarity_tier, text, text, text, integer, integer);

create function public.get_collection(
  p_filter text default 'owned',          -- all | owned | missing | wished | duplicates
  p_rarity public.rarity_tier default null,
  p_country text default null,
  p_collection text default null,
  p_query text default null,
  p_offset integer default 0,
  p_limit integer default 48,
  p_sort text default 'number'            -- number | rarity | name | youngest | oldest | country | recent
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
  if p_sort not in ('number', 'rarity', 'name', 'youngest', 'oldest', 'country', 'recent') then
    raise exception 'invalid_sort' using errcode = 'P0001';
  end if;
  return (
    with mine as (
      select player_id, quantity, last_obtained_at from public.user_cards where user_id = uid
    ),
    wished as (
      select player_id from public.wishlist where user_id = uid
    ),
    rows as (
      select p.id, p.name, p.rarity_effective, p.birth_date, p.country_code,
             coalesce(m.quantity, 0) as quantity, m.last_obtained_at,
             w.player_id is not null as wished
      from public.players p
      left join mine m on m.player_id = p.id
      left join wished w on w.player_id = p.id
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
    ),
    sorted as (
      select r.*, row_number() over (order by
        case when p_sort = 'rarity' then r.rarity_effective end desc,
        case when p_sort = 'name' then r.name end,
        case when p_sort = 'youngest' then r.birth_date end desc nulls last,
        case when p_sort = 'oldest' then r.birth_date end nulls last,
        case when p_sort = 'country' then r.country_code end nulls last,
        case when p_sort = 'recent' then r.last_obtained_at end desc nulls last,
        r.id) as pos
      from rows r
    )
    select jsonb_build_object(
      'total', (select count(*) from rows),
      'cards', coalesce((
        select jsonb_agg(private.card_front_json(s.id)
                         || jsonb_build_object('quantity', s.quantity, 'wished', s.wished)
                         order by s.pos)
        from (select * from sorted order by pos
              offset greatest(coalesce(p_offset, 0), 0)
              limit least(greatest(coalesce(p_limit, 48), 1), 96)) s
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

revoke execute on function public.get_collection(text, public.rarity_tier, text, text, text, integer, integer, text)
  from public, anon;
grant execute on function public.get_collection(text, public.rarity_tier, text, text, text, integer, integer, text)
  to authenticated;

-- Card back: the front, then for an owner only (the back is reserved,
-- docs/DECISIONS.md) the player's details, statistics with their source,
-- and the Wikipedia extracts with their links.
create function public.get_card_back(p_player_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  front jsonb := private.card_front_json(p_player_id);
  owned integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if front is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select quantity into owned from public.user_cards where user_id = uid and player_id = p_player_id;
  if owned is null then
    return front || jsonb_build_object('quantity', 0);
  end if;
  return front || (
    select jsonb_build_object(
      'quantity', owned,
      'sex', p.sex, 'birth_date', p.birth_date, 'hand', p.hand, 'height_cm', p.height_cm,
      'career_start_year', p.career_start_year, 'career_end_year', p.career_end_year,
      'preferred_surface', p.preferred_surface,
      'stats', coalesce((select jsonb_object_agg(s.key, coalesce(to_jsonb(s.value_num), to_jsonb(s.value_text)))
                         from public.player_stats s where s.player_id = p.id), '{}'::jsonb),
      'stats_source', (select jsonb_build_object('name', d.name, 'url', d.url, 'license', d.license,
                                                 'license_url', d.license_url)
                       from public.player_stats s join public.data_sources d on d.id = s.source_id
                       where s.player_id = p.id limit 1),
      'texts', coalesce((select jsonb_object_agg(t.lang, jsonb_build_object(
                           'extract', t.extract, 'article_url', t.article_url, 'license', t.license))
                         from public.player_texts t where t.player_id = p.id), '{}'::jsonb))
    from public.players p where p.id = p_player_id
  );
end;
$$;

revoke execute on function public.get_card_back(bigint) from public, anon;
grant execute on function public.get_card_back(bigint) to authenticated;
