# Player Profile RPC — Design

**Date:** 2026-05-25
**Status:** Draft, ready for plan
**Scope:** Move `PlayerProfileModal`'s stat computation off the client-state `matches` array onto a new `get_player_profile(member_id)` Postgres RPC. Centralizes wins/streak/fav logic between SQL (`get_standings`) and TS, fixes the cross-user freshness gap when the modal is opened before a navigation, and enables future lazy-loading without shipping every match to the client. Per-game curated stats (item 1 in `NEXT.md`) and realtime push (item 5) remain out of scope.

---

## 1. Goal

When a signed-in user clicks a player avatar/row anywhere in the app, the resulting profile modal renders stats sourced from a single live Postgres call rather than from whatever `matches` array happens to be in `HomeClient` state at that moment. The stats displayed are unchanged from today's UI:

- Hero block: total wins, games played, win-rate %, current streak.
- Wins-by-game bars (catan / carcassonne / monopoly).
- Favorite game (most-played) marker.
- Recent form: last 10 matches as W/L cells.
- Head-to-head: every opponent the player has shared a match with, with `a_wins / b_wins / played`.
- Recent matches: 8 most recent with opponents listed.

Behaviorally:
- Profile is **always all-time and pan-game**, regardless of the leaderboard's current `range` and `game` tab. (Today's behavior; explicitly preserved — see Section 2.)
- Modal opens immediately with a loading skeleton; the fetch starts on open.
- Clicking an opponent in head-to-head re-fires the RPC with that opponent's id (existing flow, just routed through the loader).

The slice does **not** add range/game filters to the profile, does not introduce realtime subscriptions, and does not migrate `MatchHistoryModal` off the client `matches` array (history still reads from props — item 5 will revisit).

## 2. Decisions locked during brainstorm

| Decision | Choice | Why |
|---|---|---|
| Payload shape | **A1**: single JSONB blob returned by one RPC | The profile contains 5 nested collections (hero scalars, by-game rows, last-10 list, head-to-head rows, recent-match rows). A `returns table` shape can't express that without contortions or N round-trips; JSONB lets one query produce one row of the full payload. Sets a precedent that per-game curated stats (item 1) can follow. |
| Range / game filter | **B2**: always all-time, pan-game; no `p_range` / `p_game` params | Profile is a person-level identity drill-down, not a filtered slice of the leaderboard. Today's UI behavior, and removing parameters later would break callers; we can add them as optional defaults if a future spec wants filter-honoring profiles. |
| RPC security mode | **C1**: `security invoker` (matches `get_standings`) | RLS on `members` / `matches` / `match_players` already gates which rows the caller can see. A `security invoker` function naturally returns nothing when the caller has no business looking at the target member. No need for the `auth.uid()` + explicit membership check that `record_match` / `create_invite` do (those are writes that need `security definer`). |
| Data-fetch transport | **D1**: client-side `supabase.rpc('get_player_profile', …)` from `HomeClient`, not a Next.js Server Action | Reads don't need `revalidatePath` and Server Actions add an RSC round-trip with no upside. supabase-js from the browser is the canonical pattern for transient interactive reads and is what realtime (item 5) will need anyway. |
| Member identity | **E1**: RPC takes `p_member_id uuid` only; derives `group_id` from the member row | A `members.id` is globally unique (uuid PK), and the member already knows its group. Forcing the caller to pass `(member_id, group_id)` adds redundancy and a footgun (mismatched pair). |
| Opponent labels in payload | **F1**: payload returns `opponent_member_ids` only; client resolves names via existing `players` prop | The modal already receives `players: Player[]` for the head-to-head onPickPlayer flow. Duplicating display names into the RPC payload bloats responses with data the client already has. |
| Cancel-on-close | **G1**: AbortController in the fetch effect; ignore stale resolves | Standard React pattern. Without it, rapid-fire opponent clicks (or close-then-reopen) can resolve a stale fetch over a fresh one. |
| Loading UX | **H1**: render the modal shell with a skeleton (avatar dot, stat-block placeholders) on open while fetching | Closer to today's "modal appears instantly" feel than an outside spinner; avoids layout shift when data arrives. |

## 3. Runtime topology

```
Browser
  │
  ▼
HomeClient (client component)
  │
  │  user clicks player → setProfileId(id)
  │
  ▼
useEffect on profileId:
  • if id is null: clear profile state
  • else: kick off supabase.rpc('get_player_profile', { p_member_id: id })
          using AbortController; on resolve, write to local state
  │
  ▼
PlayerProfileModal
  • props: profile | null, loading: boolean, error: string | null
  • renders skeleton while loading
  • renders error tile on error
  • renders today's layout from `profile` on success
                                                                │
                                                                ▼
                                                       Supabase
                                                       └── get_player_profile(p_member_id) RPC (new)
                                                              └── reads members / matches / match_players
                                                                  filtered by the caller's RLS
```

No new Server Actions, no new routes.

## 4. Component changes

### `web/src/components/Modals.tsx`

- `PlayerProfileModalProps` drops `matches: Match[]`. Adds:
  - `profile: PlayerProfilePayload | null`
  - `loading: boolean`
  - `error: string | null`
