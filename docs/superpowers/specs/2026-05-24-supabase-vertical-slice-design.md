# Supabase Vertical Slice — Design

**Date:** 2026-05-24
**Status:** Draft, awaiting user review
**Scope:** First vertical slice integrating Supabase into Table Topper: schema + RLS + email/password auth + one read-only screen wired to live data. Recording matches, profiles, per-game curated pages, invites, realtime, and iOS are out of scope.

---

## 1. Goal

A signed-in user lands on `/`, sees the standings table from `CafeView` populated by live Postgres rows scoped to their group, gated by Row Level Security. New signups are auto-joined to a single seeded dev group ("The Sunday Strategists") containing the existing mock data converted to real rows. No write paths are implemented in this slice.

This slice proves end-to-end: schema, RLS, `@supabase/ssr` cookie sessions in the App Router, a Postgres RPC replacing the client-side `computeStandings` function, and a Server-Component shell wrapping the existing `CafeView` as a client island.

## 2. Decisions locked during brainstorm

| Decision | Choice | Why |
|---|---|---|
| Scope | Vertical slice — backend + auth + one live screen | Smallest slice that exercises RLS against real UI |
| Target screen | `CafeView` standings table, read-only | Reads are where RLS bites first; writes are a follow-up spec |
| Group model | Single seeded group, schema multi-group, auto-join on signup | RLS honest from day one; no migration when invites land later |
| Auth method | Email + password, email confirmation disabled in dev | Fastest dev loop, no external dependencies |
| Fetch pattern | Server Components + `@supabase/ssr` cookies | App-Router-native; Server Actions are natural fit for future write path |
| Local dev | Supabase CLI + Docker | Matches CLAUDE.md's planned `supabase/` directory; offline-capable |
| Standings logic location | Postgres RPC (`get_standings`) | Procedural PL/pgSQL handles streak cleanly; reusable from future iOS client |

## 3. Runtime topology

```
Browser
  │  cookies hold sb-* session
  ▼
Next.js App Router
  ├── middleware.ts            refreshes Supabase session cookie on every request
  ├── /signin, /signup (RSC)   server actions call supabase.auth.*
  ├── / (RSC)                  async server component, supabase.rpc('get_standings')
  │     └── <CafeViewClient/>  current CafeView, "use client", receives data via props
  └── lib/supabase/{server,client,middleware}.ts  @supabase/ssr factories
                                                                │
                                                                ▼
                                                       Supabase (local via CLI)
                                                       ├── auth.users
                                                       ├── public.* tables + RLS
                                                       └── public.get_standings(...) RPC
```

## 4. Component changes

- **New** `web/src/app/page.tsx` — async server component. Reads session via `createServerClient`. If absent, redirects to `/signin`. Otherwise looks up the user's `group_id` via `group_members`, calls `supabase.rpc('get_standings', { p_group_id, p_game, p_range })`, fetches the member roster, and renders `<CafeViewClient standings={...} members={...} initialGameId={searchParams.game ?? 'cafe'} initialRange={searchParams.range ?? 'month'} />`.
- **Renamed/refactored** `web/src/components/CafeView.tsx` → `CafeViewClient.tsx`. Stays `"use client"`. Props change from "import globals from `data.ts`" to receive `standings: Standing[]`, `members: Player[]`, `initialGameId`, `initialRange`. URL searchParams (`?game=&range=`) are the source of truth for filter state; the client component reads them via `useSearchParams`, and tab/range clicks call `router.push(\`/?game=...&range=...\`)` inside `useTransition`. The server component re-runs on the new URL and supplies fresh `standings`. No client-side Supabase call in this slice.
- **Slim** `web/src/data/data.ts`. Keep type definitions (`Player`, `Standing`, `GameId`, `RealGameId`, `Range`, `H2H`, `Match`, `GameMeta`) and pure formatters (`fmtDate`, `fmtDateLong`, `relTime`). Remove `PLAYERS`, `MATCHES`, `computeStandings`, `filterMatches`, `headToHead`, `playerById`, and the `TODAY` constant — these become server-side concerns. `Standing` may gain `member_id` to match RPC output.
- **New** `web/src/lib/supabase/server.ts`, `client.ts`, `middleware.ts`, `database.types.ts` (generated).
- **New** `web/middleware.ts` at project root, delegates to `lib/supabase/middleware.ts`.
- **New** `web/src/app/signin/page.tsx`, `web/src/app/signup/page.tsx`, `web/src/app/auth/signout/route.ts`.
- **New** `.env.local` (gitignored), `.env.example` (committed) with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## 5. Database schema

