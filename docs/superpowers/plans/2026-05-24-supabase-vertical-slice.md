# Supabase Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `/` to live Supabase data, gated by email/password auth, with the existing leaderboard reading from a Postgres RPC under RLS — no write paths.

**Architecture:** Next.js 15 App Router + `@supabase/ssr` cookie sessions. Server Component shell on `/` fetches via RPC, passes data to `CafeViewClient` (existing `CafeView` lifted to receive props). Schema is multi-group via `groups` + `group_members`; UI is single-group via a seeded "Sunday Strategists" group every signup auto-joins. RLS keys every read off `is_group_member(group_id)`.

**Tech Stack:** Next.js 15 (App Router, React 18), TypeScript, `@supabase/supabase-js`, `@supabase/ssr`, Supabase CLI (local Postgres + Auth via Docker), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-24-supabase-vertical-slice-design.md`. Read it before starting.

**Working directory:** Most commands run from `web/`. Supabase CLI commands run from repo root (where `supabase/` will live). All paths below are repo-relative.

**File map**

| Path | Created/Modified | Responsibility |
|---|---|---|
| `supabase/config.toml` | Created (by CLI) | Local stack config; we patch `enable_confirmations = false` |
| `supabase/migrations/0001_init.sql` | Created | Tables, indexes, `is_group_member()`, RLS policies |
| `supabase/migrations/0002_get_standings.sql` | Created | The standings RPC |
| `supabase/migrations/0003_handle_new_user.sql` | Created | Signup trigger |
| `supabase/seed.sql` | Created | Games, seed group, 8 ghost members, 50 matches |
| `supabase/tests/seed_known.sql` | Created | Deterministic fixture for RPC tests |
| `web/.env.example`, `web/.env.local`, `web/.env.test` | Created | Supabase URL/keys |
| `web/src/lib/supabase/server.ts` | Created | `createServerClient` factory |
| `web/src/lib/supabase/client.ts` | Created | `createBrowserClient` factory |
| `web/src/lib/supabase/middleware.ts` | Created | `updateSession` helper |
| `web/src/lib/supabase/database.types.ts` | Created (generated) | Schema types |
| `web/middleware.ts` | Created | Cookie refresh + `/` auth gate |
| `web/src/app/page.tsx` | Modified (rewrite) | Server Component, RPC fetch |
| `web/src/app/signin/page.tsx`, `signin/actions.ts` | Created | Sign-in form + Server Action |
| `web/src/app/signup/page.tsx`, `signup/actions.ts` | Created | Sign-up form + Server Action |
| `web/src/app/auth/signout/route.ts` | Created | POST sign-out handler |
| `web/src/components/CafeView.tsx` | Renamed → `CafeViewClient.tsx` | Same render logic, new prop interface |
| `web/src/data/data.ts` | Modified (slim) | Keep types + formatters; drop constants/compute fns |
| `web/tests/unit/formatters.test.ts` | Created | Layer 0 |
| `web/tests/rpc/get_standings.test.ts`, `derive_expectations.ts` | Created | Layer 1 |
| `web/tests/rls/group_isolation.test.ts` | Created | Layer 2 |
| `web/tests/e2e/signup_and_view.spec.ts` | Created | Layer 3 |
| `web/vitest.config.ts`, `web/playwright.config.ts` | Created | Test runner config |
| `web/package.json` | Modified | New deps + scripts |
| `CLAUDE.md` | Modified | Commands section + actual state |
| `.gitignore` | Modified | `web/.env*.local`, `web/.env.test`, supabase volumes |

**Commit cadence:** every task ends with a commit. If you find git is uninitialized, run `git init && git add -A && git commit -m "chore: snapshot before supabase slice"` once, then proceed.

---

## Phase 1 — Project init

### Task 1: Initialize Supabase locally

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/.gitignore`
- Modify: `.gitignore`

- [ ] **Step 1: Confirm Docker is running**

Run: `docker info` (from repo root).
Expected: prints Docker version/server info, exit 0. If it fails, start Docker Desktop and retry.

- [ ] **Step 2: Install Supabase CLI if missing**

Run: `supabase --version`.
Expected: prints a version. If "command not found":
- Windows (recommended): `scoop install supabase` (requires Scoop) or download the `.exe` from https://github.com/supabase/cli/releases and put it on PATH.
- Re-run `supabase --version` to confirm.

- [ ] **Step 3: Initialize the Supabase project**

Run (from repo root): `supabase init`.
Expected: creates `supabase/config.toml`, `supabase/seed.sql`, `supabase/.gitignore`, `supabase/.temp/`.

- [ ] **Step 4: Disable email confirmation in dev**

Edit `supabase/config.toml`. Find the `[auth.email]` section (or `[auth]` → `enable_confirmations`). Set:
```toml
[auth.email]
enable_signup = true
enable_confirmations = false
```
If the section doesn't exist, add it.

- [ ] **Step 5: Boot the local stack**

Run: `supabase start`.
Expected output (~30–60s first time): a block listing `API URL`, `DB URL`, `Studio URL`, `anon key`, `service_role key`. Copy these — Task 2 uses them.

- [ ] **Step 6: Update root `.gitignore`**

Append to `.gitignore`:
```
# Supabase
supabase/.temp/
supabase/.branches/
# Next.js env files
web/.env.local
web/.env.test
web/.env*.local
```

- [ ] **Step 7: Commit**

```bash
git add supabase/ .gitignore
git commit -m "chore(supabase): init local stack"
```

---

### Task 2: Web env files

**Files:**
- Create: `web/.env.example`, `web/.env.local`, `web/.env.test`

- [ ] **Step 1: Write `.env.example`** (committed; placeholders only):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-status>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-from-supabase-status>
```

- [ ] **Step 2: Write `.env.local`** (gitignored). Same keys, but **with the real values** from `supabase start` output. `SUPABASE_SERVICE_ROLE_KEY` is only needed by RLS tests (Task 22); fine to put it here too.

- [ ] **Step 3: Write `.env.test`** (gitignored). Identical to `.env.local` for now; exists so Layer 2 tests load it explicitly via `dotenv`.

- [ ] **Step 4: Verify keys load**

Run (from `web/`): `npx --yes -p dotenv -- node -e "require('dotenv').config({path:'.env.local'}); console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)"`
Expected: prints `http://127.0.0.1:54321`.

