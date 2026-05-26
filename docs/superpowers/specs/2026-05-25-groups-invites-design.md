# Groups + Invites — Design

**Date:** 2026-05-25
**Status:** Draft, ready for plan
**Scope:** Multi-group UX. Users create groups, invite others via short-lived single-use codes, and switch between groups they belong to. The seed group becomes a dev fixture only. Production deployment (item 4 in `NEXT.md`) and per-game curated stats (item 2) remain out of scope.

---

## 1. Goal

A signed-in user can:

1. Create a new group from `/groups/new`, optionally pre-populating ghost members at create time. They land on `/g/[group_id]/` as the owner.
2. From `/g/[group_id]/manage` (owner-only), generate an invite — an 8-char Crockford-base32 single-use code with a 7-day TTL — and see outstanding / used / expired invites.
3. Share the resulting `/join/[code]` URL. Recipients sign up (or sign in) if needed, accept the invite, and land on `/g/[group_id]/`.
4. Switch between multiple groups via a switcher in `TopBar`. The active group is the URL segment; bookmarks pin it.

New signups in **dev** continue to auto-join "The Sunday Strategists" via the existing `handle_new_user` trigger (so `supabase db reset` + signup still gives a populated leaderboard). The trigger is **untouched by this spec**; stripping it for production lands in item 4's production migration.

The slice does **not** implement member removal, ownership transfer, group rename/delete, ghost-member claiming on invite, or email-delivered invites. Those are explicit non-goals (Section 13).

## 2. Decisions locked during brainstorm

| Decision | Choice | Why |
|---|---|---|
| Active-group selection | **A3**: `/g/[group_id]/` route segment | Bookmarkable, shareable, manage page collapses into the same tree; one-time refactor only touches `page.tsx`, `HomeClient`, `middleware.ts`, `TopBar`. |
| Invite shape | **B1**: single-use 8-char code, 7-day TTL | Simplest table, simplest acceptance, simplest revocation. Reusable / email-bound variants are one column away later. |
| Who generates invites | **C1**: owners only | Matches `NEXT.md` item 1's stated direction; configurable policy is feature creep. |
| `handle_new_user` trigger fate | **D2**: keep auto-join in dev, strip in production migration (item 4) | Preserves dev ergonomics — `db reset` + signup still shows seeded data — without surprising the production cutover. |
| Member row on invite accept | **E1**: always create a fresh `members` row for the joining user | Ghost-member claiming (E2) is the right long-term model but doubles the invite-creation UI; defer. |
| Initial roster on group create | **F2**: creator + optional inline ghost members at create time | Matches the prototype mental model: most rosters are ghosts who don't have accounts. |
| Write path | **G**: `security definer` RPCs for `create_group` / `create_invite` / `accept_invite`. No raw INSERT RLS policies on `groups` / `group_members` / `invites`. | Same pattern as `record_match` (`@supabase/migrations/0004_match_writes.sql`). Multi-table atomic inserts are the documented "escape hatch" criterion per `CLAUDE.md`. INSERT policies on `group_members` are hard to express because the row referencing the user being added doesn't yet exist when `is_group_member` is evaluated. |
| Invite code format | **H1**: 8-character Crockford base32, no ambiguous chars (0/O, 1/I, L) | ~40 bits of entropy; friend-group scale doesn't need more, copies cleanly into chat. |
| Unauthed `/join/[code]` flow | **I1**: redirect to `/signup?next=/join/[code]` | Avoids duplicating auth UI on the join page; one place to fix auth bugs. |

## 3. Runtime topology

