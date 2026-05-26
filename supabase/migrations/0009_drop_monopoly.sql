-- =========================================================
-- 0009_drop_monopoly.sql
--
-- Removes Monopoly from the catalogue. The frontend no longer offers a
-- Monopoly tab and the seed file no longer inserts Monopoly fixtures.
-- This migration:
--   1. Cascades-deletes any persisted Monopoly matches (match_players
--      drops via the on-delete-cascade FK in 0001).
--   2. Removes the 'monopoly' row from public.games (deferred until
--      after matches are gone because matches.game_id has no on-delete).
--   3. Re-creates `get_standings` without `mono_wins` / `mono_played`
--      columns (return-shape change ⇒ requires DROP).
--   4. Replaces `get_player_profile` so the by_game helper enumerates
--      only ('catan'), ('carcassonne').
-- =========================================================

-- 1. Drop persisted Monopoly play data first (FK cascades to match_players).
delete from public.matches where game_id = 'monopoly';

-- 2. Drop the 'monopoly' game itself.
delete from public.games where id = 'monopoly';

-- 3. Recreate get_standings without monopoly columns. Return-shape change
--    forces a drop; CREATE OR REPLACE cannot rewrite columns of a SETOF
--    composite return type.
drop function if exists public.get_standings(uuid, text, text);

create function public.get_standings(
  p_group_id uuid,
  p_game     text,
  p_range    text
)
returns table (
  member_id     uuid,
  display_name  text,
  handle        text,
  color         text,
  initials      text,
  wins          int,
  played        int,
  win_rate      numeric,
  streak        int,
  catan_wins    int,
  carc_wins     int,
  catan_played  int,
  carc_played   int,
  fav_game      text
)
language plpgsql stable security invoker
set search_path = public
as $$
declare
  v_today  date;
  v_cutoff date;
begin
  select coalesce(max(m.played_on), current_date)
    into v_today
  from public.matches m
  where m.group_id = p_group_id;

  if p_range = 'week'      then v_cutoff := v_today - 7;
  elsif p_range = 'month'  then v_cutoff := v_today - 30;
  else                          v_cutoff := null;
  end if;

  return query
  with filt as (
    select m.id as match_id, m.game_id, m.played_on, m.winner_member_id, mp.member_id
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.group_id = p_group_id
      and (p_game = 'cafe' or m.game_id = p_game)
      and (v_cutoff is null or m.played_on >= v_cutoff)
  ),
  per_member as (
    select
      mem.id           as member_id,
      mem.display_name, mem.handle, mem.color, mem.initials,
      count(f.match_id)::int                                                                          as played,
      count(f.match_id) filter (where f.winner_member_id = mem.id)::int                               as wins,
      count(f.match_id) filter (where f.game_id = 'catan')::int                                       as catan_played,
      count(f.match_id) filter (where f.game_id = 'carcassonne')::int                                 as carc_played,
      count(f.match_id) filter (where f.game_id = 'catan'       and f.winner_member_id = mem.id)::int as catan_wins,
      count(f.match_id) filter (where f.game_id = 'carcassonne' and f.winner_member_id = mem.id)::int as carc_wins
    from public.members mem
    left join filt f on f.member_id = mem.id
    where mem.group_id = p_group_id
    group by mem.id
  ),
  fav as (
    select
      mem.id as member_id,
      coalesce((
        select v.g
        from (values ('catan'),('carcassonne')) v(g)
        order by (
          select count(*) from public.match_players mp2
          join public.matches m2 on m2.id = mp2.match_id
          where mp2.member_id = mem.id and m2.group_id = p_group_id and m2.game_id = v.g
        ) desc, v.g asc
        limit 1
      ), 'catan') as fav_game
    from public.members mem
    where mem.group_id = p_group_id
  )
  select
    pm.member_id, pm.display_name, pm.handle, pm.color, pm.initials,
    pm.wins, pm.played,
    case when pm.played > 0 then pm.wins::numeric / pm.played else 0::numeric end as win_rate,
    public.streak_for(pm.member_id, p_group_id, p_game, v_cutoff) as streak,
    pm.catan_wins, pm.carc_wins,
    pm.catan_played, pm.carc_played,
    fav.fav_game
  from per_member pm
  join fav on fav.member_id = pm.member_id
  order by pm.wins desc,
           case when pm.played > 0 then pm.wins::numeric / pm.played else 0 end desc,
           pm.played asc;
end $$;

