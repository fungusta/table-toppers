-- =========================================================
-- 0012_create_group_color.sql
--
-- Lets the caller pick their own `color` when they create a group,
-- alongside the existing handle pick from 0010. Without this, the
-- creator's members row always inherited either their previous
-- members.color (across groups) or the hard-coded default `#4a6b7a`
-- — there was no UI surface to override at create time, and the
-- new-group form now exposes a color swatch for the creator.
--
-- Adds a fourth optional parameter `p_color` (default null). When
-- non-null and non-empty after trim, it overrides the fallback
-- color used in the creator's `members` insert. Ghost members are
-- unaffected — their colors are still taken from each ghost object.
-- =========================================================

-- Drop the previous 3-arg overload so the new 4-arg version is
-- unambiguous to PostgREST.

drop function if exists public.create_group(text, jsonb, text);

create or replace function public.create_group(
  p_name   text,
  p_ghosts jsonb default '[]'::jsonb,
  p_handle text default null,
  p_color  text default null
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
  v_pick_color text;
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

  -- Normalize caller-picked color: null / blank -> ignore.
  v_pick_color := nullif(btrim(coalesce(p_color, '')), '');

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

  -- Caller-provided color wins over the fallback chain.
  if v_pick_color is not null then
    v_color := v_pick_color;
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

revoke all on function public.create_group(text, jsonb, text, text) from public;
grant execute on function public.create_group(text, jsonb, text, text) to authenticated;
