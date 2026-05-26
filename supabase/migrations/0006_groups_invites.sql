-- =========================================================
-- 0006_groups_invites.sql
--
-- Multi-group write path: create_group, create_invite, peek_invite,
-- accept_invite. All four are security definer RPCs; no raw INSERT
-- RLS policies on groups / group_members / invites.
-- See docs/superpowers/specs/2026-05-25-groups-invites-design.md.
-- =========================================================

-- ---------- invites ----------

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  code        text not null unique,
  created_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz not null,
  used_by     uuid references auth.users(id) on delete set null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index invites_group_idx on public.invites (group_id, created_at desc);

alter table public.invites enable row level security;

-- Owners-only read. Codes are bearer tokens, never broadcast through a
-- general read policy. peek_invite() (security definer) returns just enough
-- info for the /join/[code] preview without needing this read access.
create policy invites_read on public.invites for select
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = invites.group_id
        and gm.user_id  = auth.uid()
        and gm.role     = 'owner'
    )
  );

-- ---------- is_group_owner helper ----------

create or replace function public.is_group_owner(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = g and user_id = auth.uid() and role = 'owner'
  )
$$;

-- ---------- create_group ----------
-- Atomic: groups + group_members(owner) + members(creator) + members(ghosts).
-- Returns the new group_id.

create or replace function public.create_group(
  p_name   text,
  p_ghosts jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller    uuid := auth.uid();
  v_group_id  uuid;
  v_name      text;
  v_color     text;
  v_initials  text;
  v_seen      text[];
  v_ghost     jsonb;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'group name is required';
  end if;

  if jsonb_typeof(p_ghosts) <> 'array' then
    raise exception 'p_ghosts must be a jsonb array';
  end if;

  -- Resolve caller's display props: existing members row -> auth metadata -> email.
  select m.display_name, m.color, m.initials
    into v_name, v_color, v_initials
  from public.members m
  where m.user_id = v_caller
  limit 1;

  if v_name is null then
    select coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1)),
           '#4a6b7a',
           upper(substring(coalesce(raw_user_meta_data->>'display_name', email), 1, 2))
      into v_name, v_color, v_initials
    from auth.users
    where id = v_caller;
  end if;

  insert into public.groups (name, created_by)
    values (btrim(p_name), v_caller)
    returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
    values (v_group_id, v_caller, 'owner');

  insert into public.members (group_id, user_id, display_name, color, initials)
    values (v_group_id, v_caller, v_name, v_color, v_initials);

  v_seen := array[lower(v_name)];

  for v_ghost in select * from jsonb_array_elements(p_ghosts) loop
    if jsonb_typeof(v_ghost) <> 'object' then
      raise exception 'each ghost must be a jsonb object';
    end if;
    if coalesce(btrim(v_ghost->>'display_name'), '') = ''
       or coalesce(btrim(v_ghost->>'color'), '') = ''
       or coalesce(btrim(v_ghost->>'initials'), '') = '' then
      raise exception 'ghost requires display_name, color, initials';
    end if;
    if lower(v_ghost->>'display_name') = any(v_seen) then
      raise exception 'duplicate display_name in roster: %', v_ghost->>'display_name';
    end if;
    v_seen := v_seen || lower(v_ghost->>'display_name');

    insert into public.members (group_id, user_id, display_name, color, initials, handle)
    values (
      v_group_id, null,
      btrim(v_ghost->>'display_name'),
      btrim(v_ghost->>'color'),
      btrim(v_ghost->>'initials'),
      nullif(btrim(v_ghost->>'handle'), '')
    );
  end loop;

  return v_group_id;
end $$;

revoke all on function public.create_group(text, jsonb) from public;
grant execute on function public.create_group(text, jsonb) to authenticated;

-- ---------- _gen_invite_code helper ----------
-- Crockford base32: 0-9 + A-Z minus I, L, O, U. 8 chars ~= 40 bits of entropy.

create or replace function public._gen_invite_code() returns text
language plpgsql
as $$
declare
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code     text := '';
  i        int;
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end $$;

-- ---------- create_invite ----------

create or replace function public.create_invite(
  p_group_id   uuid,
  p_ttl_hours  int default 168    -- 7 days
)
returns table(code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller   uuid := auth.uid();
  v_code     text;
  v_expires  timestamptz;
  v_attempt  int := 0;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not public.is_group_owner(p_group_id) then
    raise exception 'only owners may create invites' using errcode = '42501';
  end if;

  if p_ttl_hours is null or p_ttl_hours < 1 then p_ttl_hours := 168; end if;
  if p_ttl_hours > 720 then p_ttl_hours := 720; end if;  -- cap at 30 days

  v_expires := now() + make_interval(hours => p_ttl_hours);

  loop
    v_code := public._gen_invite_code();
    begin
      insert into public.invites (group_id, code, created_by, expires_at)
        values (p_group_id, v_code, v_caller, v_expires);
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt >= 5 then
        raise exception 'could not generate unique invite code after 5 attempts';
      end if;
    end;
  end loop;

  return query select v_code, v_expires;
end $$;

revoke all on function public.create_invite(uuid, int) from public;
grant execute on function public.create_invite(uuid, int) to authenticated;

-- ---------- peek_invite ----------
-- Minimal info for the /join/[code] preview; never reveals members or matches.

create or replace function public.peek_invite(p_code text)
returns table(group_id uuid, group_name text, expires_at timestamptz, used boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return query
    select i.group_id, g.name, i.expires_at, (i.used_at is not null)
    from public.invites i
    join public.groups  g on g.id = i.group_id
    where i.code = p_code
      and i.expires_at > now();
end $$;

revoke all on function public.peek_invite(text) from public;
grant execute on function public.peek_invite(text) to authenticated;

-- ---------- accept_invite ----------
-- Single transaction:
--   1. Lock invites row by code; abort on missing / used / expired.
--   2. Abort already_member (caller can redirect to /g/[id]/).
--   3. Insert group_members(member) + members(real seat).
--   4. Mark invite used.

create or replace function public.accept_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller   uuid := auth.uid();
  v_group_id uuid;
  v_used_at  timestamptz;
  v_expires  timestamptz;
  v_name     text;
  v_color    text;
  v_initials text;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select i.group_id, i.used_at, i.expires_at
    into v_group_id, v_used_at, v_expires
  from public.invites i
  where i.code = p_code
  for update;

  if v_group_id is null then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;
  if v_used_at is not null then
    raise exception 'invite_used' using errcode = 'P0001';
  end if;
  if v_expires <= now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = v_caller
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  -- Same fallback chain as create_group for display props.
  select m.display_name, m.color, m.initials
    into v_name, v_color, v_initials
  from public.members m
  where m.user_id = v_caller
  limit 1;

  if v_name is null then
    select coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1)),
           '#4a6b7a',
           upper(substring(coalesce(raw_user_meta_data->>'display_name', email), 1, 2))
      into v_name, v_color, v_initials
    from auth.users
    where id = v_caller;
  end if;

  insert into public.group_members (group_id, user_id, role)
    values (v_group_id, v_caller, 'member');

  insert into public.members (group_id, user_id, display_name, color, initials)
    values (v_group_id, v_caller, v_name, v_color, v_initials);

  update public.invites
    set used_by = v_caller, used_at = now()
    where code = p_code;

  return v_group_id;
end $$;

revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;
