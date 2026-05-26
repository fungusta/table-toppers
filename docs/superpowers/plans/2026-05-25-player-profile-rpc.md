# Player Profile RPC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `PlayerProfileModal`'s client-state stat derivation with a single Postgres RPC `get_player_profile(p_member_id uuid)` that returns a JSONB profile payload. Centralizes streak/by-game/fav logic between SQL and TS, and closes the cross-user freshness gap when the modal is opened before a navigation.

**Architecture:** One new `security invoker` RPC in migration `0007_get_player_profile.sql`, no new tables, no INSERT changes. Modal becomes a near-pure renderer; `HomeClient` gains a `supabase.rpc()` fetch effect keyed on `profileId` with an `AbortController`. Always all-time, pan-game — no `p_range` / `p_game` parameters.

**Tech Stack:** Next.js 15 App Router (React 18), TypeScript, `@supabase/ssr`, Supabase CLI (Docker), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-25-player-profile-rpc-design.md`. Read it before starting.

**Working directory:** Most commands run from `web/`. Supabase CLI commands run from repo root.

**File map**

| Path | Created/Modified | Responsibility |
|---|---|---|
| `supabase/migrations/0007_get_player_profile.sql` | Created | `get_player_profile(p_member_id uuid) returns jsonb`, grants |
| `web/src/lib/supabase/database.types.ts` | Regenerated | Picks up the new function signature |
| `web/src/data/data.ts` | Modified | Add `PlayerProfilePayload` type |
| `web/src/components/Modals.tsx` | Modified | `PlayerProfileModal` drops `matches` prop, renders from `profile`/`loading`/`error`; new `ProfileSkeleton` |
| `web/src/components/HomeClient.tsx` | Modified | Add fetch effect on `profileId` with `AbortController`; pass profile state into modal |
| `web/tests/rpc/get_player_profile.test.ts` | Created | Layer 1 — RPC correctness against `seed_known.sql` |
| `web/tests/rls/group_isolation.test.ts` | Modified | Layer 2 — cross-group profile returns null |
| `CLAUDE.md` | Modified | Project-status sentence about the new RPC |
| `docs/superpowers/NEXT.md` | Modified | Move item 2 to Recently Shipped |

**Commit cadence:** every Phase ends with a commit (`feat(profile):`, `test(profile):`, `refactor(profile):`, `docs(profile):`).

**Pre-flight:** `supabase start` running; `web/.env.local` + `.env.test` populated. Run `npm run test` once from `web/` to confirm baseline is green before starting.

---

## Phase 1 — Database

### Task 1: Migration 0007 — `get_player_profile` RPC

**Files:** Create `supabase/migrations/0007_get_player_profile.sql`.

- [ ] **Step 1: Header + function shell.**

```sql
-- =========================================================
-- 0007_get_player_profile.sql
--
-- Adds the `get_player_profile(p_member_id uuid)` RPC: returns a single
-- JSONB blob containing everything `PlayerProfileModal` needs to render —
-- hero stats, wins-by-game, fav game, last-10 W/L, head-to-head, recent
-- matches. Always all-time / pan-game; range and game filters are caller
-- concerns (the leaderboard's `range` / `tab` state does not propagate
-- into the profile).
--
-- `security invoker`: RLS on members / matches / match_players already
-- gates which rows the caller can see, so a caller who is not in the
-- target member's group naturally gets a null result. See spec
-- docs/superpowers/specs/2026-05-25-player-profile-rpc-design.md.
-- =========================================================

