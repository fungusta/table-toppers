# What's Next

Living priority list for Table Topper after the Supabase vertical slice landed (branch `supabase-vertical-slice`, ending at commit `8bddda5`).

Each top-level item is sized as its own spec → plan → implementation cycle. Order is roughly the suggested sequence, but they're loosely independent and can be reshuffled.

---

## 1. Write path — recording matches for real

**Status:** UI exists (`RecordMatchModal`), state is local-only and disappears on page reload.

**What this spec needs to deliver:**
- Server Action (`recordMatch`) that inserts a `matches` row + N `match_players` rows in a single transaction (Postgres function with `security definer` if RLS-insert turns out to be awkward across two tables).
- Write-side RLS policies: `matches_insert` and `match_players_insert` gated on `is_group_member(group_id)`.
- `players` array in the modal restricted to members of the signed-in user's group (already true with current data shape).
- Optimistic update + revalidation: either `revalidatePath('/')` after submit, or hand back the new row and prepend in client state.
- Replace `crypto.randomUUID()` placeholder in `HomeClient.handleRecord` with the real server-assigned id.
- Update the spec's hardcoded date in `get_standings` (see item 4) so newly recorded matches aren't silently filtered out of "all time".

**Touches:** `web/src/components/HomeClient.tsx`, `web/src/components/Modals.tsx` (submit handler), new `web/src/app/actions/record-match.ts`, new migration `0004_match_write_rls.sql`.

**Tests:**
- Layer 1: vitest integration that records a match via the action, asserts row in DB.
- Layer 2: RLS test — userA cannot insert a match into userB's group.
- Layer 3: Playwright extension of `signup_and_view.spec.ts` to click Record, fill, submit, see new row.

---

## 2. `get_standings` date anchor

**Status:** RPC hardcodes `v_today := date '2026-05-23'` to match the seed data's newest match. This will silently break the "week" / "month" range filters as time advances past late June 2026.

**Fix paths (pick one in its spec):**
- **A.** Switch to `current_date`. Requires reseeding with current dates (or accepting that `range='week'` returns empty on seed data because all matches are old).
- **B.** Accept an optional `p_today date default current_date` parameter so callers can override for tests / demos.
- **C.** Compute the anchor inside the RPC as `select max(played_on) from matches where group_id = p_group_id` and offset from that.

Recommend **C**: matches the TS-side helper `rangeCutoff(matches, range)` in `web/src/data/data.ts`, so the SQL and TS computations agree.

**Touches:** `supabase/migrations/0005_get_standings_anchor.sql` (new migration replacing the function body), `web/tests/rpc/get_standings.test.ts` (update expected fixture-derived values).

---

## 3. Group creation + invites

**Status:** Schema is multi-group from day one; every signup auto-joins "The Sunday Strategists". There's no UI for creating a fresh group or joining an existing one.

**What this spec needs:**
- `groups_insert` RLS policy: any authenticated user may create a group.
- `group_members_insert` RLS: only group owners can add new members.
- `invites` table: `(group_id, code text unique, created_by, expires_at, used_by, used_at)`.
- Routes: `/groups/new` (create), `/groups/[id]` (manage / invite), `/join?code=...` (accept invite, requires sign-in).
- Modify `handle_new_user` trigger: stop auto-joining the seed group (or gate on a `?from_invite=...` query). The seed group becomes the dev fixture, not the default landing for new users.
- `HomeClient` / `TopBar`: group switcher dropdown when user has >1 group.

**Touches:** new migration, new routes under `web/src/app/groups/` and `web/src/app/join/`, new modal or page for invite generation, `TopBar.tsx` for group switcher.

---

## 4. Per-game curated stats (spec differentiator)

**Status:** `CatanView` and `CarcassonneView` currently render the same generic shape as `CafeView` filtered to one game. The product differentiator (per the spec at `docs/superpowers/specs/...`) was supposed to be game-specific stats — longest road wins for Catan, completed cities for Carcassonne, etc.