- [ ] **Step 5: Commit**

```bash
git add web/.env.example
git commit -m "chore(web): document supabase env vars"
```

---

## Phase 2 — Schema, RLS, seed

### Task 3: Init migration — tables + indexes

**Files:** Create `supabase/migrations/0001_init.sql`.

- [ ] **Step 1: Create the migration file via CLI** (gets a timestamp prefix):

Run (from repo root): `supabase migration new init`
Expected: creates `supabase/migrations/<timestamp>_init.sql`. Rename to `0001_init.sql` for ordering clarity, or keep timestamp — either works as long as ordering is stable. Plan assumes `0001_init.sql`.

- [ ] **Step 2: Paste full schema** into `supabase/migrations/0001_init.sql`:

```sql
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
```

- [ ] **Step 3: Apply migration**

Run: `supabase db reset`
Expected: re-applies migrations + (empty) seed without errors. Look for `Finished supabase db reset on branch ...`.

- [ ] **Step 4: Verify tables**

Run: `supabase db dump --data-only --schema public 2>&1 | head -5` (or open Studio at the URL from `supabase start` and inspect tables under `public`).
Expected: all six tables listed; all empty.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat(db): init schema with rls"
```

---

### Task 4: Seed file — games, seed group, ghost members, matches

**Files:** Create `supabase/seed.sql`.

- [ ] **Step 1: Write `supabase/seed.sql`** with deterministic UUIDs (so re-seeds produce identical IDs — important for the e2e test that asserts specific names):

```sql
-- supabase/seed.sql — populates "The Sunday Strategists"

-- games
insert into public.games (id, label, short) values
  ('catan',       'Catan',       'Catan'),
  ('carcassonne', 'Carcassonne', 'Carc.'),
  ('monopoly',    'Monopoly',    'Mono.');

-- seed group (deterministic UUID for stable seeding)
insert into public.groups (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'The Sunday Strategists');

-- members (8 ghosts — no user_id; same data as web/src/data/data.ts PLAYERS)
insert into public.members (id, group_id, display_name, handle, color, initials, joined_at) values
  ('22222222-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Mara', 'the_architect',  '#b9543d','MA','2023-09-01'),
  ('22222222-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Tomás','dice_whisperer', '#5b7a4a','TO','2023-09-01'),
  ('22222222-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Lena', 'meeple_mayor',   '#8a6a2e','LE','2023-11-01'),
  ('22222222-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','Wren', 'the_trader',     '#4a6b7a','WR','2024-01-01'),
  ('22222222-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','Jules','sheep_baron',    '#7a4a6b','JU','2024-02-01'),
  ('22222222-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','Otto', 'tile_layer',     '#3d6b56','OT','2024-03-01'),
  ('22222222-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','Hana', 'rent_collector', '#a8744a','HA','2024-05-01'),
  ('22222222-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','Felix','longest_road',   '#5d4a7a','FE','2024-08-01');
```

- [ ] **Step 2: Translate the 51 matches** from `web/src/data/data.ts` into seed inserts. To keep the plan readable, use a generator script rather than typing them by hand. Create `scripts/gen_match_seed.mjs`:

```js
// scripts/gen_match_seed.mjs
// Reads web/src/data/data.ts at runtime, prints SQL inserts.
import { MATCHES } from '../web/src/data/data.ts';

const PLAYER_UUID = {
  mara:  '22222222-0000-0000-0000-000000000001',
  tomas: '22222222-0000-0000-0000-000000000002',
  lena:  '22222222-0000-0000-0000-000000000003',
  wren:  '22222222-0000-0000-0000-000000000004',
  jules: '22222222-0000-0000-0000-000000000005',
  otto:  '22222222-0000-0000-0000-000000000006',
  hana:  '22222222-0000-0000-0000-000000000007',
  felix: '22222222-0000-0000-0000-000000000008',
};
const GROUP = '11111111-1111-1111-1111-111111111111';

function matchUuid(id)  { return `33333333-0000-0000-0000-${String(id).padStart(12,'0')}`; }

const inserts = [];
for (const m of MATCHES) {
  const mid = matchUuid(m.id);
  inserts.push(
    `insert into public.matches (id, group_id, game_id, played_on, winner_member_id) values ` +
    `('${mid}','${GROUP}','${m.game}','${m.date}','${PLAYER_UUID[m.winner]}');`
  );
  for (const p of m.players) {
    inserts.push(
      `insert into public.match_players (match_id, member_id) values ('${mid}','${PLAYER_UUID[p]}');`
    );
  }
}
console.log(inserts.join('\n'));
```

- [ ] **Step 3: Generate and append match inserts**

Run (from repo root): `npx --yes -p tsx tsx scripts/gen_match_seed.mjs >> supabase/seed.sql`
Expected: appends ~200 SQL lines to `supabase/seed.sql`. Open it and verify the last lines are valid `insert into public.match_players ...`.

- [ ] **Step 4: Apply seed**

Run: `supabase db reset`
Expected: clean reset including seed; no errors.

- [ ] **Step 5: Smoke-check counts**

Run (from repo root): `supabase db diff` (should be empty), then via Studio SQL editor (or `psql "$DB_URL"`):
```sql
select count(*) from public.members;       -- 8
select count(*) from public.matches;       -- 51
select count(*) from public.match_players; -- 178 (3.49 avg players × 51 matches; exact count from data)
```

- [ ] **Step 6: Commit**

```bash
git add supabase/seed.sql scripts/gen_match_seed.mjs
git commit -m "feat(db): seed sunday strategists"
```

---

## Phase 3 — `get_standings` RPC (TDD)

### Task 5: Write the failing RPC test fixture

**Files:** Create `supabase/tests/seed_known.sql`, `web/tests/rpc/derive_expectations.ts`, scaffold `web/tests/rpc/get_standings.test.ts`.

We can't TDD the RPC against a real database until we have (a) a deterministic fixture distinct from the dev seed, and (b) expected values derived from the existing `computeStandings`. Build those first, *then* the RPC.

- [ ] **Step 1: Create the small fixture** at `supabase/tests/seed_known.sql`. Three members, six matches across two games. Hand-pickable wins:

```sql
-- supabase/tests/seed_known.sql
-- Deterministic fixture for RPC tests. Not loaded by `supabase db reset`;
-- loaded explicitly by Layer-1 test setup.

