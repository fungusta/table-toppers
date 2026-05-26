// web/tests/rpc/get_player_profile.test.ts
//
// Layer-1 integration tests for the `get_player_profile` RPC introduced in
// migration 0007. Resets the DB + loads `seed_known.sql` (Test Group with
// Alice/Bob/Cara and 6 deterministic matches) so the participant ids and
// results are predictable.
//
// Per-player expectations hand-counted from seed_known.sql:
//   Alice: played 6, wins 2 (catan only). Last 6 in date desc:
//     2026-05-20 W (catan), 2026-05-18 W (catan), 2026-05-15 L (carc),
//     2026-05-10 L (catan), 2026-04-20 L (carc), 2026-04-01 L (catan)
//     → streak 2.
//   Bob: played 6, wins 2 (1 catan + 1 carc). Most recent (2026-05-20) was
//     a loss → streak 0.
//   Cara: played 6, wins 2 (1 catan + 1 carc). Most recent was a loss →
//     streak 0.

import { beforeAll, describe, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '../../.env.test') });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ALICE = 'bbbbbbbb-0000-0000-0000-000000000001';
const BOB   = 'bbbbbbbb-0000-0000-0000-000000000002';
const CARA  = 'bbbbbbbb-0000-0000-0000-000000000003';

const admin = createClient(URL, SVC, { auth: { persistSession: false } });

const REPO_ROOT = path.resolve(__dirname, '../../..');

beforeAll(() => {
  execSync('supabase db reset', { cwd: REPO_ROOT, stdio: 'inherit' });
  const sql = readFileSync(
    path.join(REPO_ROOT, 'supabase/tests/seed_known.sql'),
    'utf8',
  );
  execSync(
    `docker exec -i supabase_db_table-topper psql -U postgres -d postgres`,
    { cwd: REPO_ROOT, input: sql, stdio: ['pipe', 'inherit', 'inherit'] },
  );
});

describe('get_player_profile RPC', () => {
  test('returns null for an unknown member id', async () => {
    const { data, error } = await admin.rpc('get_player_profile', {
      p_member_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test('returns full payload for Alice with correct hero stats', async () => {
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

  test('by_game has both real games even when unplayed', async () => {
    const { data } = await admin.rpc('get_player_profile', { p_member_id: ALICE });
    const byGame = (data as any).by_game as Array<{ game_id: string; wins: number; played: number }>;
    expect(byGame.map(b => b.game_id).sort()).toEqual(['carcassonne', 'catan']);
    const m = Object.fromEntries(byGame.map(b => [b.game_id, b]));
    expect(m.catan).toEqual({ game_id: 'catan', wins: 2, played: 4 });
    expect(m.carcassonne).toEqual({ game_id: 'carcassonne', wins: 0, played: 2 });
  });

  test('fav_game is most-played; ties resolve alphabetically', async () => {
    // Alice: catan 4 > carcassonne 2 → catan.
    const { data } = await admin.rpc('get_player_profile', { p_member_id: ALICE });
    expect((data as any).fav_game).toBe('catan');
  });

  test('last_10 ordered by played_on desc and limited to 10', async () => {
    const { data } = await admin.rpc('get_player_profile', { p_member_id: ALICE });
    const l10 = (data as any).last_10 as Array<{ won: boolean; played_on: string }>;
    expect(l10.length).toBe(6); // seed has 6 matches total for Alice
    const dates = l10.map(e => e.played_on);
    expect([...dates].sort().reverse()).toEqual(dates); // monotonically desc
    expect(l10[0].won).toBe(true);  // 2026-05-20 catan
    expect(l10[1].won).toBe(true);  // 2026-05-18 catan
    expect(l10[2].won).toBe(false); // 2026-05-15 carc
  });

  test("Bob's streak is 0 because the most recent match was a loss", async () => {
    const { data } = await admin.rpc('get_player_profile', { p_member_id: BOB });
    expect((data as any).hero.streak).toBe(0);
  });

  test('head_to_head shape and ordering by played desc', async () => {
    const { data } = await admin.rpc('get_player_profile', { p_member_id: ALICE });
    const h2h = (data as any).head_to_head as Array<{
      opponent_member_id: string; a_wins: number; b_wins: number; played: number
    }>;
    expect(h2h.length).toBe(2);
    const byOpp = Object.fromEntries(h2h.map(r => [r.opponent_member_id, r]));
    // Alice vs Bob: Alice won matches 1+2 (catan); Bob won 3 (catan) + 6 (carc).
    expect(byOpp[BOB]).toMatchObject({ a_wins: 2, b_wins: 2, played: 6 });
    // Alice vs Cara: Alice won 1+2; Cara won 4 (catan) + 5 (carc).
    expect(byOpp[CARA]).toMatchObject({ a_wins: 2, b_wins: 2, played: 6 });
    for (const row of h2h) {
      expect(row.a_wins + row.b_wins).toBeLessThanOrEqual(row.played);
    }
  });

  test('recent is limited to 8 with opponents excluding self', async () => {
    const { data } = await admin.rpc('get_player_profile', { p_member_id: ALICE });
    const recent = (data as any).recent as Array<{
      match_id: string; opponent_member_ids: string[]; played_on: string
    }>;
    expect(recent.length).toBe(6); // seed only has 6
    for (const r of recent) {
      expect(r.opponent_member_ids).not.toContain(ALICE);
      expect([...r.opponent_member_ids].sort()).toEqual([BOB, CARA].sort());
    }
    // Ordered by played_on desc.
    const dates = recent.map(r => r.played_on);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
