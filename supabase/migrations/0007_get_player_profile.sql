-- =========================================================
-- 0007_get_player_profile.sql
--
-- Adds the `get_player_profile(p_member_id uuid)` RPC: returns a single
-- JSONB blob containing everything `PlayerProfileModal` needs to render —
-- hero stats, wins-by-game, fav game, last-10 W/L, head-to-head, recent
-- matches. Always all-time / pan-game; range and game filters are caller
-- concerns (the leaderboard's `range` / `tab` state does not propagate
-- into the profile).
--
-- `security invoker`: RLS on members / matches / match_players already
-- gates which rows the caller can see, so a caller who is not in the
-- target member's group naturally gets a null result. See spec
-- docs/superpowers/specs/2026-05-25-player-profile-rpc-design.md.
-- =========================================================

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
  -- RLS-gated lookup. If the caller cannot see this member (different
  -- group, anon, etc.), the row is invisible and we return null.
  select id, group_id, display_name, handle, color, initials, joined_at
    into v_member
  from public.members
  where id = p_member_id;

  if v_member.id is null then
    return null;
  end if;
  v_group_id := v_member.group_id;

  -- Streak: trailing wins, ordered by (played_on desc, id desc). Inlined
  -- here because `streak_for` (migration 0002) takes a game/cutoff filter
  -- we don't want for the profile.
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
    from (values ('catan'), ('carcassonne'), ('monopoly')) g(id)
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