create or replace function public.get_player_profile(p_member_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_member       record;
  v_group_id     uuid;
  v_streak       int := 0;
  v_streak_row   record;
  v_payload      jsonb;
begin
  -- RLS-gated lookup. If the caller cannot see this member (different
  -- group, anon, etc.), the row is invisible and we return null.
  select id, group_id, display_name, handle, color, initials, joined_at
    into v_member
  from public.members
  where id = p_member_id;

  if v_member.id is null then
    return null;
  end if;
  v_group_id := v_member.group_id;

  -- Streak: trailing wins, ordered by (played_on desc, id desc). Inlined
  -- here because `streak_for` (migration 0002) takes a game/cutoff filter
  -- we don't want.
  for v_streak_row in
    select (m.winner_member_id = p_member_id) as is_win
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.group_id = v_group_id
      and mp.member_id = p_member_id
    order by m.played_on desc, m.id desc
  loop
    if v_streak_row.is_win then
      v_streak := v_streak + 1;
    else
      exit;
    end if;
  end loop;
```

- [ ] **Step 2: Build the payload with a single CTE chain.** Continue the function body:

```sql
  with player_matches as (
    select m.id, m.game_id, m.played_on, m.winner_member_id,
           (m.winner_member_id = p_member_id) as is_win
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    where m.group_id = v_group_id
      and mp.member_id = p_member_id
  ),
  hero as (
    select
      count(*)::int                                  as played,
      count(*) filter (where is_win)::int            as wins
    from player_matches
  ),
  by_game as (
    -- One row per real game id. Members with zero plays of a game still
    -- get a {wins:0, played:0} entry so the modal renders a uniform bar.
    select
      g.id as game_id,
      count(pm.id) filter (where pm.game_id = g.id)::int                    as played,
      count(pm.id) filter (where pm.game_id = g.id and pm.is_win)::int      as wins
    from (values ('catan'), ('carcassonne'), ('monopoly')) g(id)
    left join player_matches pm on true
    group by g.id
  ),
  fav as (
    select
      coalesce(
        (select bg.game_id
         from by_game bg
         order by bg.played desc, bg.game_id asc
         limit 1),
        'catan'
      ) as game_id
  ),
  last_10 as (
    select pm.is_win as won, pm.game_id, pm.played_on
    from player_matches pm
    order by pm.played_on desc, pm.id desc
    limit 10
  ),
  head_to_head as (
    select
      mp2.member_id as opponent_member_id,
      count(*)::int                                                                         as played,
      count(*) filter (where pm.is_win)::int                                                as a_wins,
      count(*) filter (where pm.winner_member_id = mp2.member_id)::int                      as b_wins
    from player_matches pm
    join public.match_players mp2 on mp2.match_id = pm.id and mp2.member_id <> p_member_id
    group by mp2.member_id
  ),
  recent_matches as (
    select pm.id as match_id, pm.game_id, pm.played_on, pm.is_win as won,
      (
        select coalesce(array_agg(mp3.member_id), array[]::uuid[])
        from public.match_players mp3
        where mp3.match_id = pm.id and mp3.member_id <> p_member_id
      ) as opponent_member_ids
    from player_matches pm
    order by pm.played_on desc, pm.id desc
    limit 8
  )
  select jsonb_build_object(
    'member', jsonb_build_object(
      'id', v_member.id,
      'group_id', v_member.group_id,
      'display_name', v_member.display_name,
      'handle', v_member.handle,
      'color', v_member.color,
      'initials', v_member.initials,
      'joined_at', v_member.joined_at
    ),
    'hero', (
      select jsonb_build_object(
        'wins', h.wins, 'played', h.played, 'streak', v_streak
      ) from hero h
    ),
    'by_game', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'game_id', bg.game_id, 'wins', bg.wins, 'played', bg.played
       ) order by bg.game_id) from by_game bg),
      '[]'::jsonb
    ),
    'fav_game', (select fav.game_id from fav),
    'last_10', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'won', l.won, 'game_id', l.game_id, 'played_on', l.played_on
       )) from last_10 l),
      '[]'::jsonb
    ),
    'head_to_head', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'opponent_member_id', h2h.opponent_member_id,
         'a_wins', h2h.a_wins,
         'b_wins', h2h.b_wins,
         'played', h2h.played
       ) order by h2h.played desc, h2h.opponent_member_id asc) from head_to_head h2h),
      '[]'::jsonb
    ),
    'recent', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'match_id', r.match_id,
         'game_id', r.game_id,
         'played_on', r.played_on,
         'won', r.won,
         'opponent_member_ids', to_jsonb(r.opponent_member_ids)
       )) from recent_matches r),
      '[]'::jsonb
    )
  )
  into v_payload;

  return v_payload;
