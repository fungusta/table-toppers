-- =========================================================
-- 0011_member_invites.sql
--
-- Lets ANY group member create invites (and list existing ones), not
-- just owners. Two changes:
--
--   1. `create_invite` now checks `is_group_member` instead of
--      `is_group_owner`.
--   2. The `invites_read` RLS policy is broadened from owner-only to
--      any group member so the InviteManager UI can render the full
--      list of codes for non-owners too.
--
-- `is_group_owner` (from 0006) is left in place — it's still useful
-- for future destructive ops (rename / delete group, remove member).
-- =========================================================

-- ---------- is_group_member helper ----------

create or replace function public.is_group_member(g uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = g and user_id = auth.uid()
  )
$$;

revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

-- ---------- create_invite ----------
-- Drop & recreate so the new gate is unambiguous. Signature is
-- unchanged so existing callers (web/src/app/actions/create-invite.ts)
-- keep working without modification.

drop function if exists public.create_invite(uuid, int);

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

  if not public.is_group_member(p_group_id) then
    raise exception 'only group members may create invites' using errcode = '42501';
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

-- ---------- invites RLS read policy ----------
-- Any member of the group (not just owners) can list its invite codes.
-- Codes are still bearer tokens; we only widen who in the group can
-- see them, not external visibility.

drop policy if exists invites_read on public.invites;

create policy invites_read on public.invites for select
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = invites.group_id
        and gm.user_id  = auth.uid()
    )
  );
