# What's Next

Living priority list for Table Topper after the Supabase vertical slice landed (branch `supabase-vertical-slice`, ending at commit `8bddda5`).

Each top-level item is sized as its own spec → plan → implementation cycle. Order is roughly the suggested sequence, but they're loosely independent and can be reshuffled.

**Recently shipped** (no longer in this list):

- **Player profile real stats.** `get_player_profile(p_member_id uuid) returns jsonb` in migration `0007_get_player_profile.sql` (`security invoker`; RLS on `members`/`matches`/`match_players` does the authorization). `PlayerProfileModal` is now a payload-driven renderer with loading skeleton + error tile; `HomeClient` lazy-loads via `supabase.rpc('get_player_profile', ...)` with an `AbortController` keyed on `profileId` so rapid head-to-head clicks don't render stale data. Always all-time / pan-game; range and game-aware variants deferred (non-breaking to add later). Layer-1 coverage in `web/tests/rpc/get_player_profile.test.ts` (8 cases: shape, hero, by-game with zero-play games, fav tie-break, last-10 ordering, streak, h2h, recent), Layer-2 in `web/tests/rls/group_isolation.test.ts` (cross-group returns null + own-group returns non-null). The `headToHead` helper in `web/src/data/data.ts` is now unused — listed for removal under Smaller cleanups.
- **Group creation + invites.** `invites` table + four security-definer RPCs in migration `0006_groups_invites.sql` (`create_group`, `create_invite`, `peek_invite`, `accept_invite`). New routes `/groups/new`, `/g/[group_id]/`, `/g/[group_id]/manage`, `/join/[code]`. `?next=` round-trip through `/signin` and `/signup` (with leading-slash open-redirect guard). Middleware now allowlists `/join/*`. `TopBar` gains a `GroupSwitcher` dropdown. Invite codes are 8-char Crockford base32, single-use, 7-day TTL. Layer-1 (`web/tests/rpc/groups_invites.test.ts`), Layer-2 (invite visibility cases + bearer-token semantics in `web/tests/rls/group_isolation.test.ts`), Layer-3 (`web/tests/e2e/groups_invites.spec.ts`) all cover the flow. Migration `0008_drop_seed_group_auto_join.sql` removes the `handle_new_user` auto-join trigger so new sign-ups land in zero groups; the `/` redirector forwards them to `/groups/new`.
- **Write path — recording matches for real.** `record_match` RPC (`security definer`, atomic two-table insert, group-membership-checked) lives in migration `0004_match_writes.sql`; `recordMatch` server action at `web/src/app/actions/record-match.ts` wraps it; `HomeClient.handleRecord` is async and uses the DB-assigned id; `RecordMatchModal` defaults to today and surfaces server errors. Layer-1 RPC test (`web/tests/rpc/record_match.test.ts`) and Layer-2 RLS test (cross-group write block in `web/tests/rls/group_isolation.test.ts`) cover it. Layer-3 Playwright extension is still pending.
- **`get_standings` date anchor.** Migration `0005_get_standings_anchor.sql` replaces the hardcoded `2026-05-23` with `coalesce(max(played_on), current_date)` per group (option C), matching the TS `rangeCutoff` helper.

---

## 1. Per-game curated stats (spec differentiator)

**Status:** `CatanView` and `CarcassonneView` currently render the same generic shape as `CafeView` filtered to one game. The product differentiator (per the spec at `docs/superpowers/specs/...`) was supposed to be game-specific stats — longest road wins for Catan, completed cities for Carcassonne, etc.

**What this spec needs:**
- `match_stats` JSONB column on `matches` (or per-game stat tables; spec calls out both options).
- Per-game `*_stat` columns surfaced in the record modal (game-aware extra fields appear when game = catan vs carcassonne).
- Custom RPCs or views: `get_catan_stats(group_id, range)`, etc., that aggregate the JSONB.
- Redesign `CatanView` / `CarcassonneView` to surface these stats instead of mirror the cafe table.

