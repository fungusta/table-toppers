// web/tests/rpc/get_standings.test.ts
import { beforeAll, describe, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '../../.env.test') });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GROUP = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const admin = createClient(URL, SVC, { auth: { persistSession: false } });

const REPO_ROOT = path.resolve(__dirname, '../../..');

beforeAll(() => {
  // Reset DB + seed (dev seed), then layer the known test fixture on top.
  execSync('supabase db reset', { cwd: REPO_ROOT, stdio: 'inherit' });
  const sql = readFileSync(
    path.join(REPO_ROOT, 'supabase/tests/seed_known.sql'),
    'utf8',
  );
  // Execute via docker exec into the supabase_db container (psql not on host PATH).
  execSync(
    `docker exec -i supabase_db_table-topper psql -U postgres -d postgres`,
    { cwd: REPO_ROOT, input: sql, stdio: ['pipe', 'inherit', 'inherit'] },
  );
});

describe('get_standings', () => {
  test('all-time, cafe — 3 rows, each won 2', async () => {
    const { data, error } = await admin.rpc('get_standings', {
      p_group_id: GROUP, p_game: 'cafe', p_range: 'all',
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(3);
    const byName = Object.fromEntries(data!.map((r: any) => [r.display_name, r]));
    expect(byName['Alice'].wins).toBe(2);
    expect(byName['Bob'].wins).toBe(2);
    expect(byName['Cara'].wins).toBe(2);
    expect(byName['Alice'].played).toBe(6);
  });

  test('range=week is anchored on max(played_on)=2026-05-20 → cutoff 2026-05-13', async () => {
    // Migration 0005 replaced the hardcoded today with `max(played_on)` per
    // group. With the seed_known fixture the newest match is 2026-05-20, so
    // the week window [2026-05-13, 2026-05-20] includes:
    //   - Alice 2026-05-20 catan win
    //   - Alice 2026-05-18 catan win
    //   - Cara  2026-05-15 carcassonne win
    const { data } = await admin.rpc('get_standings', {
      p_group_id: GROUP, p_game: 'cafe', p_range: 'week',
    });
    const byName = Object.fromEntries(data!.map((r: any) => [r.display_name, r]));
    expect(byName['Alice'].wins).toBe(2);
    expect(byName['Bob'].wins).toBe(0);
    expect(byName['Cara'].wins).toBe(1);
  });

  test('p_game=catan zeroes carc columns', async () => {
    const { data } = await admin.rpc('get_standings', {
      p_group_id: GROUP, p_game: 'catan', p_range: 'all',
    });
    for (const row of data!) {
      expect(row.carc_wins).toBe(0);
      expect(row.carc_played).toBe(0);
    }
  });

  test('streak counts trailing wins as of last played match', async () => {
    const { data } = await admin.rpc('get_standings', {
      p_group_id: GROUP, p_game: 'cafe', p_range: 'all',
    });
    const byName = Object.fromEntries(data!.map((r: any) => [r.display_name, r]));
    // Alice in date order: L,L,L,L,W,W → streak 2
    expect(byName['Alice'].streak).toBe(2);
    // Bob: L,W,L,L,L,L → streak 0
    expect(byName['Bob'].streak).toBe(0);
  });

  test('fav_game is most-played; ties resolve alphabetically', async () => {
    const { data } = await admin.rpc('get_standings', {
      p_group_id: GROUP, p_game: 'cafe', p_range: 'all',
    });
    for (const row of data!) {
      expect(row.fav_game).toBe('catan');
    }
  });
});