insert into public.games (id, label, short) values
  ('catan',       'Catan',       'Catan'),
  ('carcassonne', 'Carcassonne', 'Carc.')
on conflict (id) do nothing;

insert into public.groups (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Group');

insert into public.members (id, group_id, display_name, handle, color, initials, joined_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Alice','a','#111111','AL','2026-01-01'),
  ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Bob',  'b','#222222','BO','2026-01-01'),
  ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Cara', 'c','#333333','CA','2026-01-01');

-- 6 matches (assume "today" in tests = 2026-05-23 to align with data.ts TODAY)
-- Catan: 4 matches.  Carc: 2 matches.
insert into public.matches (id, group_id, game_id, played_on, winner_member_id) values
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','catan',      '2026-05-20','bbbbbbbb-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','catan',      '2026-05-18','bbbbbbbb-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','catan',      '2026-05-10','bbbbbbbb-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','catan',      '2026-04-01','bbbbbbbb-0000-0000-0000-000000000003'),
  ('cccccccc-0000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','carcassonne','2026-05-15','bbbbbbbb-0000-0000-0000-000000000003'),
  ('cccccccc-0000-0000-0000-000000000006','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','carcassonne','2026-04-20','bbbbbbbb-0000-0000-0000-000000000002');

-- All 3 members played every match
insert into public.match_players (match_id, member_id)
select m.id, mem.id
from public.matches m
cross join public.members mem
where m.group_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  and mem.group_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
```

- [ ] **Step 2: Create `web/tests/rpc/derive_expectations.ts`** — one-shot derivation. Mirrors the fixture using the *old* `computeStandings`:

```ts
// web/tests/rpc/derive_expectations.ts
// Run with: npx tsx web/tests/rpc/derive_expectations.ts
// Prints expected standings literals to paste into get_standings.test.ts.
import { computeStandings, Match, Player } from '../../src/data/data';

const players: Player[] = [
  { id: 'alice', name: 'Alice', handle:'a', color:'#111111', initials:'AL', joined:'2026-01' },
  { id: 'bob',   name: 'Bob',   handle:'b', color:'#222222', initials:'BO', joined:'2026-01' },
  { id: 'cara',  name: 'Cara',  handle:'c', color:'#333333', initials:'CA', joined:'2026-01' },
];
const matches: Match[] = [
  { id: 1, game:'catan',       date:'2026-05-20', players:['alice','bob','cara'], winner:'alice' },
  { id: 2, game:'catan',       date:'2026-05-18', players:['alice','bob','cara'], winner:'alice' },
  { id: 3, game:'catan',       date:'2026-05-10', players:['alice','bob','cara'], winner:'bob'   },
  { id: 4, game:'catan',       date:'2026-04-01', players:['alice','bob','cara'], winner:'cara'  },
  { id: 5, game:'carcassonne', date:'2026-05-15', players:['alice','bob','cara'], winner:'cara'  },
  { id: 6, game:'carcassonne', date:'2026-04-20', players:['alice','bob','cara'], winner:'bob'   },
];

for (const range of ['week','month','all'] as const)
  for (const game of ['cafe','catan','carcassonne'] as const)
    console.log(range, game, JSON.stringify(computeStandings(players, matches, game, range)));
```

Run it before deleting `computeStandings` (Task 13 will delete it). Save the output to scratch — Task 6 hardcodes the expected literals.

Run: `cd web && npx --yes -p tsx tsx tests/rpc/derive_expectations.ts > /tmp/expected.txt` (Windows: `... > expected.txt`).
Expected: prints 9 lines of JSON, one per (range × game) cell. Inspect.

- [ ] **Step 3: Commit fixture (test code itself comes in Task 6)**

```bash
git add supabase/tests/seed_known.sql web/tests/rpc/derive_expectations.ts
git commit -m "test(rpc): add deterministic fixture and expectations derivation"
```

---

### Task 6: Install vitest + write the failing RPC test

**Files:** Create `web/vitest.config.ts`, `web/tests/rpc/get_standings.test.ts`. Modify `web/package.json`.

- [ ] **Step 1: Install vitest + supabase-js + dotenv**

Run (from `web/`):
```
npm install --save-dev vitest @vitest/ui dotenv tsx
npm install @supabase/supabase-js
```

- [ ] **Step 2: `web/vitest.config.ts`**:

```ts
import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config({ path: '.env.test' });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
    pool: 'forks',     // each test file gets its own Postgres-touching process
  },
});
```

- [ ] **Step 3: Add scripts to `web/package.json`**:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "db:types": "supabase gen types typescript --local > src/lib/supabase/database.types.ts"
}
```

- [ ] **Step 4: Write the failing test** at `web/tests/rpc/get_standings.test.ts`:

```ts
// web/tests/rpc/get_standings.test.ts
import { beforeAll, describe, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import path from 'node:path';

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GROUP = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const admin = createClient(URL, SVC);

beforeAll(() => {
  // Reset DB, then load the known fixture on top of the seed.
  execSync('supabase db reset', { cwd: path.resolve(__dirname, '../../..'), stdio: 'inherit' });
  execSync(
    `psql "${process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'}" -f supabase/tests/seed_known.sql`,
    { cwd: path.resolve(__dirname, '../../..'), stdio: 'inherit' }
  );
});

describe('get_standings', () => {
  test('all-time, cafe (all games) returns 3 rows ordered by wins desc', async () => {
    const { data, error } = await admin.rpc('get_standings', {
      p_group_id: GROUP, p_game: 'cafe', p_range: 'all',
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(3);
    // Alice: 2 wins (catan x2). Bob: 2 wins (catan, carc). Cara: 2 wins (catan, carc).
    // Tie on wins → win_rate equal → played asc (all played 6) → stable order by ??? — assert set, not order, for ties:
    const byName = Object.fromEntries(data!.map(r => [r.display_name, r]));
    expect(byName['Alice'].wins).toBe(2);
    expect(byName['Bob'].wins).toBe(2);
    expect(byName['Cara'].wins).toBe(2);
    expect(byName['Alice'].played).toBe(6);
  });

  test('range=week filters out matches older than 7 days from today', async () => {
    // Test "today" = 2026-05-23 (matches data.ts). Week cutoff = 2026-05-16.
    // In-range catan matches: 2026-05-20, 2026-05-18 (both Alice wins).
    // In-range carc: none (latest is 2026-05-15, before cutoff).
    const { data } = await admin.rpc('get_standings', {
      p_group_id: GROUP, p_game: 'cafe', p_range: 'week',
    });
    const byName = Object.fromEntries(data!.map(r => [r.display_name, r]));
    expect(byName['Alice'].wins).toBe(2);
    expect(byName['Bob'].wins).toBe(0);
    expect(byName['Cara'].wins).toBe(0);
  });

  test('p_game=catan zeroes carc/mono columns', async () => {
    const { data } = await admin.rpc('get_standings', {
      p_group_id: GROUP, p_game: 'catan', p_range: 'all',
    });
    for (const row of data!) {
      expect(row.carc_wins).toBe(0);
      expect(row.mono_wins).toBe(0);
      expect(row.carc_played).toBe(0);
      expect(row.mono_played).toBe(0);
    }
  });

  test('streak counts trailing wins as of last played match', async () => {
    const { data } = await admin.rpc('get_standings', {
      p_group_id: GROUP, p_game: 'cafe', p_range: 'all',
    });
    const byName = Object.fromEntries(data!.map(r => [r.display_name, r]));
    // Alice's matches in date order: 2026-04-01(L cara), 2026-04-20(L bob), 2026-05-10(L bob), 2026-05-15(L cara), 2026-05-18(W), 2026-05-20(W)
    // Trailing wins = 2.
    expect(byName['Alice'].streak).toBe(2);
    // Bob trailing: ..., 2026-05-18(L), 2026-05-20(L) → 0
    expect(byName['Bob'].streak).toBe(0);
  });

  test('fav_game is most-played; ties resolve alphabetically', async () => {
    const { data } = await admin.rpc('get_standings', {
      p_group_id: GROUP, p_game: 'cafe', p_range: 'all',
    });
    // Each member played 4 catan + 2 carc → fav = 'catan'
    for (const row of data!) {
      expect(row.fav_game).toBe('catan');
    }
  });
});
```

- [ ] **Step 5: Run the test and watch it fail**

Run (from `web/`): `npm test`
Expected: tests fail with `function public.get_standings(uuid, text, text) does not exist` or similar. This confirms the test correctly targets the missing RPC.

- [ ] **Step 6: Commit failing test**

```bash
git add web/vitest.config.ts web/tests/rpc/get_standings.test.ts web/package.json web/package-lock.json
git commit -m "test(rpc): failing tests for get_standings"
```

---

### Task 7: Implement `get_standings` RPC

**Files:** Create `supabase/migrations/0002_get_standings.sql`.

- [ ] **Step 1: Create the migration**

Run (from repo root): `supabase migration new get_standings`
Then rename or treat as `0002_get_standings.sql`.

- [ ] **Step 2: Paste the function body**. Two functions: `streak_for` (procedural helper) and `get_standings` (main RPC, calls `streak_for` per member):

```sql
-- 0002_get_standings.sql

-- Helper: trailing wins for a member, filtered by game and date range.
create or replace function public.streak_for(
  p_member_id uuid,
  p_group_id  uuid,
  p_game      text,
  p_cutoff    date
) returns int
language plpgsql stable security invoker
set search_path = public
as $$
declare
  r record;
  s int := 0;
begin
  for r in
    select (m.winner_member_id = p_member_id) as is_win
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.group_id = p_group_id
      and mp.member_id = p_member_id
      and (p_game = 'cafe' or m.game_id = p_game)
      and (p_cutoff is null or m.played_on >= p_cutoff)
    order by m.played_on desc, m.id desc
  loop
    if r.is_win then s := s + 1;
    else exit;
    end if;
  end loop;
  return s;
end $$;

-- Main RPC.
create or replace function public.get_standings(
  p_group_id uuid,
  p_game     text,
  p_range    text
)
returns table (
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
language plpgsql stable security invoker
set search_path = public
as $$
declare
  v_today  date := date '2026-05-23';   -- matches data.ts TODAY; future spec replaces with current_date
  v_cutoff date;
begin
  if p_range = 'week'      then v_cutoff := v_today - 7;
  elsif p_range = 'month'  then v_cutoff := v_today - 30;
  else                          v_cutoff := null;
  end if;

  return query
  with filt as (
    select m.id as match_id, m.game_id, m.played_on, m.winner_member_id, mp.member_id
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.group_id = p_group_id
      and (p_game = 'cafe' or m.game_id = p_game)
      and (v_cutoff is null or m.played_on >= v_cutoff)
  ),
  per_member as (
    select
      mem.id           as member_id,
      mem.display_name, mem.handle, mem.color, mem.initials,
      count(f.match_id)::int                                                                          as played,
      count(f.match_id) filter (where f.winner_member_id = mem.id)::int                               as wins,
      count(f.match_id) filter (where f.game_id = 'catan')::int                                       as catan_played,
      count(f.match_id) filter (where f.game_id = 'carcassonne')::int                                 as carc_played,
      count(f.match_id) filter (where f.game_id = 'monopoly')::int                                    as mono_played,
      count(f.match_id) filter (where f.game_id = 'catan'       and f.winner_member_id = mem.id)::int as catan_wins,
      count(f.match_id) filter (where f.game_id = 'carcassonne' and f.winner_member_id = mem.id)::int as carc_wins,
      count(f.match_id) filter (where f.game_id = 'monopoly'    and f.winner_member_id = mem.id)::int as mono_wins
    from public.members mem
    left join filt f on f.member_id = mem.id
    where mem.group_id = p_group_id
    group by mem.id
  ),
  fav as (
    select
      mem.id as member_id,
      coalesce((
        select v.g
        from (values ('catan'),('carcassonne'),('monopoly')) v(g)
        order by (
          select count(*) from public.match_players mp2
          join public.matches m2 on m2.id = mp2.match_id
          where mp2.member_id = mem.id and m2.group_id = p_group_id and m2.game_id = v.g
        ) desc, v.g asc
        limit 1
      ), 'catan') as fav_game
    from public.members mem
    where mem.group_id = p_group_id
  )
  select
    pm.member_id, pm.display_name, pm.handle, pm.color, pm.initials,
    pm.wins, pm.played,
    case when pm.played > 0 then pm.wins::numeric / pm.played else 0::numeric end as win_rate,
    public.streak_for(pm.member_id, p_group_id, p_game, v_cutoff) as streak,
    pm.catan_wins, pm.carc_wins, pm.mono_wins,
    pm.catan_played, pm.carc_played, pm.mono_played,
    fav.fav_game
  from per_member pm
  join fav on fav.member_id = pm.member_id
  order by pm.wins desc,
           case when pm.played > 0 then pm.wins::numeric / pm.played else 0 end desc,
           pm.played asc;
end $$;
```