end $$;
```

- [ ] **Step 3: Grants.**

```sql
revoke all on function public.get_player_profile(uuid) from public;
grant execute on function public.get_player_profile(uuid) to authenticated;
```

- [ ] **Step 4: Apply locally.** From repo root: `supabase db reset`. Expect no migration errors; the dev seed group still loads.

- [ ] **Step 5: Smoke test from the SQL prompt.**

```
docker exec -i supabase_db_table-topper psql -U postgres -d postgres -c "select public.get_player_profile((select id from public.members limit 1));"
```

Expect a JSONB blob whose `hero.played` is > 0 for any seeded member. Confirm `by_game` has 3 entries, `fav_game` is one of `catan|carcassonne|monopoly`, and `head_to_head` is a non-empty array for seeded members.

### Task 2: Regenerate types and add the TS payload interface

- [ ] **Step 1: Regenerate `database.types.ts`.** From `web/`: `npm run db:types`. Confirm the diff adds a `get_player_profile` entry under `Functions` with `Args: { p_member_id: string }` and `Returns: Json`.

- [ ] **Step 2: Add `PlayerProfilePayload` to `web/src/data/data.ts`.** Append after the existing `H2H` interface:

```ts
export interface PlayerProfileMember {
  id: string;
  group_id: string;
  display_name: string;
  handle: string | null;
  color: string;
  initials: string;
  joined_at: string;
}

export interface PlayerProfileByGame {
  game_id: RealGameId;
  wins: number;
  played: number;
}

export interface PlayerProfileLast10Entry {
  won: boolean;
  game_id: RealGameId;
  played_on: string;
}

export interface PlayerProfileH2H {
  opponent_member_id: string;
  a_wins: number;
  b_wins: number;
  played: number;
}

export interface PlayerProfileRecentMatch {
  match_id: string;
  game_id: RealGameId;
  played_on: string;
  won: boolean;
  opponent_member_ids: string[];
}

