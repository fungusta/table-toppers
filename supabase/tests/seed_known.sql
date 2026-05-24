-- supabase/tests/seed_known.sql
-- Deterministic fixture for RPC tests. Not loaded by `supabase db reset`;
-- loaded explicitly by Layer-1 test setup.

insert into public.games (id, label, short) values
  ('catan',       'Catan',       'Catan'),
  ('carcassonne', 'Carcassonne', 'Carc.')
on conflict (id) do nothing;

insert into public.groups (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Group');

insert into public.members (id, group_id, display_name, handle, color, initials, joined_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Alice','a','#111111','AL','2026-01-01'),
  ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Bob',  'b','#222222','BO','2026-01-01'),
  ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Cara', 'c','#333333','CA','2026-01-01');

-- 6 matches; "today" in tests = 2026-05-23 (matches data.ts TODAY).
insert into public.matches (id, group_id, game_id, played_on, winner_member_id) values
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','catan',      '2026-05-20','bbbbbbbb-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','catan',      '2026-05-18','bbbbbbbb-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','catan',      '2026-05-10','bbbbbbbb-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','catan',      '2026-04-01','bbbbbbbb-0000-0000-0000-000000000003'),
  ('cccccccc-0000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','carcassonne','2026-05-15','bbbbbbbb-0000-0000-0000-000000000003'),
  ('cccccccc-0000-0000-0000-000000000006','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','carcassonne','2026-04-20','bbbbbbbb-0000-0000-0000-000000000002');

-- All 3 members played every match.
insert into public.match_players (match_id, member_id)
select m.id, mem.id
from public.matches m
cross join public.members mem
where m.group_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  and mem.group_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
