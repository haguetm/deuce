-- The draw seed is never readable by clients, before or after the opening.
-- It is generated inside open_booster() (gen_random_bytes, 32 bytes) and only
-- the database owner can read it to audit an opening.

revoke select on public.booster_openings from authenticated;
grant select (id, user_id, opened_at, source, edition, request_id)
  on public.booster_openings to authenticated;