export interface PlayerProfilePayload {
  member: PlayerProfileMember;
  hero: { wins: number; played: number; streak: number };
  by_game: PlayerProfileByGame[];
  fav_game: RealGameId;
  last_10: PlayerProfileLast10Entry[];
  head_to_head: PlayerProfileH2H[];
  recent: PlayerProfileRecentMatch[];
}
```

- [ ] **Step 3: Commit.** `git add supabase/migrations/0007_get_player_profile.sql web/src/lib/supabase/database.types.ts web/src/data/data.ts && git commit -m "feat(profile): add get_player_profile RPC + payload type"`

---

## Phase 2 — Tests

### Task 3: Layer-1 RPC tests

**Files:** Create `web/tests/rpc/get_player_profile.test.ts`.

Use the same setup pattern as `web/tests/rpc/get_standings.test.ts` (reset + load `seed_known.sql`, use the admin client). The seed fixture gives us:

- Group `aaaa…` with members Alice (`bbbb…0001`), Bob (`…0002`), Cara (`…0003`).
- 6 matches, all 3 members in every match.
- Catan wins (date order): Cara 2026-04-01, Bob 2026-05-10, Alice 2026-05-18, Alice 2026-05-20.
- Carcassonne wins: Bob 2026-04-20, Cara 2026-05-15.

Per-player expectations (hand-counted):
- **Alice**: played 6, wins 2 (both catan). By-game: catan 2/4, carcassonne 0/2, monopoly 0/0. Fav: catan (4 played). Last-10 ordered desc: W (2026-05-20 catan), W (2026-05-18 catan), L (2026-05-15 carc), L (2026-05-10 catan), L (2026-04-20 carc), L (2026-04-01 catan). Streak: 2 (trailing two wins). H2H vs Bob: a_wins 2, b_wins 1, played 6. H2H vs Cara: a_wins 2, b_wins 2, played 6.
- **Bob**: played 6, wins 2 (1 catan, 1 carc). Streak: 0 (last result was a loss on 2026-05-20).
- **Cara**: played 6, wins 2. Streak: 0.

- [ ] **Step 1: Setup.** Copy the `beforeAll` from `web/tests/rpc/get_standings.test.ts` verbatim (db reset + seed_known). Reuse `URL`, `SVC`, `GROUP`, `ALICE`, `BOB`, `CARA` constants from `record_match.test.ts`.

- [ ] **Step 2: Core assertions.**

```ts
describe('get_player_profile RPC', () => {
  test('returns null for an unknown member id', async () => {
    const { data, error } = await admin.rpc('get_player_profile', {
      p_member_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test('returns full payload shape for Alice', async () => {
    const { data, error } = await admin.rpc('get_player_profile', {
      p_member_id: ALICE,
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const p = data as any;
    expect(p.member.id).toBe(ALICE);
    expect(p.member.display_name).toBe('Alice');
    expect(p.hero).toEqual({ wins: 2, played: 6, streak: 2 });
  });

  test('by_game has all three real games even when unplayed', async () => {
    const { data } = await admin.rpc('get_player_profile', { p_member_id: ALICE });
    const byGame = (data as any).by_game as Array<{ game_id: string; wins: number; played: number }>;
    expect(byGame.map(b => b.game_id).sort()).toEqual(['carcassonne', 'catan', 'monopoly']);
    const m = Object.fromEntries(byGame.map(b => [b.game_id, b]));
    expect(m.catan).toEqual({ game_id: 'catan', wins: 2, played: 4 });
    expect(m.carcassonne).toEqual({ game_id: 'carcassonne', wins: 0, played: 2 });
    expect(m.monopoly).toEqual({ game_id: 'monopoly', wins: 0, played: 0 });
  });

  test('fav_game ties resolve alphabetically; default catan when empty', async () => {
    // Alice has catan (4 played) > carcassonne (2) > monopoly (0). Fav: catan.
    const { data } = await admin.rpc('get_player_profile', { p_member_id: ALICE });
    expect((data as any).fav_game).toBe('catan');
  });

  test('last_10 ordered by played_on desc and limited', async () => {
    const { data } = await admin.rpc('get_player_profile', { p_member_id: ALICE });
    const l10 = (data as any).last_10 as Array<{ won: boolean; played_on: string }>;
    expect(l10.length).toBe(6); // seed has 6 matches total for Alice
    const dates = l10.map(e => e.played_on);
    expect([...dates].sort().reverse()).toEqual(dates); // monotonically desc
    expect(l10[0].won).toBe(true);
    expect(l10[1].won).toBe(true);
    expect(l10[2].won).toBe(false);
  });

  test('streak counts trailing wins as of the most recent match', async () => {
    // Bob's most recent match (2026-05-20 catan) was lost → streak 0.
    const { data: bob } = await admin.rpc('get_player_profile', { p_member_id: BOB });
    expect((bob as any).hero.streak).toBe(0);
  });

  test('head_to_head shape and ordering by played desc', async () => {
    const { data } = await admin.rpc('get_player_profile', { p_member_id: ALICE });
    const h2h = (data as any).head_to_head as Array<{ opponent_member_id: string; a_wins: number; b_wins: number; played: number }>;
    expect(h2h.length).toBe(2);
    const byOpp = Object.fromEntries(h2h.map(r => [r.opponent_member_id, r]));
    expect(byOpp[BOB]).toMatchObject({ a_wins: 2, b_wins: 1, played: 6 });
    expect(byOpp[CARA]).toMatchObject({ a_wins: 2, b_wins: 2, played: 6 });
    for (const row of h2h) {
      expect(row.a_wins + row.b_wins).toBeLessThanOrEqual(row.played);
    }
  });

  test('recent is limited to 8 with opponents excluding self', async () => {
    const { data } = await admin.rpc('get_player_profile', { p_member_id: ALICE });
    const recent = (data as any).recent as Array<{ opponent_member_ids: string[] }>;
    expect(recent.length).toBe(6);
    for (const r of recent) {
      expect(r.opponent_member_ids).not.toContain(ALICE);
      expect(r.opponent_member_ids.sort()).toEqual([BOB, CARA].sort());
    }
  });
});
```

- [ ] **Step 3: Run the suite.** From `web/`: `npm run test -- get_player_profile`. Expect all 8 tests green. The `db reset` is shared with the rest of the rpc/ suite so it'll add ~10s to the run.

### Task 4: Layer-2 RLS isolation

**Files:** Modify `web/tests/rls/group_isolation.test.ts`.

- [ ] **Step 1: Add two `test()` blocks inside the existing `describe('RLS group isolation', …)`** (just before the `// ----- invites visibility` section is fine):

```ts
test("get_player_profile under user A for a member in user B's group returns null", async () => {
  // Grab a member id from userB's isolated group via admin (RLS would
  // otherwise block userA from reading it).
  const { data: bMembers } = await admin
    .from('members')
    .select('id')
    .eq('group_id', ctx.userB.groupId)
    .limit(1);
  const bMemberId = bMembers?.[0]?.id;
  expect(bMemberId).toBeTruthy();

  const a = asUser(ctx.userA.jwt);
  const { data, error } = await (a.rpc as any)('get_player_profile', {
    p_member_id: bMemberId,
  });
  expect(error).toBeNull();
  expect(data).toBeNull();
});

test('get_player_profile under user A for a member in their own group returns non-null', async () => {
  const { data: aMembers } = await admin
    .from('members')
    .select('id')
    .eq('group_id', ctx.userA.groupId)
    .limit(1);
  const aMemberId = aMembers?.[0]?.id;
  expect(aMemberId).toBeTruthy();

  const a = asUser(ctx.userA.jwt);
  const { data, error } = await (a.rpc as any)('get_player_profile', {
    p_member_id: aMemberId,
  });
  expect(error).toBeNull();
  expect(data).not.toBeNull();
  expect((data as any).member.id).toBe(aMemberId);
});
```

- [ ] **Step 2: Run.** From `web/`: `npm run test -- group_isolation`. Expect all existing tests + the two new ones green.

- [ ] **Step 3: Commit.** `git add web/tests/ && git commit -m "test(profile): cover get_player_profile RPC and RLS isolation"`

---

## Phase 3 — Client refactor

### Task 5: `PlayerProfileModal` becomes a payload-driven renderer

**Files:** Modify `web/src/components/Modals.tsx`.

- [ ] **Step 1: Update imports and prop types.**

Change the imports from `@/data/data` to add `PlayerProfilePayload`, drop `Match`, drop `headToHead`. Keep `Player`, `GameId`, `RealGameId`, `GAMES`, `playerById`, `fmtDate`.

Update the props interface:

```tsx
interface PlayerProfileModalProps {
  playerId: string | null;
  players: Player[];
  profile: PlayerProfilePayload | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  theme: GameId;
  onPickPlayer: (id: string) => void;
}
```

- [ ] **Step 2: Replace the `useMemo` block with payload reads.** The new body:

```tsx
export function PlayerProfileModal({
  playerId, players, profile, loading, error, onClose, theme, onPickPlayer,
}: PlayerProfileModalProps) {
  const open = !!playerId;
  if (!open) return null;

  // Loading + error states share the shell.
  if (!profile || loading) {
    return (
      <ModalShell
        open={open}
        onClose={onClose}
        theme={theme}
        size="lg"
        title="Player record"
      >
        {error
          ? <div className="pp-empty">Couldn't load profile: {error}</div>
          : <ProfileSkeleton />}
      </ModalShell>
    );
  }

  const player = players.find(p => p.id === profile.member.id);
  if (!player) {
    return (
      <ModalShell open={open} onClose={onClose} theme={theme} size="lg" title="Player record">
        <div className="pp-empty">Player not in current roster.</div>
      </ModalShell>
    );
  }

  const winRate = profile.hero.played > 0
    ? Math.round((profile.hero.wins / profile.hero.played) * 100)
    : 0;
```

- [ ] **Step 3: Replace the JSX body** so each block reads off `profile` instead of the old `data`:

```tsx
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      theme={theme}
      size="lg"
      title={`${player.name}'s record`}
      subtitle={`@${player.handle} · joined ${player.joined}`}
    >
      <div className="pp-grid">
        <div className="pp-hero">
          <div className="pp-avatar" style={{ background: player.color }}>
            {player.initials}
          </div>
          <div className="pp-hero-stats">
            <div className="pp-hstat"><span>{profile.hero.wins}</span><i>total wins</i></div>
            <div className="pp-hstat"><span>{profile.hero.played}</span><i>games played</i></div>
            <div className="pp-hstat"><span>{winRate}%</span><i>win rate</i></div>
            <div className="pp-hstat"><span>{profile.hero.streak}</span><i>current streak</i></div>
          </div>
        </div>

        <div className="pp-section">
          <h4>Wins by game</h4>
          <div className="pp-bygame">
            {REAL_GAMES.map(g => {
              const row = profile.by_game.find(b => b.game_id === g);
              const w = row?.wins ?? 0;
              const p = row?.played ?? 0;
              const pct = p ? (w / p) * 100 : 0;
              return (
                <div key={g} className="pp-bygame-row">
                  <div className="pp-bygame-name">
                    {GAMES[g].label}
                    {profile.fav_game === g && <span className="pp-fav">★ favorite</span>}
                  </div>
                  <div className="pp-bygame-bar">
                    <div
                      className="pp-bygame-fill"
                      style={{ width: `${pct}%`, background: player.color }}
                    />
                  </div>
                  <div className="pp-bygame-num">{w}/{p}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pp-section">
          <h4>Recent form (last 10)</h4>
          <div className="pp-form">
            {profile.last_10.map((r, i) => (
              <div
                key={i}
                className={`pp-form-cell ${r.won ? "pp-form-w" : "pp-form-l"}`}
                title={`${r.won ? "Won" : "Lost"} ${GAMES[r.game_id].label} · ${fmtDate(r.played_on)}`}
              >
                {r.won ? "W" : "L"}
              </div>
            ))}
            {profile.last_10.length === 0 && <div className="pp-empty">No games yet</div>}
          </div>
        </div>

        <div className="pp-section pp-section-h2h">
          <h4>Head to head</h4>
          <div className="pp-h2h">
            {profile.head_to_head.map(r => {
              const other = players.find(p => p.id === r.opponent_member_id);
              if (!other) return null;
              const total = r.a_wins + r.b_wins;
              const aPct = total ? (r.a_wins / total) * 100 : 50;
              return (
                <div key={r.opponent_member_id} className="pp-h2h-row" onClick={() => onPickPlayer(r.opponent_member_id)}>
                  <div className="pp-h2h-name">vs {other.name}</div>
                  <div className="pp-h2h-bar">
                    <div className="pp-h2h-a" style={{ width: `${aPct}%`, background: player.color }}>
                      <span>{r.a_wins}</span>
                    </div>
                    <div className="pp-h2h-b" style={{ background: other.color }}>
                      <span>{r.b_wins}</span>
                    </div>
                  </div>
                  <div className="pp-h2h-total">{r.played} total</div>
                </div>
              );
            })}
            {profile.head_to_head.length === 0 && <div className="pp-empty">No shared matches</div>}
          </div>
        </div>

        <div className="pp-section pp-section-recent">
          <h4>Recent matches</h4>
          <ul className="pp-recent">
            {profile.recent.map(m => (
              <li
                key={m.match_id}
                className={"pp-recent-row " + (m.won ? "pp-won" : "pp-lost")}
              >
                <span className="pp-recent-result">{m.won ? "W" : "L"}</span>
                <span className="pp-recent-game">{GAMES[m.game_id].label}</span>
                <span className="pp-recent-date">{fmtDate(m.played_on)}</span>
                <span className="pp-recent-opps">
                  {m.opponent_member_ids
                    .map(oid => players.find(p => p.id === oid)?.name)
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ModalShell>
  );
}
```

- [ ] **Step 4: Add `ProfileSkeleton` subcomponent** just above `PlayerProfileModal`:

```tsx
function ProfileSkeleton() {
  return (
    <div className="pp-grid pp-skeleton" aria-busy="true">
      <div className="pp-hero">
        <div className="pp-avatar" style={{ background: 'var(--skeleton, #2a2f36)' }} />
        <div className="pp-hero-stats">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="pp-hstat">
              <span style={{ visibility: 'hidden' }}>00</span>
              <i style={{ visibility: 'hidden' }}>placeholder</i>
            </div>
          ))}
        </div>
      </div>
      <div className="pp-section"><h4>Loading…</h4></div>
    </div>
  );
}
```

(No new stylesheet changes required; the existing `pp-*` classes do the heavy lifting and the skeleton reuses them with visibility tricks. If polish demands a shimmer, add a `pp-skeleton` rule to `web/src/styles/modals.css` later — out of scope for this slice.)

### Task 6: `HomeClient` orchestrates the fetch

**Files:** Modify `web/src/components/HomeClient.tsx`.

- [ ] **Step 1: Add imports.**

```tsx
import { createClient } from "@/lib/supabase/client";
import type { PlayerProfilePayload } from "@/data/data";
```

- [ ] **Step 2: Add state and the fetch effect** right under the existing `useState` declarations:

```tsx
const [profile, setProfile] = useState<PlayerProfilePayload | null>(null);
const [profileLoading, setProfileLoading] = useState(false);
const [profileError, setProfileError] = useState<string | null>(null);

useEffect(() => {
  if (!profileId) {
    setProfile(null);
    setProfileError(null);
    return;
  }
  const ctrl = new AbortController();
  setProfileLoading(true);
  setProfileError(null);
  (async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .rpc('get_player_profile', { p_member_id: profileId })
      .abortSignal(ctrl.signal);
    if (ctrl.signal.aborted) return;
    if (error) {
      setProfileError(error.message);
      setProfile(null);
    } else {
      setProfile((data as unknown) as PlayerProfilePayload | null);
    }
    setProfileLoading(false);
  })();
  return () => ctrl.abort();
}, [profileId]);
```

- [ ] **Step 3: Wire the new props into `<PlayerProfileModal>`.** Replace the existing usage:

```tsx
<PlayerProfileModal
  playerId={profileId}
  players={players}
  profile={profile}
  loading={profileLoading}
  error={profileError}
  onClose={() => setProfileId(null)}
  theme={tab}
  onPickPlayer={setProfileId}
/>
```

- [ ] **Step 4: Verify the dev server boots.** From `web/`: `npm run dev`. Open the leaderboard, click a player avatar — the modal should appear, briefly show the skeleton, then render the same numbers as before. Try clicking through head-to-head rows; rapid clicks should not flash stale data.

- [ ] **Step 5: TypeScript check.** From `web/`: `npm run build`. Expect no type errors. The `Json` return from `supabase.rpc('get_player_profile', …)` is cast to `PlayerProfilePayload | null` at the assignment site; that cast lives in `HomeClient` and is documented inline.

- [ ] **Step 6: Commit.** `git add web/src/ && git commit -m "refactor(profile): render PlayerProfileModal from get_player_profile RPC"`

---

## Phase 4 — Docs + verification

### Task 7: Update CLAUDE.md and NEXT.md

- [ ] **Step 1: `CLAUDE.md` project-status paragraph.** Append a sentence at the end of the "Project status" paragraph in `@CLAUDE.md:7`:

> `PlayerProfileModal` now renders from a `get_player_profile` RPC (migration `0007_get_player_profile.sql`) rather than client-state matches, fixing cross-user freshness when the modal opens before a navigation.

- [ ] **Step 2: `CLAUDE.md` repo-layout migrations list.** In the `migrations/` bullet at `@CLAUDE.md:74`, append `, 0007_get_player_profile.sql (player profile RPC)`.

- [ ] **Step 3: `docs/superpowers/NEXT.md`.** Remove the "## 2. Player profile real stats" section. Prepend a new bullet to the "Recently shipped" list near the top:

> - **Player profile real stats.** `get_player_profile(p_member_id uuid) returns jsonb` in migration `0007_get_player_profile.sql`. `PlayerProfileModal` is now a payload-driven renderer; `HomeClient` fetches via `supabase.rpc()` with an `AbortController` keyed on `profileId`. Always all-time / pan-game; range/game-aware variants deferred. Layer-1 coverage in `web/tests/rpc/get_player_profile.test.ts` and Layer-2 in `web/tests/rls/group_isolation.test.ts`. The `headToHead` helper in `@web/src/data/data.ts` is now unused — listed for removal under Smaller cleanups.

- [ ] **Step 4: Append `headToHead` to NEXT.md's "Smaller cleanups" list.**

> - **Unused `headToHead` export in `data.ts`.** Replaced by the SQL-side head-to-head computation in `get_player_profile`. Safe to remove.

### Task 8: Full verification pass

- [ ] **Step 1: Test suite.** From `web/`: `npm run test`. Expect all suites green (unit + rpc + rls). RPC + RLS tests reset the DB; total runtime ~30s.

- [ ] **Step 2: Production build.** From `web/`: `npm run build`. Expect a clean build, no type errors.

- [ ] **Step 3: Lint.** From `web/`: `npm run lint`. Expect no new warnings beyond the existing baseline.

- [ ] **Step 4: Commit.** `git add CLAUDE.md docs/ && git commit -m "docs(profile): update CLAUDE.md and NEXT.md for get_player_profile RPC"`

---

## Done definition

- [ ] Migration `0007_get_player_profile.sql` applies cleanly via `supabase db reset`.
- [ ] `npm run test` green from `web/` including new RPC + RLS tests.
- [ ] `npm run build` green.
- [ ] `PlayerProfileModal` no longer reads `matches: Match[]`; its only data source is the `profile` prop populated by the RPC.
- [ ] Opening the modal in dev shows a skeleton briefly, then the same numbers as before.
- [ ] `CLAUDE.md` and `NEXT.md` updated.

## Pointers for the executor

- `@docs/superpowers/specs/2026-05-25-player-profile-rpc-design.md:1-200` — design doc; consult Section 5 (DB schema and RPC) when writing the migration.
- `@supabase/migrations/0004_match_writes.sql:35-104` — reference for grants / revokes pattern, even though this RPC is `security invoker` not `definer`.
- `@supabase/migrations/0005_get_standings_anchor.sql:81-95` — reference for the fav-game tie-break.
- `@web/tests/rpc/get_standings.test.ts:1-31` — copy this `beforeAll` block verbatim.
- `@web/tests/rls/group_isolation.test.ts:108-180` — pattern for cross-group RPC tests (especially the `record_match` cross-group test that uses admin to fetch ids RLS would otherwise hide).
- `@web/src/components/Modals.tsx:56-211` — the file/section the refactor targets.