All tables in `public`. UUIDs via `gen_random_uuid()`. `created_at timestamptz default now()` on every table unless noted.

```sql
groups
  id          uuid pk
  name        text not null
  created_by  uuid references auth.users(id) on delete set null

members                     -- a roster slot in a group; not necessarily a Supabase user
  id           uuid pk
  group_id     uuid references groups(id) on delete cascade
  user_id      uuid references auth.users(id) on delete set null  -- null for ghost members
  display_name text not null
  handle       text
  color        text not null
  initials     text not null
  joined_at    date not null default current_date
  unique (group_id, user_id) where user_id is not null

group_members              -- authorization edge: this user may access this group
  group_id  uuid references groups(id) on delete cascade
  user_id   uuid references auth.users(id) on delete cascade
  role      text not null check (role in ('owner','member')) default 'member'
  primary key (group_id, user_id)

games
  id     text pk    -- 'catan' | 'carcassonne' | 'monopoly' — matches existing GameId
  label  text not null
  short  text not null

matches
  id                uuid pk
  group_id          uuid references groups(id) on delete cascade
  game_id           text references games(id)
  played_on         date not null
  winner_member_id  uuid references members(id) on delete set null
  created_by        uuid references auth.users(id) on delete set null
  -- index (group_id, played_on desc)

match_players
  match_id   uuid references matches(id) on delete cascade
  member_id  uuid references members(id) on delete cascade
  primary key (match_id, member_id)
  -- index (member_id)
```

Why `members` separate from `auth.users`: the seed group has 8 members but in dev only one (you) will be a real auth user. A `members` row with `user_id = null` is a ghost — real human, not an app user. Same model accommodates future "add a player who doesn't use the app" flows without faking auth rows.

## 6. RLS policies

```sql
alter table groups, members, group_members, matches, match_players enable row level security;
alter table games enable row level security;

create function public.is_group_member(g uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from public.group_members
    where group_id = g and user_id = auth.uid()
  )
$$;

create policy groups_read on groups for select
  using (public.is_group_member(id));

create policy gm_read on group_members for select
  using (public.is_group_member(group_id));

create policy members_read on members for select
  using (public.is_group_member(group_id));

create policy matches_read on matches for select
  using (public.is_group_member(group_id));

create policy mp_read on match_players for select
  using (exists (
    select 1 from matches m
    where m.id = match_players.match_id
      and public.is_group_member(m.group_id)
  ));

create policy games_read on games for select
  using (auth.role() = 'authenticated');
```

No write policies in this slice. Inserts during signup happen through `SECURITY DEFINER` functions (Section 8), which bypass RLS by design.

## 7. `get_standings` RPC

```sql
create function public.get_standings(
  p_group_id uuid,
  p_game     text,    -- 'cafe' | 'catan' | 'carcassonne' | 'monopoly'
  p_range    text     -- 'week' | 'month' | 'all'
) returns table (
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
language plpgsql stable security invoker;
```

Behavior mirrors `computeStandings` in current `data.ts`:

- Filter matches by `group_id`, optionally by `game_id` (skip filter when `p_game = 'cafe'`), and by `played_on >= today - {7d|30d|∞}` from `p_range`.
- Aggregate wins/played per member, per game.
- `fav_game` = most-played real game; tie breaks alphabetically to mirror current TS sort.
- Current streak: iterate each member's matches in `played_on` order, count trailing wins.
- Final sort: `wins desc, win_rate desc, played asc`.

