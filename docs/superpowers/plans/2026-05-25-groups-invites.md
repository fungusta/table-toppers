# Groups + Invites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship multi-group UX — users create groups, invite others via short-lived single-use codes, switch between groups they belong to. Routes restructure from `/` to `/g/[group_id]/`. Seed group stays as dev fixture (production stripping deferred to item 4 in `NEXT.md`).

**Architecture:** New `invites` table + four `security definer` RPCs (`create_group`, `create_invite`, `peek_invite`, `accept_invite`), same pattern as `record_match` (`supabase/migrations/0004_match_writes.sql`). No raw INSERT RLS policies. App Router refactored so `/g/[group_id]/` is the new leaderboard root; `/` becomes a thin redirector to the user's most recent group (or `/groups/new` if they have none). Auth flow extended with a `?next=` round-trip so the `/join/[code]` redirect-to-signup loop works.

**Tech Stack:** Next.js 15 App Router (React 18), TypeScript, `@supabase/ssr`, Supabase CLI (Docker), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-25-groups-invites-design.md`. Read it before starting.

**Working directory:** Most commands run from `web/`. Supabase CLI commands run from repo root.

**File map**

| Path | Created/Modified | Responsibility |
|---|---|---|
| `supabase/migrations/0006_groups_invites.sql` | Created | `invites` table, RLS read policy, `is_group_owner`, four RPCs + grants |
| `supabase/tests/seed_known.sql` | Modified | Ensure fixture user is `owner` so owner-only RPC tests have a caller |
| `web/src/lib/supabase/database.types.ts` | Regenerated | Picks up new table + RPC signatures |
| `web/src/app/page.tsx` | Rewritten | Redirector to `/g/<default>/` or `/groups/new` |
| `web/src/app/g/[group_id]/page.tsx` | Created | Current leaderboard logic, parameterized on `group_id` |
| `web/src/app/g/[group_id]/manage/page.tsx` | Created | Owner-only invite list + create |
| `web/src/app/groups/new/page.tsx` | Created | Create-group form + `CreateGroupForm` island |
| `web/src/app/join/[code]/page.tsx` | Created | Accept-invite page; redirects unauthed to `/signup?next=…` |
| `web/src/app/actions/create-group.ts` | Created | Server Action wrapping `create_group` RPC |
| `web/src/app/actions/create-invite.ts` | Created | Server Action wrapping `create_invite` RPC |
| `web/src/app/actions/accept-invite.ts` | Created | Server Action wrapping `accept_invite` RPC |
| `web/src/app/signin/{page,actions}.ts(x)` | Modified | Honor `?next=` with leading-slash guard |
| `web/src/app/signup/{page,actions}.ts(x)` | Modified | Honor `?next=` with leading-slash guard |
| `web/src/lib/supabase/middleware.ts` | Modified | Allowlist `/join/*` |
| `web/src/components/HomeClient.tsx` | Modified | Accept `groupName`, `groupRole`, `groups` props |
| `web/src/components/TopBar.tsx` | Modified | Brand becomes group-driven; new `GroupSwitcher` dropdown |
| `web/src/components/CreateGroupForm.tsx` | Created | Client island: add/remove ghost-member rows |
| `web/src/components/InviteManager.tsx` | Created | Client island: list invites + create button + copy URL |
| `web/src/components/AcceptInviteCard.tsx` | Created | Client island: accept button + pending state |
| `web/src/lib/next-redirect.ts` | Created | `safeNext(raw): string` helper |
| `web/tests/rpc/groups_invites.test.ts` | Created | Layer 1 — RPC correctness |
| `web/tests/rls/group_isolation.test.ts` | Modified | Layer 2 — invite-visibility cases |
| `web/tests/e2e/groups_invites.spec.ts` | Created | Layer 3 — create + invite + accept; switcher |
| `CLAUDE.md` | Modified | Project-status sentence about groups+invites |
| `docs/superpowers/NEXT.md` | Modified | Move item 1 to Recently Shipped |

**Commit cadence:** every task ends with a commit (`feat(groups):`, `feat(invites):`, `refactor(routes):`, etc.).

**Pre-flight:** `supabase start` running; `web/.env.local` + `.env.test` populated. Run `npm run test` once from `web/` to confirm baseline is green.

---

## Phase 1 — Database

### Task 1: Migration 0006 — table, helper, RPCs

**Files:** Create `supabase/migrations/0006_groups_invites.sql`.

- [ ] **Step 1: Header + invites table + RLS read policy.**

```sql
-- =========================================================
-- 0006_groups_invites.sql
--
-- Multi-group write path: create_group, create_invite, peek_invite,
-- accept_invite. All four are security definer RPCs; no raw INSERT
-- RLS policies on groups / group_members / invites.
-- See docs/superpowers/specs/2026-05-25-groups-invites-design.md.
-- =========================================================

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

-- Owners-only read. Codes are bearer tokens, never broadcast.
create policy invites_read on public.invites for select
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = invites.group_id
        and gm.user_id  = auth.uid()
        and gm.role     = 'owner'
    )
  );
```

- [ ] **Step 2: `is_group_owner` helper.**

```sql
create or replace function public.is_group_owner(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = g and user_id = auth.uid() and role = 'owner'
  )
$$;
```

- [ ] **Step 3: `create_group` RPC.**

```sql
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

  -- Resolve caller's display props: existing members row → auth metadata → email.
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
```

- [ ] **Step 4: `create_invite` RPC (+ Crockford base32 generator).**

```sql
-- Crockford base32: 0-9 + A-Z minus I, L, O, U.
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

create or replace function public.create_invite(
  p_group_id   uuid,
  p_ttl_hours  int default 168
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
  if p_ttl_hours > 720 then p_ttl_hours := 720; end if;

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
```

- [ ] **Step 5: `peek_invite` RPC.**

```sql
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
```

- [ ] **Step 6: `accept_invite` RPC.**

```sql
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

  if v_group_id is null then raise exception 'invite_not_found' using errcode = 'P0001'; end if;
  if v_used_at is not null then raise exception 'invite_used' using errcode = 'P0001'; end if;
  if v_expires <= now() then raise exception 'invite_expired' using errcode = 'P0001'; end if;

  if exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = v_caller
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

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
```

- [ ] **Step 7: Apply + smoke.**

```bash
# from repo root
supabase db reset
```
Expected: `Finished supabase db reset` with no errors.

In Studio SQL editor:
```sql
select proname from pg_proc
where proname in ('create_group','create_invite','peek_invite','accept_invite','is_group_owner');
```
Expected: 5 rows.

- [ ] **Step 8: Commit.**

```bash
git add supabase/migrations/0006_groups_invites.sql
git commit -m "feat(db): invites table + create_group/create_invite/peek_invite/accept_invite RPCs"
```

---

### Task 2: Make fixture user an owner

**Files:** Modify `supabase/tests/seed_known.sql`.

- [ ] **Step 1:** Read current `seed_known.sql`; identify the fixture user's `group_members.role`. If it's `'member'`, change to `'owner'`. (Existing `get_standings` tests don't depend on role.)

- [ ] **Step 2:** Re-run existing test to confirm no regression:
```bash
cd web && npm run test -- tests/rpc/get_standings.test.ts
```
Expected: green.

- [ ] **Step 3: Commit.**
```bash
git add supabase/tests/seed_known.sql
git commit -m "test(db): fixture user is owner so invite RPC tests have an owner caller"
```

---

### Task 3: Regenerate database types

- [ ] **Step 1:** `cd web && npm run db:types`. Expected: diff shows new `invites` row + four RPC signatures + `is_group_owner`.

- [ ] **Step 2:** `npx tsc --noEmit`. Expected: zero errors.

- [ ] **Step 3: Commit.**
```bash
git add web/src/lib/supabase/database.types.ts
git commit -m "chore(types): regenerate after 0006_groups_invites"
```

---

### Task 4: Layer 1 RPC tests

**Files:** Create `web/tests/rpc/groups_invites.test.ts`.

- [ ] **Step 1: Scaffold.** Mirror `web/tests/rpc/get_standings.test.ts` env loading + admin client. Add a `signUpUser(email)` helper that: (a) creates user via `admin.auth.admin.createUser`, (b) returns an anon client signed in via `signInWithPassword`, (c) cleans up the auto-created seed-group membership (same pattern as `web/tests/rls/group_isolation.test.ts`).

- [ ] **Step 2: Tests.**

```ts
describe('create_group', () => {
  test('happy path returns uuid + creator row + ghost rows', async () => {
    const { user, client } = await signUpUser('og1@example.com');
    const { data: gid, error } = await client.rpc('create_group', {
      p_name: 'TG',
      p_ghosts: [{ display_name: 'Ghost', color: '#abc', initials: 'GH' }],
    });
    expect(error).toBeNull();
    expect(gid).toMatch(/^[0-9a-f-]{36}$/);

    const { data: gm } = await admin.from('group_members')
      .select('role').eq('group_id', gid).eq('user_id', user.id).single();
    expect(gm?.role).toBe('owner');

    const { count } = await admin.from('members')
      .select('*', { count: 'exact', head: true }).eq('group_id', gid);
    expect(count).toBe(2);
  });

  test('rejects blank name', async () => {
    const { client } = await signUpUser('og2@example.com');
    const { error } = await client.rpc('create_group', { p_name: '   ', p_ghosts: [] });
    expect(error?.message).toMatch(/group name is required/);
  });

  test('rejects duplicate ghost display_name (case-insensitive)', async () => {
    const { client } = await signUpUser('og3@example.com');
    const { error } = await client.rpc('create_group', {
      p_name: 'Dups',
      p_ghosts: [
        { display_name: 'Alex', color: '#111', initials: 'AL' },
        { display_name: 'alex', color: '#222', initials: 'AL' },
      ],
    });
    expect(error?.message).toMatch(/duplicate/i);
  });
});

describe('create_invite', () => {
  test('owner creates invite; row matches Crockford alphabet, ~7d ttl', async () => {
    const { client } = await signUpUser('iv1@example.com');
    const { data: gid } = await client.rpc('create_group', { p_name: 'G', p_ghosts: [] });
    const { data, error } = await client.rpc('create_invite', { p_group_id: gid });
    expect(error).toBeNull();
    expect(data![0].code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    const ttl = new Date(data![0].expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(6.5 * 86_400_000);
    expect(ttl).toBeLessThan(7.5 * 86_400_000);
  });

  test('non-owner is rejected', async () => {
    const { client: oc } = await signUpUser('iv2-owner@example.com');
    const { data: gid } = await oc.rpc('create_group', { p_name: 'G', p_ghosts: [] });
    const { client: mc, user: mu } = await signUpUser('iv2-member@example.com');
    await admin.from('group_members').insert({ group_id: gid, user_id: mu.id, role: 'member' });
    const { error } = await mc.rpc('create_invite', { p_group_id: gid });
    expect(error?.message).toMatch(/only owners/);
  });

  test('non-member is rejected', async () => {
    const { client } = await signUpUser('iv3@example.com');
    const { error } = await client.rpc('create_invite',
      { p_group_id: '00000000-0000-0000-0000-000000000000' });
    expect(error?.message).toMatch(/only owners/);
  });
});

describe('peek_invite', () => {
  test('valid → group info; expired → empty; unknown → empty', async () => {
    const { client } = await signUpUser('pk@example.com');
    const { data: gid } = await client.rpc('create_group', { p_name: 'Peekable', p_ghosts: [] });
    const { data: inv } = await client.rpc('create_invite', { p_group_id: gid });

    const { data: ok } = await client.rpc('peek_invite', { p_code: inv![0].code });
    expect(ok![0].group_name).toBe('Peekable');
    expect(ok![0].used).toBe(false);

    await admin.from('invites')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('code', inv![0].code);
    const { data: exp } = await client.rpc('peek_invite', { p_code: inv![0].code });
    expect(exp?.length ?? 0).toBe(0);

    const { data: unk } = await client.rpc('peek_invite', { p_code: 'ZZZZZZZZ' });
    expect(unk?.length ?? 0).toBe(0);
  });
});

describe('accept_invite', () => {
  test('happy: joiner gets group_members + members rows; invite marked used', async () => {
    const { client: oc } = await signUpUser('ai1-owner@example.com');
    const { data: gid } = await oc.rpc('create_group', { p_name: 'JM', p_ghosts: [] });
    const { data: inv } = await oc.rpc('create_invite', { p_group_id: gid });

    const { client: jc, user: ju } = await signUpUser('ai1-joiner@example.com');
    const { data: joined, error } = await jc.rpc('accept_invite', { p_code: inv![0].code });
    expect(error).toBeNull();
    expect(joined).toBe(gid);

    const { data: gm } = await admin.from('group_members')
      .select('role').eq('group_id', gid).eq('user_id', ju.id).single();
    expect(gm?.role).toBe('member');

    const { data: used } = await admin.from('invites')
      .select('used_by, used_at').eq('code', inv![0].code).single();
    expect(used?.used_by).toBe(ju.id);
    expect(used?.used_at).not.toBeNull();
  });

  test('rejects already-used / expired / unknown / already-member with distinct messages', async () => {
    // Cover each via dedicated setups; assert error.message contains
    // 'invite_used' / 'invite_expired' / 'invite_not_found' / 'already_member'.
  });
});
```

- [ ] **Step 3:** `cd web && npm run test -- tests/rpc/groups_invites.test.ts`. Expected: green.

- [ ] **Step 4: Commit.**
```bash
git add web/tests/rpc/groups_invites.test.ts
git commit -m "test(rpc): cover create_group, create_invite, peek_invite, accept_invite"
```

---

## Phase 2 — Auth `?next=` plumbing

### Task 5: Honor `next` on signin/signup

**Files:** Create `web/src/lib/next-redirect.ts`. Modify `web/src/app/signin/{page,actions}.ts(x)`, `web/src/app/signup/{page,actions}.ts(x)`.

- [ ] **Step 1: Helper.**

```ts
// web/src/lib/next-redirect.ts
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  return raw;
}
```

- [ ] **Step 2: `signin/page.tsx` + `signup/page.tsx`.**

Read `searchParams.next`; render as hidden `<input name="next">`; thread through the cross-link href (`/signup?next=…` / `/signin?next=…`).

- [ ] **Step 3: `signin/actions.ts` + `signup/actions.ts`.**

```ts
import { safeNext } from '@/lib/next-redirect';
// ...after auth success:
const next = safeNext(formData.get('next') as string | null);
redirect(next);
```

- [ ] **Step 4: Smoke.** `/signin?next=/groups/new` → sign in → land on `/groups/new` (404 OK until Task 11).

- [ ] **Step 5: Commit.**
```bash
git add web/src/lib/next-redirect.ts web/src/app/signin web/src/app/signup
git commit -m "feat(auth): honor ?next= with leading-slash guard"
```

---

## Phase 3 — Route restructure

### Task 6: New `/g/[group_id]/page.tsx`

**Files:** Create `web/src/app/g/[group_id]/page.tsx`.

- [ ] **Step 1:** Lift current `web/src/app/page.tsx` body; parameterize on `group_id` from `params`. Replace the arbitrary `.limit(1).single()` with a membership-scoped fetch:

```tsx
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { HomeClient } from '@/components/HomeClient';
import type { Match, Player, RealGameId } from '@/data/data';

export default async function GroupHome({
  params,
}: { params: Promise<{ group_id: string }> }) {
  const { group_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=/g/${group_id}/`);

  const { data: gm } = await supabase
    .from('group_members')
    .select('role, groups(name)')
    .eq('group_id', group_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!gm) notFound();

  const [{ data: memberRows }, { data: matchRows }, { data: matchPlayerRows }, { data: groupsList }] =
    await Promise.all([
      supabase.from('members')
        .select('id, display_name, handle, color, initials, joined_at')
        .eq('group_id', group_id),
      supabase.from('matches')
        .select('id, game_id, played_on, winner_member_id')
        .eq('group_id', group_id)
        .order('played_on', { ascending: false }),
      supabase.from('match_players')
        .select('match_id, member_id, matches!inner(group_id)')
        .eq('matches.group_id', group_id),
      supabase.from('group_members')
        .select('group_id, groups!inner(id, name)')
        .eq('user_id', user.id),
    ]);

  const players: Player[] = (memberRows ?? []).map(m => ({
    id: m.id, name: m.display_name, handle: m.handle ?? '',
    color: m.color, initials: m.initials, joined: m.joined_at,
  }));

  const participantsByMatch = new Map<string, string[]>();
  for (const row of matchPlayerRows ?? []) {
    const arr = participantsByMatch.get(row.match_id) ?? [];
    arr.push(row.member_id);
    participantsByMatch.set(row.match_id, arr);
  }
  const matches: Match[] = (matchRows ?? []).map(m => ({
    id: m.id, game: m.game_id as RealGameId, date: m.played_on,
    players: participantsByMatch.get(m.id) ?? [],
    winner: m.winner_member_id ?? '',
  }));

  const groups = (groupsList ?? []).map(row => ({
    id: (row as any).groups.id as string,
    name: (row as any).groups.name as string,
  }));

  return (
    <HomeClient
      groupId={group_id}
      groupName={(gm as any).groups.name}
      groupRole={gm.role as 'owner' | 'member'}
      groups={groups}
      players={players}
      initialMatches={matches}
    />
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` will complain about `HomeClient` not accepting the new props — fixed in Task 8.

- [ ] **Step 3: Commit.**
```bash
git add web/src/app/g
git commit -m "refactor(routes): add /g/[group_id]/ leaderboard route"
```

---

### Task 7: `/` becomes a redirector

**Files:** Rewrite `web/src/app/page.tsx`.

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: gm } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!gm) redirect('/groups/new');
  redirect(`/g/${gm.group_id}/`);
}
```

- [ ] **Step:** Commit.
```bash
git add web/src/app/page.tsx
git commit -m "refactor(routes): make / a redirector to /g/[default-group]/"
```

---

### Task 8: Extend `HomeClient` + `TopBar` props

**Files:** Modify `web/src/components/HomeClient.tsx`, `web/src/components/TopBar.tsx`.

- [ ] **Step 1: `HomeClientProps` adds:**
```ts
groupName: string;
groupRole: 'owner' | 'member';
groups: { id: string; name: string }[];
```
Pass them through to `<TopBar>`.

- [ ] **Step 2: `TopBarProps` adds the same three.** Replace `topbar-brand-name` hardcoded string with `{groupName}`. (Group-switcher dropdown comes in Task 16.)

- [ ] **Step 3:** `cd web && npx tsc --noEmit && npm run build`. Expected: zero errors.

- [ ] **Step 4: Commit.**
```bash
git add web/src/components/HomeClient.tsx web/src/components/TopBar.tsx
git commit -m "feat(ui): thread group props through HomeClient + TopBar"
```

---

### Task 9: Middleware allowlist for `/join/*`

**Files:** Modify `web/src/lib/supabase/middleware.ts`.

- [ ] **Step 1:** In the auth-gate branch, allow `/join/*` alongside `/signin`, `/signup`, `/auth/*`:

```ts
const PUBLIC_PATHS = ['/signin', '/signup', '/auth'];
const isPublic =
  PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
  pathname.startsWith('/join/');
if (!user && !isPublic) {
  return NextResponse.redirect(new URL('/signin', request.url));
}
```

- [ ] **Step 2: Smoke.** Incognito → `/join/ABCD1234` → page renders (404-on-invite-not-found is fine; no redirect to `/signin`).

- [ ] **Step 3: Commit.**
```bash
git add web/src/lib/supabase/middleware.ts
git commit -m "feat(middleware): allow unauthed access to /join/[code]"
```

---

## Phase 4 — Create group

### Task 10: `createGroup` Server Action

**Files:** Create `web/src/app/actions/create-group.ts`.

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export interface GhostInput {
  display_name: string;
  color: string;
  initials: string;
  handle?: string;
}
export interface CreateGroupInput { name: string; ghosts: GhostInput[] }
export type CreateGroupResult =
  | { ok: true; groupId: string }
  | { ok: false; error: string };

export async function createGroup(input: CreateGroupInput): Promise<CreateGroupResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not authenticated' };
  if (!input.name.trim()) return { ok: false, error: 'group name is required' };

  const { data, error } = await supabase.rpc('create_group', {
    p_name: input.name,
    p_ghosts: input.ghosts as any,
  });
  if (error) return { ok: false, error: error.message };
  if (typeof data !== 'string') return { ok: false, error: 'unexpected RPC response' };

  revalidatePath('/');
  return { ok: true, groupId: data };
}
```

- [ ] **Commit.**
```bash
git add web/src/app/actions/create-group.ts
git commit -m "feat(actions): createGroup wrapping create_group RPC"
```

---

### Task 11: `/groups/new` page + `CreateGroupForm`

**Files:** Create `web/src/components/CreateGroupForm.tsx`, `web/src/app/groups/new/page.tsx`.

- [ ] **Step 1: `CreateGroupForm.tsx`** (client island; local state for ghost rows; on submit calls `createGroup`, on ok pushes to `/g/<new>/`). Match the pattern of existing modals (see `web/src/components/Modals.tsx`) for input styling; plain CSS, no new design system. Include "+ Add player" / "×" row controls; auto-derive initials from display_name if blank.

- [ ] **Step 2: `page.tsx`** (server):
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CreateGroupForm } from '@/components/CreateGroupForm';

export default async function NewGroupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin?next=/groups/new');

  return (
    <main style={{ maxWidth: 480, margin: '4rem auto', fontFamily: 'system-ui' }}>
      <h1>Create a group</h1>
      <CreateGroupForm />
    </main>
  );
}
```

- [ ] **Step 3: Smoke.** Sign in → `/groups/new` → name + 2 ghosts → submit → land on `/g/<new-id>/` with creator + 2 ghosts visible.

- [ ] **Step 4: Commit.**
```bash
git add web/src/app/groups web/src/components/CreateGroupForm.tsx
git commit -m "feat(groups): /groups/new + CreateGroupForm with inline ghost rows"
```

---

## Phase 5 — Create invites

### Task 12: `createInvite` Server Action

**Files:** Create `web/src/app/actions/create-invite.ts`.

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export interface CreateInviteInput { groupId: string; ttlHours?: number }
export type CreateInviteResult =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; error: string };

export async function createInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not authenticated' };

  const { data, error } = await supabase.rpc('create_invite', {
    p_group_id:  input.groupId,
    p_ttl_hours: input.ttlHours ?? 168,
  });
  if (error) return { ok: false, error: error.message };
  if (!data || !data[0]) return { ok: false, error: 'unexpected RPC response' };

  revalidatePath(`/g/${input.groupId}/manage`);
  return { ok: true, code: data[0].code, expiresAt: data[0].expires_at };
}
```

- [ ] **Commit.**
```bash
git add web/src/app/actions/create-invite.ts
git commit -m "feat(actions): createInvite wrapping create_invite RPC"
```

---

### Task 13: `/g/[group_id]/manage` page + `InviteManager`

**Files:** Create `web/src/app/g/[group_id]/manage/page.tsx`, `web/src/components/InviteManager.tsx`.

- [ ] **Step 1: Server page** (owner-gated, lists members + invites, hosts `<InviteManager>`).

- [ ] **Step 2: `InviteManager.tsx`** — client island holding the invite list in local state, "+ Create invite" button calls `createInvite`, prepends row, exposes "Copy link" per active invite. Status badge per row: `active` / `used` / `expired`.

- [ ] **Step 3: Smoke.** As owner (the user who created a new group) → `/g/<gid>/manage` → create invite → click "Copy link" → URL is `/join/<CODE>`. As member of a different group → same path returns 404.

- [ ] **Step 4: Commit.**
```bash
git add web/src/app/g/[group_id]/manage web/src/components/InviteManager.tsx
git commit -m "feat(invites): owner-only /g/[group_id]/manage with InviteManager"
```

---

## Phase 6 — Accept invites

### Task 14: `acceptInvite` Server Action

**Files:** Create `web/src/app/actions/accept-invite.ts`.

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const SENTINELS = ['invite_not_found','invite_used','invite_expired','already_member'] as const;
type Sentinel = typeof SENTINELS[number];

export interface AcceptInviteInput { code: string }
export type AcceptInviteResult =
  | { ok: true; groupId: string }
  | { ok: false; error: Sentinel | 'not_authenticated' | string };

export async function acceptInvite(input: AcceptInviteInput): Promise<AcceptInviteResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

  const { data, error } = await supabase.rpc('accept_invite', { p_code: input.code });
  if (error) {
    const matched = SENTINELS.find(s => error.message.includes(s));
    return { ok: false, error: matched ?? error.message };
  }
  if (typeof data !== 'string') return { ok: false, error: 'unexpected RPC response' };

  revalidatePath('/');
  return { ok: true, groupId: data };
}
```

- [ ] **Commit.**
```bash
git add web/src/app/actions/accept-invite.ts
git commit -m "feat(actions): acceptInvite wrapping accept_invite RPC"
```

---

### Task 15: `/join/[code]` page + `AcceptInviteCard`

**Files:** Create `web/src/app/join/[code]/page.tsx`, `web/src/components/AcceptInviteCard.tsx`.

- [ ] **Step 1: Server page.** If unauthed → `redirect('/signup?next=/join/' + code)`. Else call `peek_invite`. On empty result → "Invite not found / expired" message. On `used=true` → "Already used". Else render `<AcceptInviteCard code={code} groupId={…} />`.

- [ ] **Step 2: `AcceptInviteCard.tsx`** — Accept button → `acceptInvite` → on ok `router.push('/g/' + id + '/')`. On `already_member` → push to `/g/[groupId]/` anyway (idempotent UX). Other errors → human-readable inline.

- [ ] **Step 3: Smoke.** Sign out → open `/join/<code>` in a private window → redirected to `/signup?next=/join/<code>` → sign up → back at join page → "Join X?" → Accept → land on `/g/<id>/`.

- [ ] **Step 4: Commit.**
```bash
git add web/src/app/join web/src/components/AcceptInviteCard.tsx
git commit -m "feat(invites): /join/[code] accept flow with signup round-trip"
```

---

## Phase 7 — Group switcher

### Task 16: `GroupSwitcher` in `TopBar`

**Files:** Modify `web/src/components/TopBar.tsx`.

- [ ] **Step 1:** Replace the brand block with a click-to-toggle dropdown:

```
[brand text — current group name ⌄]
─────────────────────
✓ {currentGroupName}      (highlighted, no-op)
  {other group A}         → Link href=/g/A/
  {other group B}         → Link href=/g/B/
─────────────────────
+ Create group            → Link href=/groups/new
⚙ Manage group            → Link href=/g/[current]/manage   (owners only)
─────────────────────
Sign out                  → POST /auth/signout (existing form)
```

Use `next/link` for navigation so the server component re-runs and data reseeds — don't try to swap props in place. Use a small `useState` for open/closed + a click-outside-to-close effect.

- [ ] **Step 2: Smoke.** As a user in ≥2 groups, switching reseeds matches/players and updates brand text. "Manage group" item is owner-only.

- [ ] **Step 3: Commit.**
```bash
git add web/src/components/TopBar.tsx
git commit -m "feat(ui): GroupSwitcher dropdown in TopBar"
```

---

## Phase 8 — Tests

### Task 17: RLS coverage for invites

**Files:** Modify `web/tests/rls/group_isolation.test.ts`.

Add three cases:

```ts
test('non-owner member cannot select invites for their own group', async () => {
  // owner creates invite; member client selects from invites where group_id=gid → []
});

test('non-member cannot select invites for some other group', async () => {
  // outsider selects from invites filtered to gid → []
});

test('a code is a bearer token — userB can accept userA\'s invite if they have the code', async () => {
  // owner generates code; outsider (no prior relationship) calls accept_invite(code); succeeds.
  // Pins this as intentional, not a bug.
});
```

- [ ] **Commit.**
```bash
git add web/tests/rls/group_isolation.test.ts
git commit -m "test(rls): invite visibility + bearer-token semantics"
```

---

### Task 18: Playwright e2e

**Files:** Create `web/tests/e2e/groups_invites.spec.ts`.

- [ ] **Scenario A — create + invite + accept across two browser contexts.** Owner signs up, creates a group, opens manage, creates an invite, copies the code; second context opens `/join/<code>`, gets redirected to signup, signs up, lands back on the join page, accepts, lands on `/g/<id>/` with the right group name visible.

- [ ] **Scenario B — switcher.** Sign in as a user who already has ≥2 memberships (set up via the admin client for speed). Open switcher, click the other group, assert URL change and `topbar-brand-name` text change.

- [ ] **Run.** `cd web && npm run test:e2e -- groups_invites.spec.ts`. Expected: green.

- [ ] **Commit.**
```bash
git add web/tests/e2e/groups_invites.spec.ts
git commit -m "test(e2e): create + invite + accept; group switcher"
```

---

## Phase 9 — Docs

### Task 19: Update CLAUDE.md + NEXT.md

- [ ] **Step 1: `CLAUDE.md` Project-status paragraph.** Add a sentence after the existing match-recording sentence:

> "Group creation + invites are live: any signed-in user can create a group via `/groups/new`, owners generate single-use Crockford-base32 invite codes from `/g/[group_id]/manage`, joiners accept via `/join/[code]`. Leaderboard route restructured from `/` to `/g/[group_id]/`. Migration `0006_groups_invites.sql` adds the `invites` table plus `create_group` / `create_invite` / `peek_invite` / `accept_invite` RPCs."

Also add `0006_groups_invites.sql` to the migrations bullet list under "Repo layout".

- [ ] **Step 2: `NEXT.md`.** Delete `## 1. Group creation + invites`. Add a Recently-Shipped bullet at the top:

> "- **Group creation + invites.** `invites` table + four security-definer RPCs in migration `0006_groups_invites.sql`. New routes `/groups/new`, `/g/[group_id]/`, `/g/[group_id]/manage`, `/join/[code]`. `?next=` round-trip through `/signin` and `/signup`. `TopBar` gains a group switcher. The `handle_new_user` seed-group auto-join trigger is unchanged; stripping it in production stays bundled with item 4."

Renumber remaining items (2 → 1, 3 → 2, etc.).

- [ ] **Step 3: Commit.**
```bash
git add CLAUDE.md docs/superpowers/NEXT.md
git commit -m "docs: groups+invites shipped; promote item 1 to Recently Shipped"
```

---

## Done criteria

- `supabase db reset` clean.
- `npm run lint`, `npm run build`, `npm run test`, `npm run test:e2e` all green from `web/`.
- Manual: fresh signup auto-joins seed group; can create new group, generate invite, sign out, accept invite from private window, switch between both groups via `TopBar`.
- `CLAUDE.md` and `NEXT.md` reflect new state.

## Deferred (linked to spec §13)

Do not slip these in:

- Member removal / leave / ownership transfer.
- Group rename / delete.
- Ghost-member claiming on invite accept.
- Email / multi-use invites.
- Production migration stripping the dev auto-join trigger (item 4).
- Realtime group-list updates (item 6).
