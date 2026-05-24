-- 0002_get_standings.sql

-- Helper: trailing wins for a member, filtered by game and date range.
create or replace function public.streak_for(
  p_member_id uuid,
  p_group_id  uuid,
  p_game      text,
  p_cutoff    date
) returns int
language plpgsql stable security invoker
set search_path = public
as $$
declare
  r record;
  s int := 0;
begin
  for r in
    select (m.winner_member_id = p_member_id) as is_win
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.group_id = p_group_id
      and mp.member_id = p_member_id
      and (p_game = 'cafe' or m.game_id = p_game)
      and (p_cutoff is null or m.played_on >= p_cutoff)
    order by m.played_on desc, m.id desc
  loop
    if r.is_win then s := s + 1;
    else exit;
    end if;
  end loop;
  return s;
end $$;

-- Main RPC.
create or replace function public.get_standings(
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
  mono_wins     int,
  catan_played  int,
  carc_played   int,
  mono_played   int,
  fav_game      text
)
language plpgsql stable security invoker
set search_path = public
as $$
declare
  v_today  date := date '2026-05-23';
  v_cutoff date;
begin
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
      count(f.match_id) filter (where f.game_id = 'monopoly')::int                                    as mono_played,
      count(f.match_id) filter (where f.game_id = 'catan'       and f.winner_member_id = mem.id)::int as catan_wins,
      count(f.match_id) filter (where f.game_id = 'carcassonne' and f.winner_member_id = mem.id)::int as carc_wins,
      count(f.match_id) filter (where f.game_id = 'monopoly'    and f.winner_member_id = mem.id)::int as mono_wins
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
        from (values ('catan'),('carcassonne'),('monopoly')) v(g)
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
    pm.catan_wins, pm.carc_wins, pm.mono_wins,
    pm.catan_played, pm.carc_played, pm.mono_played,
    fav.fav_game
  from per_member pm
  join fav on fav.member_id = pm.member_id
  order by pm.wins desc,
           case when pm.played > 0 then pm.wins::numeric / pm.played else 0 end desc,
           pm.played asc;
end $$;