-- 4. Replace get_player_profile so by_game enumerates only (catan, carcassonne).
create or replace function public.get_player_profile(p_member_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_member       record;
  v_group_id     uuid;
  v_streak       int := 0;
  v_streak_row   record;
  v_payload      jsonb;
begin
  select id, group_id, display_name, handle, color, initials, joined_at
    into v_member
  from public.members
  where id = p_member_id;

  if v_member.id is null then
    return null;
  end if;
  v_group_id := v_member.group_id;

  for v_streak_row in
    select (m.winner_member_id = p_member_id) as is_win
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.group_id = v_group_id
      and mp.member_id = p_member_id
    order by m.played_on desc, m.id desc
  loop
    if v_streak_row.is_win then
      v_streak := v_streak + 1;
    else
      exit;
    end if;
  end loop;

  with player_matches as (
    select m.id, m.game_id, m.played_on, m.winner_member_id,
           (m.winner_member_id = p_member_id) as is_win
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.group_id = v_group_id
      and mp.member_id = p_member_id
  ),
  hero as (
    select
      count(*)::int                                  as played,
      count(*) filter (where is_win)::int            as wins
    from player_matches
  ),
  by_game as (
    -- One row per real game id. Members with zero plays of a game still
    -- get a {wins:0, played:0} entry so the modal renders a uniform bar.
    select
      g.id as game_id,
      count(pm.id) filter (where pm.game_id = g.id)::int                    as played,
      count(pm.id) filter (where pm.game_id = g.id and pm.is_win)::int      as wins
    from (values ('catan'), ('carcassonne')) g(id)
    left join player_matches pm on true
    group by g.id
  ),
  fav as (
    select
      coalesce(
        (select bg.game_id
         from by_game bg
         order by bg.played desc, bg.game_id asc
         limit 1),
        'catan'
      ) as game_id
  ),
  last_10 as (
    select pm.is_win as won, pm.game_id, pm.played_on
    from player_matches pm
    order by pm.played_on desc, pm.id desc
    limit 10
  ),
  head_to_head as (
    select
      mp2.member_id as opponent_member_id,
      count(*)::int                                                                         as played,
      count(*) filter (where pm.is_win)::int                                                as a_wins,
      count(*) filter (where pm.winner_member_id = mp2.member_id)::int                      as b_wins
    from player_matches pm
    join public.match_players mp2 on mp2.match_id = pm.id and mp2.member_id <> p_member_id
    group by mp2.member_id
  ),
  recent_matches as (
    select pm.id as match_id, pm.game_id, pm.played_on, pm.is_win as won,
      (
        select coalesce(array_agg(mp3.member_id), array[]::uuid[])
        from public.match_players mp3
        where mp3.match_id = pm.id and mp3.member_id <> p_member_id
      ) as opponent_member_ids
    from player_matches pm
    order by pm.played_on desc, pm.id desc
    limit 8
  )
  select jsonb_build_object(
    'member', jsonb_build_object(
      'id', v_member.id,
      'group_id', v_member.group_id,
      'display_name', v_member.display_name,
      'handle', v_member.handle,
      'color', v_member.color,
      'initials', v_member.initials,
      'joined_at', v_member.joined_at
    ),
    'hero', (
      select jsonb_build_object(
        'wins', h.wins, 'played', h.played, 'streak', v_streak
      ) from hero h
    ),
    'by_game', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'game_id', bg.game_id, 'wins', bg.wins, 'played', bg.played
       ) order by bg.game_id) from by_game bg),
      '[]'::jsonb
    ),
    'fav_game', (select fav.game_id from fav),
    'last_10', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'won', l.won, 'game_id', l.game_id, 'played_on', l.played_on
       )) from last_10 l),
      '[]'::jsonb
    ),
    'head_to_head', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'opponent_member_id', h2h.opponent_member_id,
         'a_wins', h2h.a_wins,
         'b_wins', h2h.b_wins,
         'played', h2h.played
       ) order by h2h.played desc, h2h.opponent_member_id asc) from head_to_head h2h),
      '[]'::jsonb
    ),
    'recent', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'match_id', r.match_id,
         'game_id', r.game_id,
         'played_on', r.played_on,
         'won', r.won,
         'opponent_member_ids', to_jsonb(r.opponent_member_ids)
       )) from recent_matches r),
      '[]'::jsonb
    )
  )
  into v_payload;

  return v_payload;
end $$;

revoke all on function public.get_player_profile(uuid) from public;
grant execute on function public.get_player_profile(uuid) to authenticated;
