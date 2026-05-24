# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

`web/` (Next.js 15 App Router, React 18, TypeScript) runs against a local Supabase stack (`supabase/` migrations + seed) with email/password auth and a single read-only leaderboard at `/` wired to live data via the `get_standings` Postgres RPC. RLS gates all reads off `group_members`. Tests live under `web/tests/` via Vitest (unit + RPC + RLS integration) and Playwright (signup→leaderboard e2e). No `ios/` yet. Lint config is still `next lint` defaults.

The slice deliberately omits write paths (recording matches), per-game curated pages, invites, and multi-group UI — these are future specs. See `docs/superpowers/specs/2026-05-24-supabase-vertical-slice-design.md` for what was built and why.

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
  - `src/app/` — routes: `layout.tsx`, `page.tsx` (server-rendered leaderboard), `signin/`, `signup/`, `auth/signout/`
  - `src/components/CafeViewClient.tsx` — the only React component in the slice; receives `standings` + `members` via props
  - `src/data/data.ts` — types and pure formatters only (mock constants + standings logic moved to Supabase)
  - `src/lib/supabase/{server,client,middleware}.ts` — `@supabase/ssr` factories; `database.types.ts` is generated
  - `middleware.ts` — refreshes Supabase session cookie and gates `/`
  - `src/styles/` — plain CSS (`base.css`, `cafe.css`); legacy `modals.css`/`carcassonne.css`/`catan.css` survive for future revival
  - `tests/{unit,rpc,rls,e2e}/` — Vitest + Playwright suites
- `supabase/` — Supabase CLI workspace
  - `migrations/0001_init.sql` (schema + RLS), `0002_get_standings.sql` (RPC), `0003_handle_new_user.sql` (signup trigger)
  - `seed.sql` — "The Sunday Strategists" + 8 members + 51 matches
  - `tests/seed_known.sql` — deterministic fixture loaded by RPC tests
  - `config.toml` — local-dev config (email confirmation disabled)
- `scripts/gen_match_seed.mjs` — generator that translates `data.ts` MATCHES into seed SQL
- `docs/superpowers/{specs,plans}/` — design spec + implementation plan for the slice
- `.design/board-game-leaderboard/` — design handoff bundle (see above)

Legacy components (`CatanView`, `CarcassonneView`, `Modals`, `TopBar`) were removed during the slice because they consumed mock data that no longer exists. They live in git history (`git log --all -- web/src/components/`) and as prototypes in `.design/board-game-leaderboard/project/` — revive in future specs.

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