**What this spec needs:**
- `match_stats` JSONB column on `matches` (or per-game stat tables; spec calls out both options).
- Per-game `*_stat` columns surfaced in the record modal (game-aware extra fields appear when game = catan vs carcassonne).
- Custom RPCs or views: `get_catan_stats(group_id, range)`, etc., that aggregate the JSONB.
- Redesign `CatanView` / `CarcassonneView` to surface these stats instead of mirror the cafe table.

This is the largest of the remaining specs and worth decomposing further (one game at a time, Catan first per the original product brief).

---

## 5. Player profile real stats

**Status:** `PlayerProfileModal` works against the matches array currently in client state, which means it shows correct numbers for the seed data but won't include matches recorded by other users in real time.

**After item 1 ships:** add `revalidatePath('/')` (or realtime, see item 8) so the profile sees fresh data. Optional refactor: move the profile's stat computations into a `get_player_profile(member_id)` RPC to centralize logic between TS and SQL.

---

## 6. Production deployment

**Status:** Stack runs entirely locally. No hosted Supabase project, no Vercel project, no production env vars.

**What this spec needs:**
- Hosted Supabase project; `supabase db push` applies migrations.
- Vercel project linked to GitHub; env vars (`NEXT_PUBLIC_SUPABASE_URL`, anon key) wired in Vercel dashboard.
- `supabase/config.toml` production override for `enable_confirmations = true` + custom SMTP (Resend) for email delivery.
- A `production` migration that seeds the games table but **not** the dev-only "Sunday Strategists" group (depends on item 3 to remove the auto-join trigger first).
- Password reset and email verification flows (currently disabled in dev).
- CI: GitHub Actions running `npm run build` + the full test matrix from item 7's CI sketch in the slice plan.

---

## 7. iOS client (SwiftUI)

**Status:** `ios/` does not exist. CLAUDE.md still lists it as planned.

**Scope:**
- New `ios/` directory with an Xcode project.
- `supabase-swift` for auth + queries; shares the RPC contract (`get_standings`) with web.
- Read-only first slice mirroring `/` — sign in, see standings.
- Subsequent specs add the same write paths web has.

This is its own multi-spec track and shouldn't block web progress.

---

## 8. Realtime updates

**Status:** Once writes land (item 1), users on the same group will only see new matches after they navigate or refresh.

**Spec:** Subscribe via Supabase Realtime to `matches` filtered to `group_id`. On insert, either invalidate the server-rendered page (`router.refresh()`) or hot-patch the `matches` array in `HomeClient` state. The latter is faster but skips RLS re-evaluation; the former is the safer default.

---

## Smaller cleanups (don't need their own spec)

- **`vitest.config.ts` `as any` cast.** Drop once Vitest's `InlineConfig` type exposes `poolOptions` properly, or migrate the `poolOptions` shape to whatever Vitest 4 actually accepts.
- **`db:types` script.** Currently runs `supabase gen types typescript --local > src/...`. After item 6 lands, add a separate script for the hosted project so deploys keep types fresh.
- **Match `id` shape.** Widened from `number` to `string` for Supabase UUIDs. If you ever want stable ordering of matches by id (none of the current code does), introduce a `seq bigserial` column.
- **Legacy `useEffect` body-class toggling in `HomeClient`.** Works but causes a flash on first paint because the server renders with `theme-cafe` baked in by `layout.tsx`. Move the body class to a server-derived `data-theme` attribute on `<html>` once we wire the URL searchparams back in (item 4 likely touches this).
- **`docs/superpowers/plans/2026-05-24-supabase-vertical-slice.md`** still describes the slim CafeViewClient. Either annotate it with a "see commit 359f92b for restoration" pointer or fold the restoration into the plan history. Optional; not load-bearing.

---

## How to use this file

When starting work on any item above:

1. Run `superpowers:brainstorming` for that item to nail the design.
2. Then `superpowers:writing-plans` to produce a task-by-task plan.
3. Then `superpowers:subagent-driven-development` or `executing-plans` to implement.
4. When the item ships, remove its section from this file and append a one-line note to `CLAUDE.md`'s "Project status" describing what's now available.

If priorities shift, edit this file directly — it's the working backlog, not a frozen spec.
