-- =========================================================
-- 0010_member_handle.sql
--
-- Lets the caller pick their own `handle` (nickname) when they create a
-- group (`create_group`) or accept an invite (`accept_invite`). Without
-- this, the user's seat row was always inserted with handle = null and
-- there was no UI surface to set one later — but the cafe UI renders
-- `@handle` everywhere.
--
-- Adds:
--   * public._normalize_handle(text)         — trim / lowercase / validate
--   * create_group(text, jsonb, text)        — adds p_handle (default null)
--   * accept_invite(text, text)              — adds p_handle (default null)
-- =========================================================

-- ---------- _normalize_handle ----------
-- Returns null when the input is empty after trimming, the normalized
-- handle (lowercased) when it matches the policy, or raises
-- `handle_invalid` (sqlstate P0001) otherwise so callers can surface a
-- specific error.

create or replace function public._normalize_handle(p_handle text) returns text
language plpgsql
immutable
as $$
declare
  v_handle text;
begin
  if p_handle is null then return null; end if;
  v_handle := lower(btrim(p_handle));
  if v_handle = '' then return null; end if;
  -- 2-24 chars: lowercase ascii letters, digits, underscore or dash.
  -- Must start with a letter or digit so handles stay scannable.
  if v_handle !~ '^[a-z0-9][a-z0-9_-]{1,23}$' then
    raise exception 'handle_invalid' using errcode = 'P0001';
  end if;
  return v_handle;
end $$;

-- ---------- create_group ----------
-- Drop the previous 2-arg overload so the new 3-arg version is
-- unambiguous to PostgREST. Default for p_handle keeps the older
-- 2-arg call sites working.

drop function if exists public.create_group(text, jsonb);

create or replace function public.create_group(
  p_name   text,
  p_ghosts jsonb default '[]'::jsonb,
  p_handle text default null
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
  v_handle    text;
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

  v_handle := public._normalize_handle(p_handle);

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

  insert into public.members (group_id, user_id, display_name, color, initials, handle)
    values (v_group_id, v_caller, v_name, v_color, v_initials, v_handle);

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
      public._normalize_handle(v_ghost->>'handle')
    );
  end loop;

  return v_group_id;
end $$;

revoke all on function public.create_group(text, jsonb, text) from public;
grant execute on function public.create_group(text, jsonb, text) to authenticated;

-- ---------- accept_invite ----------

drop function if exists public.accept_invite(text);

create or replace function public.accept_invite(
  p_code   text,
  p_handle text default null
)
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
  v_handle   text;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_handle := public._normalize_handle(p_handle);

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

  insert into public.members (group_id, user_id, display_name, color, initials, handle)
    values (v_group_id, v_caller, v_name, v_color, v_initials, v_handle);

  update public.invites
    set used_by = v_caller, used_at = now()
    where code = p_code;

  return v_group_id;
end $$;

revoke all on function public.accept_invite(text, text) from public;
grant execute on function public.accept_invite(text, text) to authenticated;
