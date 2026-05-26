# Table Topper

A board-game leaderboard for friend groups.

Record matches, see who's on top, and drill into per-game curated stats — a CATAN tab that knows about longest road, a Carcassonne tab that knows about meeples, etc. — layered on top of a generic "who won, when" record.

## What it does

- **Groups + invites.** Any signed-in user can create a group, generate single-use invite codes, and share a join link.
- **Match recording.** Log who played, who won, and when — atomic and group-scoped.
- **Leaderboard.** Standings per group, with a player profile drill-down for head-to-head and recent history.
- **Per-game tabs.** Generic standings plus curated views for specific games (CATAN, Carcassonne) that surface stats unique to each.
- **Multi-group support.** Switch between every group you belong to from the top bar.

## Tech stack

- **Web:** Next.js 15 (App Router), React 18, TypeScript.
- **Backend:** Supabase — Postgres with row-level security, Auth, and Edge Functions as an escape hatch.
- **Tests:** Vitest for unit + RPC + RLS integration, Playwright for end-to-end.
- **iOS (planned):** SwiftUI talking to the same Supabase backend via `supabase-swift`.