- The internal `useMemo` that derived `wins / byGame / playedByGame / fav / streak / last10 / h2h / recent` is **deleted**. The render reads those fields straight off `profile`.
- `players: Player[]` stays — used to render head-to-head and recent-match opponent names from the `opponent_member_ids` returned by the RPC.
- A new `ProfileSkeleton` subcomponent renders the modal shell's body shape (hero block + 3 section placeholders) when `loading && !profile`. Reuses existing `pp-*` CSS classes with a `pp-skeleton` modifier; no new stylesheet section unless polish demands it.

### `web/src/components/HomeClient.tsx`

- Add state: `const [profile, setProfile] = useState<PlayerProfilePayload | null>(null)`, `const [profileLoading, setProfileLoading] = useState(false)`, `const [profileError, setProfileError] = useState<string | null>(null)`.
- New effect keyed on `profileId`:
  - When `profileId` flips to non-null: set loading, clear error, fire `supabase.rpc('get_player_profile', { p_member_id: profileId })` with an `AbortController`.
  - When it resolves successfully and the effect hasn't been cleaned up, store the payload.
  - On error, store the error message.
  - On cleanup (profileId changes / modal closes): abort the in-flight request.
- `setProfileId(null)` (modal close) clears `profile` immediately to avoid a flash of stale data on next open.
- Pass `profile`, `profileLoading`, `profileError` into `PlayerProfileModal`.
- The `matches` prop continues to feed `MatchHistoryModal` and `Cafe/Catan/CarcassonneView`; only the profile path changes.

### `web/src/lib/supabase/client.ts`

No change. We use the existing browser-side factory. If a typed helper feels warranted, a small `web/src/lib/profile.ts` exports `fetchPlayerProfile(supabase, memberId, signal): Promise<PlayerProfilePayload | null>` to keep `HomeClient` slim — optional convenience, not required.

### `web/src/data/data.ts`

- Add a `PlayerProfilePayload` TypeScript type mirroring the JSONB shape from Section 5. This is the hand-written interface that the generated `Json` return type from `database.types.ts` gets cast to in the fetch helper.
- `headToHead` helper in `@web/src/data/data.ts:137` becomes **unused** by the profile path. Decision: leave it in place; it has no callers after the refactor but removing it is a separate cleanup (the helper is small and not load-bearing). Document the unused-ness in the migration plan; if a stale-imports lint fires, drop the export.

## 5. Database schema and RPC

No new tables. One new migration: `supabase/migrations/0007_get_player_profile.sql`.

### Function signature

```sql
create function public.get_player_profile(p_member_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
```

Grants: `revoke all from public`; `grant execute to authenticated`.

### Returned JSONB shape

```jsonc
{
  "member": {
    "id": "<uuid>",
    "group_id": "<uuid>",
    "display_name": "Alex",
    "handle": "alex",
    "color": "#aa00ff",
    "initials": "AT",
    "joined_at": "2025-01-15"
  },
  "hero": {
    "wins": 24,
    "played": 51,
    "streak": 3
  },
  "by_game": [
    { "game_id": "catan", "wins": 10, "played": 20 },
    { "game_id": "carcassonne", "wins": 8, "played": 18 },
    { "game_id": "monopoly", "wins": 6, "played": 13 }
  ],
  "fav_game": "catan",
  "last_10": [
    { "won": true, "game_id": "catan", "played_on": "2026-05-22" },
    { "won": false, "game_id": "monopoly", "played_on": "2026-05-20" }
  ],
  "head_to_head": [
    {
      "opponent_member_id": "<uuid>",
      "a_wins": 5,
      "b_wins": 3,
      "played": 8
    }
  ],
  "recent": [
    {
      "match_id": "<uuid>",
      "game_id": "catan",
      "played_on": "2026-05-22",
      "won": true,
      "opponent_member_ids": ["<uuid>", "<uuid>"]
    }
  ]
}
```

### Semantics

- If the caller cannot see the target member (RLS filter), the function returns `null`. Caller treats `null` as "not found / not authorized" and renders an error tile.
- `hero.played` = count of distinct matches where the member appears in `match_players`.
- `hero.wins` = count of those where `matches.winner_member_id = p_member_id`.
- `hero.streak` = trailing wins ordered by `(played_on desc, matches.id desc)`. Matches `streak_for` semantics in `@c:\Users\Ryzen\Projects\table-topper\supabase\migrations\0002_get_standings.sql:4-32`, just inlined here for one member with no game/cutoff filtering.
- `by_game` has one entry per real game id (`catan`, `carcassonne`, `monopoly`). A game with zero plays still appears with `wins: 0, played: 0` so the modal can render an empty bar without conditional logic.
- `fav_game` = the `game_id` with max `played`; ties broken alphabetically (`catan` first), defaulting to `catan` when the member has zero matches. Mirrors `get_standings`'s tie-break in `@c:\Users\Ryzen\Projects\table-topper\supabase\migrations\0005_get_standings_anchor.sql:81-95`.
- `last_10` is ordered `played_on desc, matches.id desc`, limited to 10.
- `head_to_head` includes one row per opponent the member has at least one shared match with, ordered by `played desc` (matches TS sort in `@c:\Users\Ryzen\Projects\table-topper\web\src\components\Modals.tsx:88-91`). `a_wins` = wins by the profile owner against that opponent; `b_wins` = wins by the opponent against the profile owner (only counting matches both played in). Draws (neither won) are not currently representable in our schema — `winner_member_id` is always set on insert — so the count is unambiguous today; if draws ever land they'd need a separate field.
- `recent` is ordered `played_on desc, matches.id desc`, limited to 8. `opponent_member_ids` excludes `p_member_id`.