```
Browser
  │  cookies hold sb-* session
  ▼
Next.js App Router
  ├── middleware.ts
  │     • refreshes Supabase session
  │     • gates /, /g/*, /groups/* behind auth
  │     • leaves /join/[code], /signin, /signup, /auth/* open
  │
  ├── /                          (RSC) redirects to /g/<default group> or /groups/new
  ├── /groups/new                (RSC) create-group form + Server Action → create_group RPC
  ├── /g/[group_id]/             (RSC) current leaderboard, scoped to this group
  ├── /g/[group_id]/manage       (RSC, owner-only) invite list + Create invite action
  ├── /join/[code]               (RSC) accept-invite page; redirects unauthed to /signup?next=...
  ├── /signin, /signup           (existing) extended to honor ?next=
  └── /auth/signout              (existing) unchanged
                                                                │
                                                                ▼
                                                       Supabase
                                                       ├── invites table (new)
                                                       ├── create_group()   RPC
                                                       ├── create_invite()  RPC
                                                       ├── accept_invite()  RPC
                                                       └── existing record_match() / get_standings()
```

## 4. Component changes

### Routes (App Router)

- **New** `web/src/app/g/[group_id]/page.tsx` — the current `web/src/app/page.tsx` body, parameterized on `group_id` from the URL. Resolves the group via membership check; 404 (or redirect to `/`) if the user is not a member. Calls `get_standings` with that `group_id`. Loads the group name + role for `TopBar`.
- **New** `web/src/app/g/[group_id]/manage/page.tsx` — owner-only. Lists members, lists outstanding/used/expired invites, exposes a Server Action `createInviteAction(formData)` that wraps the `create_invite` RPC. Returns a copy-ready `/join/[code]` URL inline on submit.
- **New** `web/src/app/groups/new/page.tsx` — server-rendered form. Single `name` field plus a client-island `GhostMemberRows` widget (add/remove rows of `{display_name, color, initials}`). Server Action `createGroupAction(formData)` calls `create_group`, redirects to `/g/[new_id]/`.
- **New** `web/src/app/join/[code]/page.tsx` — server component. If `auth.uid()` is null, redirects to `/signup?next=/join/[code]`. If authed, fetches the invite row (via a small `peek_invite(code)` RPC so we can show "Accept invite to {group_name}?" without leaking other groups' data), renders an Accept form whose action calls `accept_invite` and redirects to `/g/[group_id]/`.
- **Rewritten** `web/src/app/page.tsx` — becomes a thin redirector. Reads the user's most recent `group_members` row (ordered by `created_at desc`) and redirects to `/g/[that_id]/`. If the user has zero memberships, redirects to `/groups/new`.

### Server Actions

- `web/src/app/actions/create-group.ts` — `createGroup({ name, ghosts: GhostInput[] })` → `{ ok: true, groupId } | { ok: false, error }`. Same shape as `recordMatch` (`@web/src/app/actions/record-match.ts:15-17`).
- `web/src/app/actions/create-invite.ts` — `createInvite({ groupId, ttlHours? })` → `{ ok: true, code, expiresAt } | { ok: false, error }`.
- `web/src/app/actions/accept-invite.ts` — `acceptInvite({ code })` → `{ ok: true, groupId } | { ok: false, error }`.

Each Server Action calls `revalidatePath` on the relevant subtree (`/g/[groupId]/manage` for invite creation; `/` for accept/create so the group switcher refreshes).

### Components

- **Updated** `web/src/components/TopBar.tsx`:
  - New required props: `groupName: string`, `groupRole: 'owner' | 'member'`, `groups: { id: string; name: string }[]` (the user's membership list, fetched server-side).
  - The hardcoded `"Sunday Strategists"` brand becomes `{groupName}` driven.
  - New `GroupSwitcher` dropdown (own subcomponent in same file or `TopBar.GroupSwitcher.tsx`) listing other groups, divider, "Create group" → `/groups/new`, "Manage group" → `/g/[group_id]/manage` (rendered only when `groupRole === 'owner'`), "Sign out".
  - Tab + range buttons keep using local state; they don't need to know about the group.
- **Updated** `web/src/components/HomeClient.tsx`:
  - Accepts `groupName`, `groupRole`, `groups` as new props and passes them to `TopBar`.
  - `groupId` prop already exists (`@web/src/components/HomeClient.tsx:20`); no change to the matches/players flow.
- **New** `web/src/components/CreateGroupForm.tsx` — client island, renders ghost-member rows with add/remove. Submits via the create-group Server Action.
- **New** `web/src/components/AcceptInviteCard.tsx` — small client component used inside `/join/[code]/page.tsx` for the Accept button's pending state.

### `middleware.ts`

Update the gate to allow `/join/*` (and `/signin`, `/signup`, `/auth/*`) but require auth on `/`, `/g/*`, `/groups/*`. The matcher pattern stays the same; the auth-check branch inside `updateSession` (in `@web/src/lib/supabase/middleware.ts`) gets the new allowlist.

## 5. Database schema

One new table, one helper.

```sql
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
```

No `INSERT` / `UPDATE` policies on `invites`; all writes go through the RPCs below.

### RLS read policy

```sql
-- Owners see their group's invites in /manage.
-- (No general "everyone authenticated" read — codes are bearer tokens.)
create policy invites_read on public.invites for select
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = invites.group_id
        and gm.user_id = auth.uid()
        and gm.role = 'owner'
    )
  );
```

`peek_invite(code)` (Section 6) is `security definer` and returns only `{group_id, group_name, expires_at, used}` — never the full row — so prospective joiners can preview a code without needing read access to the `invites` table.

### Helper

```sql
create or replace function public.is_group_owner(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members
    where group_id = g and user_id = auth.uid() and role = 'owner'
  )
$$;
```

Mirrors the existing `is_group_member` helper from `@supabase/migrations/0001_init.sql:64-70`.

## 6. RPCs

All four are `security definer set search_path = public`, executable by `authenticated` only.

### `create_group(p_name text, p_ghosts jsonb) returns uuid`

```sql
-- p_ghosts: jsonb array of {display_name, color, initials} objects. May be empty.
-- Inserts atomically:
--   1. groups(name, created_by=auth.uid())                 → new_group_id
--   2. group_members(new_group_id, auth.uid(), 'owner')
--   3. members(new_group_id, auth.uid(), display_name=…)   -- creator's own seat;
--      display_name pulled from members where user_id=auth.uid() in *any* group
--      if available, else from auth.users.raw_user_meta_data.display_name,
--      else from email local-part. Color/initials same fallback chain.
--   4. members(new_group_id, null, …) for each ghost in p_ghosts.
-- Returns new_group_id.
-- Validates: p_name not blank, each ghost has display_name + color + initials,
--            no duplicate display_names within ghosts + creator.
```

### `create_invite(p_group_id uuid, p_ttl_hours int default 168) returns table(code text, expires_at timestamptz)`

```sql
-- Asserts is_group_owner(p_group_id). Generates a Crockford-base32 8-char code
-- (alphabet 0123456789ABCDEFGHJKMNPQRSTVWXYZ; no I, L, O, U). Retries on
-- unique-conflict up to 5 times (collision odds are vanishing). Inserts the
-- invites row with expires_at = now() + (p_ttl_hours || ' hours')::interval.
-- Caps p_ttl_hours at 720 (30 days) to keep links from going stale forever.
```

### `peek_invite(p_code text) returns table(group_id uuid, group_name text, expires_at timestamptz, used boolean)`

```sql
-- security definer. Returns minimal info for the /join/[code] preview, with no
-- group-membership requirement (so unauth-bound previews work after sign-in
-- redirect). Does NOT reveal members, matches, or anything else about the
-- group. If code is missing/expired, returns zero rows (caller renders "invite
-- not found or expired").
```

### `accept_invite(p_code text) returns uuid`

```sql
-- security definer. Single transaction:
--   1. Lock invites row by code; abort if not found, used_at is not null, or
--      expires_at <= now().
--   2. Abort if auth.uid() already in group_members for that group_id
--      (idempotent error: caller redirects to /g/[group_id]/ instead).
--   3. Insert group_members(group_id, auth.uid(), 'member').
--   4. Insert members(group_id, auth.uid(), display_name=…, color=…, initials=…)
--      using the same fallback chain as create_group.
--   5. Update invites set used_by=auth.uid(), used_at=now() where id=…
--   6. Return group_id.
-- Error codes mapped to user-facing strings in the Server Action: 'not_found',
-- 'expired', 'used', 'already_member'.
```

Grants:

```sql
revoke all on function public.create_group(text, jsonb)             from public;
revoke all on function public.create_invite(uuid, int)              from public;
revoke all on function public.peek_invite(text)                     from public;
revoke all on function public.accept_invite(text)                   from public;

grant execute on function public.create_group(text, jsonb)          to authenticated;
grant execute on function public.create_invite(uuid, int)           to authenticated;
grant execute on function public.peek_invite(text)                  to authenticated;
grant execute on function public.accept_invite(text)                to authenticated;
```

## 7. Migration

`supabase/migrations/0006_groups_invites.sql` contains:

1. `invites` table + index + RLS enable + `invites_read` policy.
2. `is_group_owner(uuid)` helper.
3. The four RPCs above with grants.

No changes to existing migrations. The `handle_new_user` trigger from `@supabase/migrations/0003_handle_new_user.sql:1-30` is untouched; production stripping moves to a future `0007_production_signup.sql` shipped under item 4.

`seed.sql` is unchanged. `supabase/tests/seed_known.sql` may need a small addition (one `groups` row owned by a test user) so RPC tests have an owner-context to exercise `create_invite` against — TBD during plan execution.

## 8. URL contract summary

| Path | Auth | Notes |
|---|---|---|
| `/` | required | Redirects to `/g/<most-recent-group>/` or `/groups/new` if user has zero memberships. |
| `/g/[group_id]/` | required, member | 404/redirect-to-`/` if not a member. Current leaderboard. |
| `/g/[group_id]/manage` | required, owner | Invite list + create. |
| `/groups/new` | required | Create-group form. |
| `/join/[code]` | optional | Unauthed → `/signup?next=/join/[code]`. Authed → accept page. |
| `/signin?next=…`, `/signup?next=…` | optional | After auth success, redirect to `next` if it starts with `/`. |
| `/auth/signout` | required | Unchanged. |

The `?next=` honor list is restricted to relative paths starting with `/` to prevent open-redirects.

## 9. Testing

Mirrors the existing four-layer strategy (`@web/tests/` is already organized this way).

### Layer 0 — unit (vitest)

Minimal. The Crockford-base32 alphabet is enforced server-side, but if we add a TS helper for displaying invite URLs (`/join/${code}`), it gets a one-liner test.

### Layer 1 — RPC correctness (vitest, integration)

`web/tests/rpc/groups_invites.test.ts`:

- `create_group` happy path: returns a uuid; new `groups` / `group_members(role='owner')` / `members` rows exist; ghost members appear with `user_id is null`.
- `create_group` validation: blank name → error; duplicate ghost display_name → error.
- `create_invite` happy path: returns 8-char code + `expires_at ≈ now + 168h`; row exists in `invites`.
- `create_invite` rejects non-owner: caller in group as `'member'` → permission error.
- `create_invite` rejects non-member entirely.
- `peek_invite`: valid code → group info; expired → empty; used → returns row with `used=true`; unknown code → empty.
- `accept_invite` happy path: caller joins group; `group_members` row created with `role='member'`; `members` row created; invite marked used.
- `accept_invite` rejects expired / already-used / unknown codes with distinct errors.
- `accept_invite` idempotent on already-member: returns `already_member` error (so UI can redirect cleanly).

### Layer 2 — RLS isolation (vitest, integration)

Extend `web/tests/rls/group_isolation.test.ts`:

- A non-owner anon client cannot `select` invites for their group (the read policy requires owner role).
- A non-member anon client cannot `select` invites at all.
- `accept_invite` called by user B with user A's code still works (codes are bearer tokens — this test pins that behavior intentionally and documents it inline).

### Layer 3 — e2e (Playwright)

`web/tests/e2e/groups_invites.spec.ts`:

- **Scenario A — create + invite + accept across two browser contexts.** User1 signs up, creates a new group via `/groups/new` with two ghosts, opens `/g/[id]/manage`, generates an invite, copies the URL. User2 (separate context) opens that URL, signs up via the redirect, lands on `/g/[id]/`, sees the standings table.
- **Scenario B — group switcher.** With User2 already in two groups (seed + the new one), open the switcher, click the other group, assert URL changes and `TopBar` brand updates.

Existing `signup_and_view.spec.ts` may need a small assertion update if anything user-visible about the seed-group landing changed; it should otherwise still pass because the dev trigger stays in place.

## 10. Risks & open trade-offs

- **Codes are bearer tokens.** Anyone with the URL can accept. Acceptable for v1 (friend-group scale, 7-day TTL, single use). If we ever want email-bound invites, that's a new column + a check in `accept_invite`.
- **Owner role is brittle.** Only one owner per group is allowed implicitly (no constraint, but no UI for multi-owner). If the sole owner leaves, the group is unmanageable. Out of scope for this slice; ownership transfer is a follow-up.
- **Default-group selection on `/`.** "Most recent `group_members` row" is fine for two-group dev usage but not a real "remembered last-viewed group." A `users.preferences` jsonb or a cookie would be more honest. Punt unless it bites.
- **Ghost-member dedup.** `create_group` validates uniqueness inside the request, but two users could create groups with overlapping ghost names — that's fine, they're different `members.id`s in different groups.
- **Group switcher fetch cost.** Each `/g/[group_id]/` page fetches the user's full group list for the switcher. At friend-group scale this is one tiny query; revisit if anyone joins >50 groups.
- **`/join/[code]` open route.** Letting unauthed visitors hit the URL is the whole point, but it means we leak "this code exists / is expired / is used" via `peek_invite`. Acceptable: the alternative is requiring sign-in before previewing, which makes the redirect-back UX painful and the leak is bounded (no group contents, just metadata).

## 11. Affected files (summary)

New:

- `supabase/migrations/0006_groups_invites.sql`
- `web/src/app/g/[group_id]/page.tsx`
- `web/src/app/g/[group_id]/manage/page.tsx`
- `web/src/app/groups/new/page.tsx`
- `web/src/app/join/[code]/page.tsx`
- `web/src/app/actions/create-group.ts`
- `web/src/app/actions/create-invite.ts`
- `web/src/app/actions/accept-invite.ts`
- `web/src/components/CreateGroupForm.tsx`
- `web/src/components/AcceptInviteCard.tsx`
- `web/tests/rpc/groups_invites.test.ts`
- `web/tests/e2e/groups_invites.spec.ts`

Modified:

- `web/src/app/page.tsx` — becomes a redirector.
- `web/src/components/TopBar.tsx` — accepts group props, renders switcher.
- `web/src/components/HomeClient.tsx` — passes group props through.
- `web/src/lib/supabase/middleware.ts` — extended allowlist for `/join/*`.
- `web/src/app/signin/page.tsx`, `web/src/app/signup/page.tsx` — honor `?next=` (with the leading-slash guard).
- `web/src/app/signin/actions.ts`, `web/src/app/signup/actions.ts` — honor `next` form field.
- `web/tests/rls/group_isolation.test.ts` — invite-visibility cases.
- `CLAUDE.md` — Project-status one-liner about groups+invites being live.
- `docs/superpowers/NEXT.md` — remove item 1, append a Recently-Shipped bullet.

Database types regen (`npm run db:types`) after the migration lands.

## 12. Out of scope (explicit non-goals)

- Removing members from a group; leaving a group voluntarily.
- Renaming or deleting groups.
- Transferring ownership; multi-owner groups.
- Ghost-member claiming on invite accept (deferred E2).
- Email-delivered invites; SMTP setup (waits for item 4).
- Reusable / multi-use invite codes.
- Production migration that strips `handle_new_user` (waits for item 4).
- Per-group theming / branding.
- Realtime group-list updates (waits for item 6).
- Player profile aggregation across multiple groups.