`security invoker` means RLS still applies — a user calling `get_standings` for a foreign group gets zero rows, not an error.

Server component call site:

```ts
const { data, error } = await supabase
  .rpc('get_standings', { p_group_id, p_game: game, p_range: range });
```

RPC returns snake_case; map to `Standing` (camelCase) at the server boundary in `page.tsx` — one place.

## 8. Signup hook

```sql
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  seed_group uuid;
begin
  select id into seed_group from groups where name = 'The Sunday Strategists' limit 1;

  insert into group_members (group_id, user_id, role)
  values (seed_group, new.id, 'member');

  insert into members (group_id, user_id, display_name, handle, color, initials)
  values (
    seed_group, new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    null, '#4a6b7a',
    upper(substring(coalesce(new.raw_user_meta_data->>'display_name', new.email), 1, 2))
  );

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

The `/signup` form passes `options: { data: { display_name } }` to `supabase.auth.signUp`, which lands in `raw_user_meta_data`.

## 9. Auth routes

- `/signin` — server component renders a form. Server Action calls `supabase.auth.signInWithPassword({email, password})`. On success, redirect to `/`. On error, re-render with message.
- `/signup` — same shape, calls `supabase.auth.signUp({ email, password, options: { data: { display_name } } })`. Email confirmation disabled in `supabase/config.toml` for dev. On success, redirect to `/`.
- `/auth/signout` — POST-only Route Handler that calls `supabase.auth.signOut()` and redirects to `/signin`.
- `middleware.ts` — `@supabase/ssr.updateSession` on every request. Also gates `/`: if no session, redirect to `/signin`.

## 10. Local dev setup

```
supabase/
  config.toml                            # auth.email.enable_confirmations = false
  migrations/
    0001_init.sql                        # tables + RLS + is_group_member()
    0002_get_standings.sql               # RPC
    0003_handle_new_user.sql             # signup trigger
  seed.sql                               # games, seed group, 8 members, 50 matches, match_players
```

`seed.sql` content derived from current `PLAYERS` and `MATCHES` constants in `web/src/data/data.ts`. UUIDs for members/matches generated at seed time and stable across `supabase db reset`.

Commands:

- `supabase start` — boots local Postgres + Auth + Studio. Prints URL/anon key → copy to `web/.env.local`.
- `supabase db reset` — re-runs all migrations + seed. Idempotent.
- `npm run db:types` (new script in `web/package.json`) → `supabase gen types typescript --local > src/lib/supabase/database.types.ts`.

## 11. Testing

Four layers, three tools.

### Layer 0 — pure helpers (vitest, no Supabase)

`web/tests/unit/formatters.test.ts`. Covers `fmtDate`, `fmtDateLong`, `relTime` survivors. ~6 assertions including the seam between RPC `played_on` (a `date`) and formatters (which expect ISO strings).

### Layer 1 — `get_standings` correctness (vitest, integration)

`web/tests/rpc/get_standings.test.ts`. Runs against local Supabase. Precondition: `supabase start` running. Test setup runs `supabase db reset --db-url <local>` with a small deterministic fixture (`supabase/tests/seed_known.sql` — 3 members, 6 matches, known wins/streaks).

```ts
test: rpc('get_standings', {group, game:'cafe', range:'all'})
       → ordered rows match expected literals