### Why `security invoker`

The function only reads from tables that already have SELECT RLS policies (`members`, `matches`, `match_players`). A caller who is not in the target member's group sees those rows as nonexistent, so the function naturally returns `null` (no member row found). This is exactly the behavior we want, with no `auth.uid()` plumbing inside the function. (Compare with `record_match`, which must be `security definer` because INSERT RLS on `matches` would otherwise block the multi-table transaction.)

## 6. Test coverage

Following the layered pattern established by `get_standings` and `record_match` (see `@c:\Users\Ryzen\Projects\table-topper\web\tests\`).

### Layer 1 — RPC unit tests

New file `web/tests/rpc/get_player_profile.test.ts`. Loads the deterministic `supabase/tests/seed_known.sql` fixture and asserts:

1. **Returns a non-null payload** for a known member id.
2. **Returns null** for a uuid that doesn't exist.
3. **Hero stats** (`wins`, `played`) match a hand-counted expectation from the fixture.
4. **Streak** matches a member whose recent matches are a known W/W/L sequence (asserting streak = 2).
5. **By-game** has exactly 3 entries (`catan`, `carcassonne`, `monopoly`) regardless of whether the member has played all three; a member with zero monopoly matches returns `{ wins: 0, played: 0 }` for it.
6. **Fav-game** ties broken alphabetically (insert a member who's played catan and carcassonne exactly once each; expect `catan`).
7. **Last-10 ordering** is `played_on desc, id desc` and limited to 10.
8. **Head-to-head** only includes opponents with ≥ 1 shared match; ordered by `played desc`; `a_wins + b_wins ≤ played` for every row (the leq accommodates the future-draws case).
9. **Recent** is limited to 8 entries with correct `opponent_member_ids` excluding the profile owner.

### Layer 2 — RLS isolation test

Extend `web/tests/rls/group_isolation.test.ts`:

- A user in group A calling `get_player_profile(member_id_in_group_B)` receives `null`. (Two `members` rows in two groups; user A's bearer token; assert the result is null, not an error.)
- A user in group A calling `get_player_profile(member_id_in_group_A)` receives a non-null payload — sanity check.

### Layer 3 — E2E

Skip Playwright for this slice. The integration is small (modal renders RPC output), already covered transitively by `signup_and_view.spec.ts`'s player-modal-open click if it's there, and adding a profile-specific spec is better bundled with the `record-match` Playwright extension noted in `NEXT.md`'s "Smaller cleanups".

### Layer 0 — TS unit

No new unit tests. `data.ts`'s `headToHead` helper becomes unused but is not modified, so its existing unit coverage (if any) stays valid. The modal becomes a near-pure renderer of the RPC payload; the smallest sensible test (mount with a hand-built payload, assert hero numbers render) is optional and skipped unless the plan author wants it.

## 7. Migration

`supabase/migrations/0007_get_player_profile.sql` — single file, function-only, idempotent on `create or replace`. No rollback migration needed; dropping the function is `drop function public.get_player_profile(uuid)`.

After the migration lands, regenerate types:

```
npm run db:types
```

The `Json` return type from `database.types.ts` gets cast to `PlayerProfilePayload` at the fetch site; the cast is documented in the helper.

## 8. Open questions / out of scope

- **Range / game-aware profile.** If product later wants the profile to honor the leaderboard's filter, add optional `p_range text default 'all'` and `p_game text default 'cafe'` parameters and propagate them through the CTEs. Non-breaking.
- **Opponent display names in payload.** If a future iOS client doesn't have a parallel `players` array client-side, the RPC can be extended to embed `display_name` / `color` / `initials` on each h2h / recent row. Adds payload weight; deferred until iOS forces the issue.
- **Draws.** Schema currently requires `winner_member_id` on insert. If draws land, `head_to_head` gains a `draws` field. Out of scope.
- **`headToHead` helper cleanup.** Becomes unused after the refactor. Removing it is a follow-up cleanup, listed under `NEXT.md`'s "Smaller cleanups" section once this ships.

## 9. CLAUDE.md / NEXT.md updates after ship

- `NEXT.md`: remove item 2 ("Player profile real stats") from the active list; append a one-line "Recently shipped" bullet noting `0007_get_player_profile.sql` + the modal refactor.
- `CLAUDE.md`'s "Project status" paragraph: append a sentence — "`PlayerProfileModal` now renders from a `get_player_profile` RPC (migration `0007`) rather than client-state matches."
- `CLAUDE.md`'s "Repo layout" `migrations/` line: add `0007_get_player_profile.sql (player profile RPC)`.