- [ ] **Step 3: Apply**

Run: `supabase db reset`
Expected: succeeds, no errors. If PL/pgSQL syntax errors, fix and re-run.

- [ ] **Step 4: Run tests**

Run (from `web/`): `npm test`
Expected: all 5 tests in `get_standings.test.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_get_standings.sql
git commit -m "feat(db): get_standings rpc"
```

---

## Phase 4 — Signup hook

### Task 8: `handle_new_user` trigger

**Files:** Create `supabase/migrations/0003_handle_new_user.sql`.

- [ ] **Step 1: Create migration**

Run: `supabase migration new handle_new_user`. Treat as `0003_handle_new_user.sql`.

- [ ] **Step 2: Paste:**

```sql
-- 0003_handle_new_user.sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  seed_group uuid;
  v_name text;
  v_initials text;
begin
  select id into seed_group from public.groups where name = 'The Sunday Strategists' limit 1;
  if seed_group is null then return new; end if;  -- no seed in test DBs; skip

  v_name := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1));
  v_initials := upper(substring(v_name, 1, 2));

  insert into public.group_members (group_id, user_id, role)
  values (seed_group, new.id, 'member')
  on conflict do nothing;

  insert into public.members (group_id, user_id, display_name, handle, color, initials)
  values (seed_group, new.id, v_name, null, '#4a6b7a', v_initials);

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 3: Apply and verify**

Run: `supabase db reset`
Expected: clean.

Then in Studio SQL editor (or `psql`):
```sql
-- create a fake user via the auth admin function:
select auth.uid();  -- not useful; just demonstrate.
```

Actually the cleanest verification is via Supabase admin API in a one-off node script — but we'll let Task 22 (RLS tests) prove this works.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_handle_new_user.sql
git commit -m "feat(db): auto-join new signups to seed group"
```

---

## Phase 5 — Supabase clients in Next.js

### Task 9: Install `@supabase/ssr` and create client factories

**Files:** Create `web/src/lib/supabase/{server,client,middleware}.ts`. Modify `web/package.json`.

- [ ] **Step 1: Install**

Run (from `web/`): `npm install @supabase/ssr`

- [ ] **Step 2: `web/src/lib/supabase/server.ts`**:

```ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';

export function createClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch { /* Server Component read-only context */ }
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch { /* idem */ }
        },
      },
    }
  );
}
```

- [ ] **Step 3: `web/src/lib/supabase/client.ts`**:

```ts
'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 4: `web/src/lib/supabase/middleware.ts`**:

```ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './database.types';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return request.cookies.get(name)?.value; },
        set(name, value, options) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request });
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Gate `/` — require auth.
  if (!user && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    return NextResponse.redirect(url);
  }

  return response;
}
```

- [ ] **Step 5: Stub `database.types.ts`** at `web/src/lib/supabase/database.types.ts` so imports compile before Task 10 generates the real one:

```ts
export type Database = any;
```

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/supabase web/package.json web/package-lock.json
git commit -m "feat(web): supabase ssr clients"
```

---

### Task 10: Generate database types

**Files:** Overwrite `web/src/lib/supabase/database.types.ts`.

- [ ] **Step 1: Generate**

Run (from `web/`, with `supabase start` running): `npm run db:types`
Expected: overwrites `database.types.ts` with the generated `Database` type. File should be several KB.

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: 0 errors. If the generated types conflict with `lib/supabase/server.ts` etc, fix imports.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/supabase/database.types.ts
git commit -m "chore(web): generate supabase types"
```

---

### Task 11: Root middleware

**Files:** Create `web/middleware.ts`.

- [ ] **Step 1: Create `web/middleware.ts`**:

```ts
import type { NextRequest } from 'next/server';
import { updateSession } from './src/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

- [ ] **Step 2: Verify dev server**

Run (from `web/`): `npm run dev`
Visit `http://localhost:3000/`. Expected: redirect to `/signin` (which 404s for now — that's expected; Task 12 builds it).

Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add web/middleware.ts
git commit -m "feat(web): auth middleware gating /"
```

---

## Phase 6 — Auth routes

### Task 12: `/signin`

**Files:** Create `web/src/app/signin/page.tsx`, `web/src/app/signin/actions.ts`.

- [ ] **Step 1: `web/src/app/signin/actions.ts`**:

```ts
'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signIn(formData: FormData) {
  const email    = String(formData.get('email')    ?? '');
  const password = String(formData.get('password') ?? '');
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/signin?error=${encodeURIComponent(error.message)}`);
  redirect('/');
}
```

- [ ] **Step 2: `web/src/app/signin/page.tsx`**:

```tsx
import { signIn } from './actions';

export default function SignInPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main style={{ maxWidth: 360, margin: '4rem auto', fontFamily: 'system-ui' }}>
      <h1>Sign in</h1>
      {searchParams.error && <p style={{ color: 'crimson' }}>{searchParams.error}</p>}
      <form action={signIn}>
        <label>Email <input name="email" type="email" required /></label>
        <label>Password <input name="password" type="password" required /></label>
        <button type="submit">Sign in</button>
      </form>
      <p>No account? <a href="/signup">Sign up</a>.</p>
    </main>
  );
}
```

(Path alias `@/` resolves to `web/src/`. If `tsconfig.json` doesn't have `"paths": { "@/*": ["./src/*"] }`, add it.)

- [ ] **Step 3: Verify**

Run dev server, visit `/signin`. Expected: form renders. Submitting wrong credentials shows the error message in the URL.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/signin web/tsconfig.json
git commit -m "feat(web): signin page"
```

---

### Task 13: `/signup`

**Files:** Create `web/src/app/signup/page.tsx`, `web/src/app/signup/actions.ts`.

- [ ] **Step 1: `web/src/app/signup/actions.ts`**:

```ts
'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signUp(formData: FormData) {
  const email        = String(formData.get('email')        ?? '');
  const password     = String(formData.get('password')     ?? '');
  const display_name = String(formData.get('display_name') ?? '');
  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email, password,
    options: { data: { display_name } },
  });
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  redirect('/');
}
```

- [ ] **Step 2: `web/src/app/signup/page.tsx`**:

```tsx
import { signUp } from './actions';