test: range:'week' filters correctly
test: p_game:'catan' restricts to that game and zeroes others
test: streak counts trailing wins, not best historical streak
test: fav_game is most-played, ties resolve alphabetically (matches TS)
```

Expected literals derived once by running the old `computeStandings` over the same fixture in `tests/rpc/derive_expectations.ts`, then frozen as literals in the test file. This bridge proves the SQL port preserves behavior.

### Layer 2 — RLS isolation (vitest, integration)

`web/tests/rls/group_isolation.test.ts`. Uses Supabase admin client (`SUPABASE_SERVICE_ROLE_KEY` from `.env.test`) to provision two ephemeral users in two distinct groups, then uses their anon JWTs to attempt cross-group reads.

Important: the `handle_new_user` trigger (Section 8) auto-adds every new auth user to the seed group "The Sunday Strategists." For RLS tests we need users in *isolated* groups, so the test setup must, after creating each user, **delete** their auto-created `group_members` and `members` rows for the seed group, then insert fresh rows for the per-test `groupA` / `groupB`. This cleanup is done with the admin client (service role bypasses RLS).

```ts
beforeEach:
  // admin client: create userA, userB
  // admin: delete their seed-group group_members + members rows
  // admin: create groupA + groupB, insert isolated group_members + members + matches
test: userA's anon client cannot select userB's matches (returns [])
test: userA's anon client cannot select userB's members
test: userA's anon rpc('get_standings', { p_group_id: groupB }) returns []
test: unauthenticated client cannot select matches
afterEach: admin: delete both auth users (cascades through groups via FKs)
```

### Layer 3 — auth + render e2e (Playwright)

`web/tests/e2e/signup_and_view.spec.ts`. One scenario:

```ts
test('new user signs up and sees the seeded leaderboard', async ({ page }) => {
  await page.goto('/signup');
  await page.fill('[name=email]',    `t-${Date.now()}@example.com`);
  await page.fill('[name=password]', 'correct-horse-battery');
  await page.fill('[name=display_name]', 'Tester');
  await page.click('button[type=submit]');

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(10); // header + 9
  await expect(page.getByText('Mara')).toBeVisible();
  await expect(page.getByText('Tester')).toBeVisible();
});
```

Runs against `next dev` + local Supabase.

### CI sketch (documented, not implemented in this slice)

```
1. supabase start
2. supabase db reset       # migrations + seed_known fixture
3. cd web && npm ci
4. npm run test            # vitest: layers 0, 1, 2
5. npm run build           # type-check via database.types.ts
6. npm run test:e2e        # playwright: layer 3
```

### New dev dependencies in `web/`

- `vitest`, `@vitest/ui`
- `@playwright/test`
- `dotenv` (for `.env.test` in layer 2)

### CLAUDE.md commands section

Update to add: `npm run test`, `npm run test:e2e`, `npm run db:types`, `supabase start`, `supabase db reset`. Remove the "No test runner is configured yet" line. Remove the "No Supabase CLI config exists yet" line.

## 12. Risks & open trade-offs

- **Seed group is shared across all dev signups.** Fine for solo dev, awkward if you ever invite a stranger to your dev instance. Replaced when "create group" lands.
- **No write path means standings never change in dev** beyond what `seed.sql` provides. Re-seed or wait for the record-match slice to feel the system grow.
- **`Standing` shape duplication.** RPC returns snake_case; client uses camelCase. Mapped at the server boundary — one place — to keep client diffs minimal.
- **Email confirmation off in dev only.** `supabase/config.toml` will need an explicit production override; easy to forget. Spec calls this out; production setup is its own future spec.
- **Streak in PL/pgSQL.** Procedural loop is slower than a window-function version but readable and correct against 50 matches × 8 members. Optimization is a future concern.
- **Test fixture drift.** Layer 1's frozen expectations are derived from current `computeStandings` behavior; if that behavior was buggy, we just froze the bug. Mitigation: spot-check the fixture's expected values by hand once before freezing.

## 13. Out of scope (explicit non-goals)

- Recording matches (writes, Server Actions, write-side RLS policies)
- Player profile pages, individual stats
- Per-game curated pages (CATAN tab content beyond standings)
- Invites, multi-group UI, group switching, create-group flow
- Realtime subscriptions, optimistic updates
- iOS client
- Password reset, email verification flows, OAuth
- Production deployment, hosted-Supabase setup, custom SMTP
- Performance tuning, materialized views, caching
