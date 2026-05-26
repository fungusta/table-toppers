-- =========================================================
-- 0004_match_writes.sql
--
-- Adds the write path for matches:
--   1. INSERT RLS policies on `matches` and `match_players` (defense-in-depth
--      for direct-insert clients like a future iOS app, even though the
--      `record_match` RPC below bypasses RLS via `security definer`).
--   2. `record_match(group, game, date, winner, members[])` RPC: atomic
--      two-table insert in a single transaction, with explicit checks for
--      group membership, winner-in-roster, and member-in-group.
--
-- The companion server action lives at web/src/app/actions/record-match.ts.
-- =========================================================

-- ---------- INSERT policies ----------
-- These let an authenticated user insert directly into a group they belong
-- to. The RPC below sidesteps these (security definer), but having them in
-- place means iOS / direct-supabase-js writers don't need an RPC of their own
-- once their client matures.

create policy matches_insert on public.matches for insert
  with check (public.is_group_member(group_id));

create policy mp_insert on public.match_players for insert
  with check (
    exists (
      select 1
      from public.matches m
      where m.id = match_players.match_id
        and public.is_group_member(m.group_id)
    )
  );

-- ---------- record_match RPC ----------
create or replace function public.record_match(
  p_group_id          uuid,
  p_game_id           text,
  p_played_on         date,
  p_winner_member_id  uuid,
  p_member_ids        uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller   uuid := auth.uid();
  v_match_id uuid;
  v_count    int;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_caller
  ) then
    raise exception 'caller is not a member of group %', p_group_id
      using errcode = '42501';
  end if;

  if p_member_ids is null or array_length(p_member_ids, 1) is null
       or array_length(p_member_ids, 1) < 2 then
    raise exception 'at least 2 players are required';
  end if;

  if p_winner_member_id is null
       or not (p_winner_member_id = any (p_member_ids)) then
    raise exception 'winner must be one of the listed players';
  end if;

  -- Reject duplicate member ids in the array.
  select count(distinct mid) into v_count
  from unnest(p_member_ids) as mid;
  if v_count <> array_length(p_member_ids, 1) then
    raise exception 'duplicate player in member list';
  end if;

  -- Every member id must belong to the target group.
  select count(*) into v_count
  from public.members
  where id = any (p_member_ids) and group_id = p_group_id;
  if v_count <> array_length(p_member_ids, 1) then
    raise exception 'all players must belong to group %', p_group_id;
  end if;

  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'unknown game %', p_game_id;
  end if;

  insert into public.matches (group_id, game_id, played_on, winner_member_id, created_by)
  values (p_group_id, p_game_id, p_played_on, p_winner_member_id, v_caller)
  returning id into v_match_id;

  insert into public.match_players (match_id, member_id)
  select v_match_id, mid from unnest(p_member_ids) as mid;

  return v_match_id;
end $$;

revoke all on function public.record_match(uuid, text, date, uuid, uuid[]) from public;
grant execute on function public.record_match(uuid, text, date, uuid, uuid[]) to authenticated;
