# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

`web/` (Next.js 15 App Router, React 18, TypeScript) runs against a local Supabase stack (`supabase/` migrations + seed) with email/password auth and a leaderboard wired to live data via the `get_standings` Postgres RPC. RLS gates reads off `group_members`. Match recording is live via the `record_match` RPC + a `recordMatch` server action (atomic two-table insert, group-membership-checked). Group creation + invites are live: any signed-in user can create a group via `/groups/new`, owners generate single-use Crockford-base32 invite codes from `/g/[group_id]/manage`, joiners accept via `/join/[code]`. Leaderboard route restructured from `/` to `/g/[group_id]/`; `/` is now a thin redirector to the user's most recent group (or `/groups/new`). Migration `0006_groups_invites.sql` adds the `invites` table plus `create_group` / `create_invite` / `peek_invite` / `accept_invite` RPCs. `TopBar` has a group switcher for users in multiple groups. `PlayerProfileModal` now renders from a `get_player_profile` RPC (migration `0007_get_player_profile.sql`, `security invoker`, returns a single JSONB blob) rather than client-state matches, with `HomeClient` lazy-loading the payload via `supabase.rpc()` + `AbortController` keyed on `profileId`. Tests live under `web/tests/` via Vitest (unit + RPC + RLS integration including write isolation, invite visibility, and player-profile cross-group isolation) and Playwright (signup→leaderboard e2e + create-invite-accept flow). No `ios/` yet. Lint config is still `next lint` defaults.

The slice still omits per-game curated pages — that's the next spec (see `docs/superpowers/NEXT.md`). See `docs/superpowers/specs/2026-05-24-supabase-vertical-slice-design.md` and `docs/superpowers/specs/2026-05-25-groups-invites-design.md` for the design baselines.

React is pinned to 18 (not 19) deliberately; do not upgrade without a reason.

## Product

**Table Topper** is a board-game leaderboard for friend groups. The core domain objects are **Groups**, **Members**, **Games**, and **Match Records**. The product differentiator is **game-specific curated pages** (e.g., a CATAN tab surfaces stats that only make sense for CATAN — longest road wins, expansion played, etc.) layered on top of a generic "who won, when" record.

Planned user-facing capabilities:
- Record a match (winner + date, per-game custom fields)
- View group stats and individual stats
- Create / edit groups, invite friends
- Sign up / auth
- Per-game curated stat pages (CATAN first, others to follow)

## Design handoff

`.design/board-game-leaderboard/` is a **Claude Design handoff bundle** — HTML/CSS/JS prototypes the user iterated on before this repo existed. Before implementing or changing any UI:

1. Read `.design/board-game-leaderboard/README.md`.
2. Read the chat transcripts in `.design/board-game-leaderboard/chats/` — that's where the user's intent and final decisions live; the HTML is just the output.
3. Then read the relevant file under `.design/board-game-leaderboard/project/` and follow its imports.

The job is pixel-perfect *visual* recreation in React, not a structural copy of the prototype's HTML.

## Architecture (planned)

Two clients, one backend. Both clients talk directly to Supabase; server-side logic lives in Edge Functions **only when RLS + Postgres views can't express it**.

```
┌────────────────────┐     ┌────────────────────┐
│ Web (Next.js/React)│     │  iOS (SwiftUI)     │
│  on Vercel         │     │                    │
└─────────┬──────────┘     └──────────┬─────────┘
          │  supabase-js              │ supabase-swift
          └────────────┬──────────────┘
                       ▼
              ┌────────────────────┐
              │     Supabase       │
              │  Auth | Postgres   │
              │  RLS  | Edge Fns   │
              └────────────────────┘
```

### Key architectural rules of thumb

- **RLS is the authorization layer.** Group membership gates read/write on every table. Do not rely on client-side filtering for security — assume any row the client *could* select, it *will* try to. Write policies first, then the UI.
- **Per-game customization** should be data-driven, not code-driven. A `games` table + a `match_stats` JSONB column (or per-game stat tables) lets new games ship without a schema migration each time. The CATAN page is a *view* over generic match data plus CATAN-specific fields — not a parallel data model.
- **Edge Functions are an escape hatch.** Reach for them only when the operation needs a secret, must be atomic across tables in a way RLS can't enforce, or involves a third-party call. Prefer Postgres functions / views first.
- **Shared schema, separate clients.** Web and iOS will diverge in UI but must agree on table shapes and RPC contracts. When changing the DB, update both clients in the same change if possible, or gate behind a feature column.

