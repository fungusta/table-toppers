# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

`web/` is scaffolded (Next.js 15 App Router, React 18, TypeScript, plain CSS under `src/styles/`). No Supabase project, no `ios/`, no tests, no lint config beyond `next lint` defaults. The "planned architecture" below is still aspirational — verify before assuming any Supabase table, RLS policy, or iOS file exists.

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
  - `src/app/` — routes (`layout.tsx`, `page.tsx`)
  - `src/components/` — React components (currently `CafeView`, `Modals`, `TopBar`)
  - `src/data/` — in-memory mock data (`data.ts`) until Supabase lands
  - `src/styles/` — plain CSS (`base.css`, `cafe.css`, `modals.css`); no Tailwind yet despite the architecture diagram
- `.design/board-game-leaderboard/` — design handoff bundle (see above)

Planned but not yet present:
- `ios/` — SwiftUI Xcode project
- `supabase/` — migrations, RLS policies, Edge Function source, seed data (managed via Supabase CLI)

## Commands

From `web/`:
- `npm run dev` — Next dev server
- `npm run build` — production build
- `npm run lint` — `next lint`
- `npm start` — serve the built app

No test runner is configured yet. No Supabase CLI config exists yet. iOS surface doesn't exist.

Update this section the moment new scripts (tests, Supabase, iOS build) land — don't let it drift.
