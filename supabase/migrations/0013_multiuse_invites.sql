-- =========================================================
-- 0013_multiuse_invites.sql
--
-- Makes invite codes multi-use. Previously `accept_invite` (added in
-- 0006, re-signed in 0010) rejected with `invite_used` after the first
-- successful accept and stamped `used_by` / `used_at` on the invites
-- row. The product now wants a single link to onboard an entire group
-- of friends, so any number of authenticated users may redeem the same
-- code until it expires.
--
-- This migration drops & recreates `accept_invite(text, text)` without
-- the single-use guard or the consumption UPDATE. Expiry and the
-- `already_member` short-circuit still apply.
--
-- The now-unused `used_by` / `used_at` columns (and the matching `used`
-- field on peek_invite) are removed in 0014.
-- =========================================================

-- ---------- accept_invite ----------

drop function if exists public.accept_invite(text, text);

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

  -- Lock the invite row so concurrent accepts see a consistent
  -- expiry snapshot. We no longer consume the row, but the lock keeps
  -- this RPC's read-then-write semantics tidy if it's ever extended.
  select i.group_id, i.expires_at
    into v_group_id, v_expires
  from public.invites i
  where i.code = p_code
  for update;

  if v_group_id is null then
    raise exception 'invite_not_found' using errcode = 'P0001';
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

  return v_group_id;
end $$;

revoke all on function public.accept_invite(text, text) from public;
grant execute on function public.accept_invite(text, text) to authenticated;
