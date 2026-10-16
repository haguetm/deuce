-- The card front (photo, name, flag, rarity) is public; only the back
-- (stats, bio, Wikipedia extracts) stays reserved to the card owner.
-- Photo credits (author, license, source) live on the same row as the photo,
-- so every publicly displayed photo can carry its credit.

drop policy "visible images for card owners" on public.player_images;

create policy "visible photos are public" on public.player_images
  for select to anon, authenticated using (
    (not hidden
     and exists (select 1 from public.players p
                 where p.id = player_images.player_id and p.in_catalog))
    or (select public.is_admin())
  );

grant select on public.player_images to anon;