export default function SignUpPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main style={{ maxWidth: 360, margin: '4rem auto', fontFamily: 'system-ui' }}>
      <h1>Create account</h1>
      {searchParams.error && <p style={{ color: 'crimson' }}>{searchParams.error}</p>}
      <form action={signUp}>
        <label>Display name <input name="display_name" type="text" required /></label>
        <label>Email <input name="email" type="email" required /></label>
        <label>Password <input name="password" type="password" minLength={8} required /></label>
        <button type="submit">Sign up</button>
      </form>
      <p>Already have one? <a href="/signin">Sign in</a>.</p>
    </main>
  );
}
```

- [ ] **Step 3: Manual smoke test**

Run dev server. Visit `/signup`. Fill in form with `you@example.com` / `password123` / `You`. Submit. Expected: redirect to `/`. (Will probably crash because `page.tsx` is still the mock-data version — Task 14 fixes.)

In Studio (SQL editor), confirm: `select * from public.members where user_id is not null;` returns one row with `display_name = 'You'`.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/signup
git commit -m "feat(web): signup page"
```

---

### Task 14: `/auth/signout`

**Files:** Create `web/src/app/auth/signout/route.ts`.

- [ ] **Step 1:**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/signin', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'));
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/auth/signout/route.ts
git commit -m "feat(web): signout route"
```

---

## Phase 7 — Wire the leaderboard

### Task 15: Slim `data.ts`

**Files:** Modify `web/src/data/data.ts`.

- [ ] **Step 1: Open `web/src/data/data.ts`**. Delete: the `PLAYERS` constant, the `MATCHES` constant, `computeStandings`, `filterMatches`, `headToHead`, `playerById`, the `TODAY` constant, the `REAL_GAMES` constant. Keep: all `type`/`interface` exports, `GAMES`, `fmtDate`, `fmtDateLong`, `relTime`.

Wait — `relTime` uses `TODAY`. Replace `TODAY` with `new Date()` inline inside `relTime`. (For SSR consistency with the RPC's hardcoded date, this minor drift is acceptable in this slice; future spec can pass server time down.)

After edits, file is ~50 lines.

- [ ] **Step 2: Update `Standing` interface** so it accepts the RPC shape — add `member_id: string;` and rename `player: Player` to be optional or keep the existing shape and map at the boundary. Simplest: add `member_id`, keep `player`, populate `player` from members roster at the server boundary in Task 17.

Final `Standing`:

```ts
export interface Standing {
  member_id: string;
  player: Player;
  wins: number;
  played: number;
  winRate: number;
  streak: number;
  byGame: Record<RealGameId, number>;
  playedByGame: Record<RealGameId, number>;
  fav: RealGameId;
}
```

- [ ] **Step 3: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: errors in `CafeView.tsx` (it imports removed symbols). That's Task 16's job. Note them but proceed.

- [ ] **Step 4: Commit (broken build is OK; next task fixes)**

```bash
git add web/src/data/data.ts
git commit -m "refactor(web): slim data.ts to types + formatters"
```

---

### Task 16: Rename `CafeView` → `CafeViewClient`, change props

**Files:** Move `web/src/components/CafeView.tsx` → `web/src/components/CafeViewClient.tsx`. Modify imports.

- [ ] **Step 1: Read `CafeView.tsx`** to know what it currently consumes. Likely imports `PLAYERS`, `MATCHES`, `computeStandings`, etc.

- [ ] **Step 2: Rename file** and update the component:

```tsx
// web/src/components/CafeViewClient.tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import type { Player, Standing, GameId, Range } from '@/data/data';
import { GAMES } from '@/data/data';

interface Props {
  standings: Standing[];
  members: Player[];
  game: GameId;
  range: Range;
}

