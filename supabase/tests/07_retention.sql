-- Retention: audit log 3 years, takedown contact details 12 months after handling.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Audit rows: one expired, one recent
alter table public.admin_audit_log disable trigger admin_audit_log_append_only;
insert into public.admin_audit_log (at, actor_role, action, target_table, target_id) values
  (now() - interval '3 years 1 day', 'postgres', 'old.action', 't', '1'),
  (now() - interval '2 years', 'postgres', 'recent.action', 't', '2');
alter table public.admin_audit_log enable trigger admin_audit_log_append_only;

insert into public.takedown_requests (id, requester_name, requester_email, requester_role, reason, status, handled_at, dispute) values
  ('00000000-0000-0000-0000-00000000000a', 'Old', 'old@test.local', 'subject', 'Raison ancienne traitée.', 'accepted', now() - interval '13 months', false),
  ('00000000-0000-0000-0000-00000000000b', 'Dispute', 'd@test.local', 'subject', 'Raison en litige longue.', 'rejected', now() - interval '13 months', true),
  ('00000000-0000-0000-0000-00000000000c', 'Recent', 'r@test.local', 'subject', 'Raison récente traitée.', 'accepted', now() - interval '6 months', false),
  ('00000000-0000-0000-0000-00000000000d', 'Pending', 'p@test.local', 'subject', 'Raison encore en attente.', 'pending', null, false);

select throws_ok($$delete from public.admin_audit_log where action = 'old.action'$$, '42501', null,
  'expired audit rows cannot be deleted outside the purge');

select is(private.purge_expired_data(), '{"audit_deleted": 1, "takedowns_anonymized": 1}'::jsonb,
  'purge reports what it did');

select results_eq($$select action from public.admin_audit_log where action like '%.action' order by action$$,
  array['recent.action'], 'audit rows older than 3 years are deleted, recent ones kept');

select results_eq($$select requester_name is null and requester_email is null and reason is null and anonymized_at is not null
  from public.takedown_requests where id = '00000000-0000-0000-0000-00000000000a'$$, array[true],
  'handled request older than 12 months is anonymized');
select results_eq($$select status::text || ':' || requester_role from public.takedown_requests
  where id = '00000000-0000-0000-0000-00000000000a'$$, array['accepted:subject'], 'anonymized record is kept');
select results_eq($$select requester_email from public.takedown_requests where id = '00000000-0000-0000-0000-00000000000b'$$,
  array['d@test.local'], 'disputed request keeps its contact details');
select results_eq($$select requester_email from public.takedown_requests where id in
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d') order by requester_email$$,
  array['p@test.local', 'r@test.local'], 'recent and pending requests are untouched');

select results_eq($$select action from public.admin_audit_log where action = 'retention.purge'$$,
  array['retention.purge'], 'the purge itself is audited');

select throws_ok($$update public.takedown_requests set requester_email = null where id = '00000000-0000-0000-0000-00000000000c'$$,
  '23514', null, 'contact details cannot be removed without anonymizing the record');

select * from finish();
rollback;