This is the largest of the remaining specs and worth decomposing further (one game at a time, Catan first per the original product brief).

---

## 2. Production deployment

**Status:** Stack runs entirely locally. No hosted Supabase project, no Vercel project, no production env vars.

**What this spec needs:**
- Hosted Supabase project; `supabase db push` applies migrations.
- Vercel project linked to GitHub; env vars (`NEXT_PUBLIC_SUPABASE_URL`, anon key) wired in Vercel dashboard.
- `supabase/config.toml` production override for `enable_confirmations = true` + custom SMTP (Resend) for email delivery.
- A `production` migration that seeds the games table but **not** the dev-only "Sunday Strategists" group. (The `handle_new_user` auto-join trigger was already dropped in `0008_drop_seed_group_auto_join.sql`.)
- Password reset and email verification flows (currently disabled in dev).
- CI: GitHub Actions running `npm run build` + the full test matrix from item 5's CI sketch in the slice plan.

---

## 3. iOS client (SwiftUI)

**Status:** `ios/` does not exist. CLAUDE.md still lists it as planned.

**Scope:**
- New `ios/` directory with an Xcode project.
- `supabase-swift` for auth + queries; shares the RPC contract (`get_standings`) with web.
- Read-only first slice mirroring `/` — sign in, see standings.
- Subsequent specs add the same write paths web has.

This is its own multi-spec track and shouldn't block web progress.

---

## 4. Realtime updates

**Status:** Writes land in the DB now, but users on the same group only see new matches after they navigate or refresh.

**Spec:** Subscribe via Supabase Realtime to `matches` filtered to `group_id`. On insert, either invalidate the server-rendered page (`router.refresh()`) or hot-patch the `matches` array in `HomeClient` state. The latter is faster but skips RLS re-evaluation; the former is the safer default.

---

## Smaller cleanups (don't need their own spec)

- **Layer-3 Playwright coverage for record-match.** Add a sibling spec (e.g. `record_match.spec.ts`) that signs up, creates a group via `/groups/new`, then clicks Record, fills the modal, submits, and asserts the new row in the History modal / standings table. Skipped during the write-path slice because the e2e harness wasn't loaded; can no longer piggyback on `signup_and_view.spec.ts` now that new sign-ups land on `/groups/new` rather than a seeded leaderboard.
- **Unused `headToHead` export in `web/src/data/data.ts`.** Replaced by the SQL-side head-to-head computation in `get_player_profile`. Safe to remove along with the `H2H` interface.
- **`vitest.config.ts` `as any` cast.** Drop once Vitest's `InlineConfig` type exposes `poolOptions` properly, or migrate the `poolOptions` shape to whatever Vitest 4 actually accepts.
- **`db:types` script.** Currently runs `supabase gen types typescript --local > src/...`. After item 4 lands, add a separate script for the hosted project so deploys keep types fresh.
- **Match `id` shape.** Widened from `number` to `string` for Supabase UUIDs. If you ever want stable ordering of matches by id (none of the current code does), introduce a `seq bigserial` column.
- **Legacy `useEffect` body-class toggling in `HomeClient`.** Works but causes a flash on first paint because the server renders with `theme-cafe` baked in by `layout.tsx`. Move the body class to a server-derived `data-theme` attribute on `<html>` once we wire the URL searchparams back in.
- **`docs/superpowers/plans/2026-05-24-supabase-vertical-slice.md`** still describes the slim CafeViewClient. Either annotate it with a "see commit 359f92b for restoration" pointer or fold the restoration into the plan history. Optional; not load-bearing.

---

## How to use this file

When starting work on any item above:

1. Run `superpowers:brainstorming` for that item to nail the design.
2. Then `superpowers:writing-plans` to produce a task-by-task plan.
3. Then `superpowers:subagent-driven-development` or `executing-plans` to implement.
4. When the item ships, remove its section from this file and append a one-line note to `CLAUDE.md`'s "Project status" describing what's now available.

If priorities shift, edit this file directly — it's the working backlog, not a frozen spec.