export function CafeViewClient({ standings, members, game, range }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function setFilter(next: { game?: GameId; range?: Range }) {
    const url = new URLSearchParams(params);
    if (next.game)  url.set('game', next.game);
    if (next.range) url.set('range', next.range);
    startTransition(() => router.push(`/?${url.toString()}`));
  }

  // ... preserve the existing render JSX, replace any direct PLAYERS/MATCHES lookups
  //     with `members` / `standings` props, and wire tab clicks to setFilter(...).
  return (
    <section>
      <nav>
        {(Object.keys(GAMES) as GameId[]).map(g => (
          <button key={g} disabled={g === game} onClick={() => setFilter({ game: g })}>
            {GAMES[g].short}
          </button>
        ))}
      </nav>
      <nav>
        {(['week','month','all'] as Range[]).map(r => (
          <button key={r} disabled={r === range} onClick={() => setFilter({ range: r })}>
            {r}
          </button>
        ))}
      </nav>
      <table>
        <thead>
          <tr><th>#</th><th>Player</th><th>Wins</th><th>Played</th><th>Win %</th><th>Streak</th></tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.member_id}>
              <td>{i + 1}</td>
              <td>{s.player.name}</td>
              <td>{s.wins}</td>
              <td>{s.played}</td>
              <td>{(s.winRate * 100).toFixed(0)}%</td>
              <td>{s.streak}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

Adapt the JSX to preserve the existing pixel-perfect styling — pull from the original `CafeView.tsx`'s render block and only change the data sources, not the DOM structure or class names.

- [ ] **Step 3: Update any imports**. Search the repo for `from '@/components/CafeView'` or `from './CafeView'` — replace with `CafeViewClient`.

- [ ] **Step 4: Delete the old `CafeView.tsx`** (Step 1's move should have done this).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/
git commit -m "refactor(web): cafeview accepts data via props"
```

---

### Task 17: New `app/page.tsx` — server component

**Files:** Rewrite `web/src/app/page.tsx`.

- [ ] **Step 1: Replace contents** with:

```tsx
// web/src/app/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CafeViewClient } from '@/components/CafeViewClient';
import type { Player, Standing, GameId, Range, RealGameId } from '@/data/data';

type RpcRow = {
  member_id: string;
  display_name: string;
  handle: string | null;
  color: string;
  initials: string;
  wins: number;
  played: number;
  win_rate: number;
  streak: number;
  catan_wins: number;
  carc_wins: number;
  mono_wins: number;
  catan_played: number;
  carc_played: number;
  mono_played: number;
  fav_game: RealGameId;
};

function toStanding(r: RpcRow): Standing {
  return {
    member_id: r.member_id,
    player: {
      id: r.member_id,
      name: r.display_name,
      handle: r.handle ?? '',
      color: r.color,
      initials: r.initials,
      joined: '',
    },
    wins: r.wins,
    played: r.played,
    winRate: Number(r.win_rate),
    streak: r.streak,
    byGame:       { catan: r.catan_wins,   carcassonne: r.carc_wins,   monopoly: r.mono_wins   },
    playedByGame: { catan: r.catan_played, carcassonne: r.carc_played, monopoly: r.mono_played },
    fav: r.fav_game,
  };
}

export default async function Home({
  searchParams,
}: { searchParams: { game?: GameId; range?: Range } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: gm } = await supabase
    .from('group_members')
    .select('group_id')
    .limit(1)
    .single();
  if (!gm) redirect('/signin');

  const game:  GameId = searchParams.game  ?? 'cafe';
  const range: Range  = searchParams.range ?? 'month';

  const [{ data: rows, error }, { data: memberRows }] = await Promise.all([
    supabase.rpc('get_standings', { p_group_id: gm.group_id, p_game: game, p_range: range }),
    supabase.from('members').select('id, display_name, handle, color, initials, joined_at')
            .eq('group_id', gm.group_id),
  ]);
  if (error) throw error;

  const standings: Standing[] = (rows as RpcRow[] ?? []).map(toStanding);
  const members: Player[] = (memberRows ?? []).map(m => ({
    id: m.id,
    name: m.display_name,
    handle: m.handle ?? '',
    color: m.color,
    initials: m.initials,
    joined: m.joined_at,
  }));

  return <CafeViewClient standings={standings} members={members} game={game} range={range} />;
}
```

- [ ] **Step 2: Verify build**

Run (from `web/`): `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual end-to-end smoke**

Run: `supabase start` (if not running) and `npm run dev`. Visit `http://localhost:3000`. Expected: redirected to `/signin`. Sign in with the account created in Task 13. Expected: see a 9-row leaderboard (8 ghosts + you).

- [ ] **Step 4: Commit**

```bash
git add web/src/app/page.tsx
git commit -m "feat(web): wire / to live supabase data"
```

---

## Phase 8 — Tests (the remaining layers)

### Task 18: Layer 0 — formatter unit tests

**Files:** Create `web/tests/unit/formatters.test.ts`.

- [ ] **Step 1: Write tests**:

```ts
import { describe, expect, test } from 'vitest';
import { fmtDate, fmtDateLong, relTime } from '../../src/data/data';

describe('formatters', () => {
  test('fmtDate produces "Mon D" form', () => {
    expect(fmtDate('2026-05-22')).toMatch(/May 22/);
  });
  test('fmtDateLong includes year', () => {
    expect(fmtDateLong('2026-05-22')).toMatch(/2026/);
  });
  test('relTime returns "today" for current date input', () => {
    const today = new Date().toISOString().slice(0,10);
    expect(relTime(today)).toBe('today');
  });
  test('relTime returns "yesterday" for one day prior', () => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    expect(relTime(d.toISOString().slice(0,10))).toBe('yesterday');
  });
  test('relTime weeks for 14 days', () => {
    const d = new Date(); d.setDate(d.getDate() - 14);
    expect(relTime(d.toISOString().slice(0,10))).toBe('2w ago');
  });
  test('fmtDate accepts a Postgres date string (no time component)', () => {
    expect(fmtDate('2026-01-04')).toMatch(/Jan 4/);
  });
});
```

- [ ] **Step 2: Run**

`npm test`. Expected: 6 new tests pass + 5 RPC tests still pass.

- [ ] **Step 3: Commit**

```bash
git add web/tests/unit
git commit -m "test(unit): formatters"
```

---

### Task 19: Layer 2 — RLS isolation

**Files:** Create `web/tests/rls/group_isolation.test.ts`.

- [ ] **Step 1: Write the test**:

```ts
// web/tests/rls/group_isolation.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });

type Ctx = {
  userA: { id: string; email: string; pw: string; jwt: string; groupId: string };
  userB: { id: string; email: string; pw: string; jwt: string; groupId: string };
};

async function provisionUserInIsolatedGroup(suffix: string) {
  const email = `t-${Date.now()}-${suffix}@example.com`;
  const pw    = 'correct-horse-battery';
  const { data: created, error: e1 } = await admin.auth.admin.createUser({
    email, password: pw, email_confirm: true,
    user_metadata: { display_name: `Test ${suffix}` },
  });
  if (e1 || !created.user) throw e1 ?? new Error('no user');
  const userId = created.user.id;

  // Trigger auto-joined them to seed group; rip those rows out.
  await admin.from('group_members').delete().eq('user_id', userId);
  await admin.from('members').delete().eq('user_id', userId);

  // Create a fresh group and put them in it.
  const groupId = randomUUID();
  await admin.from('groups').insert({ id: groupId, name: `iso-${suffix}-${Date.now()}` });
  await admin.from('group_members').insert({ group_id: groupId, user_id: userId, role: 'owner' });
  await admin.from('members').insert({
    group_id: groupId, user_id: userId, display_name: `Test ${suffix}`,
    color: '#000000', initials: 'TS',
  });

  // Drop one match into the group so cross-reads have something to find.
  const matchId = randomUUID();
  await admin.from('matches').insert({
    id: matchId, group_id: groupId, game_id: 'catan', played_on: '2026-05-01',
  });

  // Sign in as the user to capture their JWT.
  const userClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: signed, error: e2 } = await userClient.auth.signInWithPassword({ email, password: pw });
  if (e2 || !signed.session) throw e2 ?? new Error('no session');

  return { id: userId, email, pw, jwt: signed.session.access_token, groupId };
}

function asUser(jwt: string) {
  return createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

let ctx: Ctx;

beforeEach(async () => {
  ctx = {
    userA: await provisionUserInIsolatedGroup('A'),
    userB: await provisionUserInIsolatedGroup('B'),
  };
});

afterEach(async () => {
  await admin.auth.admin.deleteUser(ctx.userA.id);
  await admin.auth.admin.deleteUser(ctx.userB.id);
});

describe('RLS group isolation', () => {
  test('user A cannot read user B\'s matches', async () => {
    const a = asUser(ctx.userA.jwt);
    const { data } = await a.from('matches').select('*').eq('group_id', ctx.userB.groupId);
    expect(data ?? []).toHaveLength(0);
  });

  test('user A cannot read user B\'s members', async () => {
    const a = asUser(ctx.userA.jwt);
    const { data } = await a.from('members').select('*').eq('group_id', ctx.userB.groupId);
    expect(data ?? []).toHaveLength(0);
  });

  test('get_standings under user A\'s JWT for user B\'s group returns []', async () => {
    const a = asUser(ctx.userA.jwt);
    const { data } = await a.rpc('get_standings', {
      p_group_id: ctx.userB.groupId, p_game: 'cafe', p_range: 'all',
    });
    expect(data ?? []).toHaveLength(0);
  });

  test('unauthenticated client cannot select matches', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data } = await anon.from('matches').select('*');
    expect(data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run**

`npm test`. Expected: 4 new tests pass.

- [ ] **Step 3: Commit**

```bash
git add web/tests/rls
git commit -m "test(rls): cross-group read isolation"
```

---

### Task 20: Layer 3 — Playwright e2e

**Files:** Install `@playwright/test`, create `web/playwright.config.ts`, `web/tests/e2e/signup_and_view.spec.ts`.

- [ ] **Step 1: Install**

Run (from `web/`):
```
npm install --save-dev @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 2: `web/playwright.config.ts`**:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3000', headless: true },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/signin',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
```

- [ ] **Step 3: `web/tests/e2e/signup_and_view.spec.ts`**:

```ts
import { test, expect } from '@playwright/test';

test('new user signs up and sees the seeded leaderboard', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto('/signup');
  await page.fill('input[name=display_name]', 'Tester');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'correct-horse-battery');
  await page.click('button[type=submit]');

  await page.waitForURL('http://localhost:3000/');
  await expect(page.getByRole('table')).toBeVisible();
  // 8 ghost members + Tester = 9 data rows + 1 header row
  await expect(page.getByRole('row')).toHaveCount(10);
  await expect(page.getByText('Mara')).toBeVisible();
  await expect(page.getByText('Tester')).toBeVisible();
});
```

- [ ] **Step 4: Run**

Ensure `supabase start` is running and DB is freshly seeded (`supabase db reset`).
Run: `npm run test:e2e`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add web/playwright.config.ts web/tests/e2e web/package.json web/package-lock.json
git commit -m "test(e2e): signup + leaderboard smoke"
```

---

## Phase 9 — Docs

### Task 21: Update `CLAUDE.md`

**Files:** Modify `CLAUDE.md`.

- [ ] **Step 1: Edit the "Project status" section**

Replace the first sentence:
> "`web/` is scaffolded ... No Supabase project, no `ios/`, no tests, no lint config beyond `next lint` defaults."

with:
> "`web/` runs against a local Supabase stack (`supabase/` migrations + seed) with email/password auth and a single read-only leaderboard wired to live data. No `ios/` yet. Tests via Vitest + Playwright are configured under `web/tests/`. Lint config is still `next lint` defaults."

- [ ] **Step 2: Update the "Commands" section** to:

```
From repo root:
- `supabase start` — boot local Postgres + Auth + Studio (requires Docker Desktop)
- `supabase db reset` — re-apply migrations + seed

From `web/`:
- `npm run dev` — Next dev server (requires `supabase start` running and `.env.local` populated)
- `npm run build` — production build
- `npm run lint` — `next lint`
- `npm start` — serve the built app
- `npm run test` — Vitest (unit + RPC + RLS integration)
- `npm run test:e2e` — Playwright (signup + leaderboard smoke)
- `npm run db:types` — regenerate `src/lib/supabase/database.types.ts` from local DB
```

- [ ] **Step 3: Update the "Repo layout" section** — move `supabase/` and `web/tests/` from "Planned but not yet present" to "Actual".

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): reflect supabase slice landing"
```

---

## Self-review checklist (run before declaring complete)

- [ ] `supabase start` && `supabase db reset` clean.
- [ ] `cd web && npm run build` succeeds with 0 TypeScript errors.
- [ ] `cd web && npm test` — all Vitest layers pass (Layer 0 + Layer 1 + Layer 2).
- [ ] `cd web && npm run test:e2e` — Playwright passes.
- [ ] Manual: visit `/` in a fresh browser → redirects to `/signin`. Sign up new user → land on `/` → see 9-row leaderboard with your name + 8 ghosts. Click Catan tab → URL becomes `?game=catan` and table re-renders. Click Week → URL adds `range=week`. Sign out via `POST /auth/signout` → redirected to `/signin`.
- [ ] Second-browser check: sign up a second user → both users see the same leaderboard (single seeded group). Confirms multi-user auth works; RLS isolation is verified by Layer 2 tests, not by UI.

---

## Spec ↔ plan coverage map

| Spec section | Task(s) |
|---|---|
| §3 Topology | 9, 10, 11, 17 |
| §4 Component changes | 15, 16, 17 |
| §5 Schema | 3 |
| §6 RLS | 3 (policies inlined with tables) |
| §7 `get_standings` RPC | 5, 6, 7 |
| §8 Signup hook | 8 |
| §9 Auth routes | 12, 13, 14 |
| §10 Local dev setup | 1, 2, 4 |
| §11 Testing layers 0–3 | 18, 6+7 (Layer 1), 19, 20 |
| §11 CLAUDE.md updates | 21 |
| §12 Risks | acknowledged in spec; no task |
| §13 Out of scope | no task (negative space) |
