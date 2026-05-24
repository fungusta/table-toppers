-- =========================================================
-- 0001_init.sql — Table Topper schema, RLS, helper function
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- tables ----------

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.members (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  display_name  text not null,
  handle        text,
  color         text not null,
  initials      text not null,
  joined_at     date not null default current_date,
  created_at    timestamptz not null default now()
);
create unique index members_group_user_unique
  on public.members (group_id, user_id) where user_id is not null;

create table public.games (
  id     text primary key,
  label  text not null,
  short  text not null
);

create table public.matches (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.groups(id) on delete cascade,
  game_id           text not null references public.games(id),
  played_on         date not null,
  winner_member_id  uuid references public.members(id) on delete set null,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index matches_group_played_idx on public.matches (group_id, played_on desc);

create table public.match_players (
  match_id   uuid not null references public.matches(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  primary key (match_id, member_id)
);
create index match_players_member_idx on public.match_players (member_id);

-- ---------- helper ----------

create or replace function public.is_group_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = g and user_id = auth.uid()
  )
$$;

-- ---------- RLS ----------

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.members       enable row level security;
alter table public.games         enable row level security;
alter table public.matches       enable row level security;
alter table public.match_players enable row level security;

create policy groups_read on public.groups for select
  using (public.is_group_member(id));

create policy gm_read on public.group_members for select
  using (public.is_group_member(group_id));

create policy members_read on public.members for select
  using (public.is_group_member(group_id));

create policy matches_read on public.matches for select
  using (public.is_group_member(group_id));

create policy mp_read on public.match_players for select
  using (exists (
    select 1 from public.matches m
    where m.id = match_players.match_id
      and public.is_group_member(m.group_id)
  ));

create policy games_read on public.games for select
  using (auth.role() = 'authenticated');
