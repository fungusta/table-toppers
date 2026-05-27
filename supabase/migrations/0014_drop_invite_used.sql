-- =========================================================
-- 0014_drop_invite_used.sql
--
-- Removes the now-vestigial single-use tracking columns from
-- `public.invites`. With invites turned multi-use in 0013,
-- `used_by` / `used_at` are never written by application code, and
-- the `used` boolean exposed by `peek_invite` is always false.
--
-- Drops:
--   * peek_invite(text)   — must drop first because its body refs `used_at`.
--   * invites.used_by, invites.used_at columns.
--
-- Recreates:
--   * peek_invite(text)   — same shape minus the trailing `used` column.
--
-- NOTE: regenerate `web/src/lib/supabase/database.types.ts` after this
-- migration is applied (e.g. `supabase gen types typescript ...`).
-- =========================================================

-- ---------- drop peek_invite (depends on used_at) ----------

drop function if exists public.peek_invite(text);

-- ---------- drop the single-use columns ----------

alter table public.invites
  drop column if exists used_by,
  drop column if exists used_at;

-- ---------- recreate peek_invite without `used` ----------

create or replace function public.peek_invite(p_code text)
returns table(group_id uuid, group_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return query
    select i.group_id, g.name, i.expires_at
    from public.invites i
    join public.groups  g on g.id = i.group_id
    where i.code = p_code
      and i.expires_at > now();
end $$;

revoke all on function public.peek_invite(text) from public;
grant execute on function public.peek_invite(text) to authenticated;