## Repo layout

Actual:
- `web/` — Next.js 15 App Router, React 18, TypeScript
  - `src/app/` — routes: `layout.tsx`, `page.tsx` (redirector to `/g/[default]/`), `g/[group_id]/page.tsx` (server-rendered leaderboard), `g/[group_id]/manage/page.tsx` (owner-only invite management), `groups/new/page.tsx` (create-group form), `join/[code]/page.tsx` (accept invite), `signin/`, `signup/`, `auth/signout/`
  - `src/components/{HomeClient,CafeView,CatanView,CarcassonneView,TopBar,Modals,CreateGroupForm,InviteManager,AcceptInviteCard}.tsx` — `HomeClient` orchestrates state, `*View` components render per-tab leaderboards, `Modals` hosts Record/History/PlayerProfile, `TopBar` includes a `GroupSwitcher` dropdown, `CreateGroupForm` / `InviteManager` / `AcceptInviteCard` are client islands for the new group/invite flows
  - `src/data/data.ts` — types and pure formatters only (mock constants + standings logic moved to Supabase)
  - `src/lib/supabase/{server,client,middleware}.ts` — `@supabase/ssr` factories; `database.types.ts` is generated
  - `src/lib/next-redirect.ts` — `safeNext()` helper that guards `?next=` against open-redirects
  - `middleware.ts` — refreshes Supabase session cookie; gates everything except `/signin`, `/signup`, `/auth/*`, `/join/*`; passes original path as `?next=` for round-tripping after auth
  - `src/app/actions/{record-match,create-group,create-invite,accept-invite}.ts` — server actions wrapping the corresponding RPCs
  - `src/styles/` — plain CSS (`base.css`, `cafe.css`, `catan.css`, `carcassonne.css`, `modals.css`)
  - `tests/{unit,rpc,rls,e2e}/` — Vitest + Playwright suites
- `supabase/` — Supabase CLI workspace
  - `migrations/0001_init.sql` (schema + RLS), `0002_get_standings.sql` (RPC), `0003_handle_new_user.sql` (legacy signup trigger; dropped in 0008), `0004_match_writes.sql` (record_match RPC + insert RLS), `0005_get_standings_anchor.sql` (data-driven date anchor), `0006_groups_invites.sql` (invites table + create_group / create_invite / peek_invite / accept_invite RPCs), `0007_get_player_profile.sql` (player profile RPC), `0008_drop_seed_group_auto_join.sql` (drops the seed-group auto-join trigger so new sign-ups land in zero groups)
  - `seed.sql` — "The Sunday Strategists" + 8 members + 51 matches
  - `tests/seed_known.sql` — deterministic fixture loaded by RPC tests
  - `config.toml` — local-dev config (email confirmation disabled)
- `scripts/gen_match_seed.mjs` — generator that translates `data.ts` MATCHES into seed SQL
- `docs/superpowers/{specs,plans}/` — design spec + implementation plan for the slice
- `.design/board-game-leaderboard/` — design handoff bundle (see above)

The `CatanView` and `CarcassonneView` tabs currently render the same generic shape as `CafeView` filtered to one game; their per-game curated stat treatment is still upcoming work (see `docs/superpowers/NEXT.md` item 4). Their visual prototypes live under `.design/board-game-leaderboard/project/`.

Planned but not yet present:
- `ios/` — SwiftUI Xcode project

## Commands

From repo root (require Docker Desktop running):
- `supabase start` — boot local Postgres + Auth + Studio
- `supabase db reset` — re-apply migrations + seed
- `supabase status -o env` — print API URL, anon key, service-role key for `web/.env.local`/`.env.test`

From `web/` (require `supabase start` running and `.env.local` populated):
- `npm run dev` — Next dev server
- `npm run build` — production build
- `npm run lint` — `next lint`
- `npm start` — serve the built app
- `npm run test` — Vitest (unit + RPC + RLS integration). Tests reset and re-seed the DB; do not run concurrently with `dev`.
- `npm run test:e2e` — Playwright signup→leaderboard smoke
- `npm run db:types` — regenerate `src/lib/supabase/database.types.ts` after schema changes

iOS surface doesn't exist yet.

Update this section the moment new scripts (writes, iOS build) land — don't let it drift.
