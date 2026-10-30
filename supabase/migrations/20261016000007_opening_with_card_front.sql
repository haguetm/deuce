-- Opening results carry what the reveal needs to draw each card front:
-- the visible primary photo with its credit (or nothing: silhouette).

create or replace function private.opening_json(p_opening uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'opening_id', o.id,
    'opened_at', o.opened_at,
    'source', o.source,
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slot', c.slot, 'player_id', c.player_id, 'slug', p.slug, 'name', p.name,
               'country_code', p.country_code, 'rarity', c.rarity, 'was_new', c.was_new,
               'image', (select jsonb_build_object(
                           'path', i.storage_path, 'width', i.width, 'height', i.height,
                           'author', i.author, 'license', i.license,
                           'license_url', i.license_url, 'source_url', i.source_url)
                         from public.player_images i
                         where i.player_id = p.id and i.is_primary and not i.hidden))
             order by c.slot)
      from public.booster_opening_cards c
      join public.players p on p.id = c.player_id
      where c.opening_id = o.id), '[]'::jsonb)
  )
  from public.booster_openings o
  where o.id = p_opening;
$$;
revoke execute on function private.opening_json(uuid) from public, anon, authenticated;
