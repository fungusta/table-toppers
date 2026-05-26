// web/tests/rpc/record_match.test.ts
//
// Layer-1 integration tests for the `record_match` RPC introduced in
// migration 0004. Resets the DB + loads `seed_known.sql` (Test Group with
// Alice/Bob/Cara) so the participant ids are deterministic.
//
// We need an authenticated session (the RPC reads `auth.uid()`), so we
// provision an ephemeral user via the admin client, attach them to the
// Test Group, and then call the RPC under that user's JWT.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '../../.env.test') });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const GROUP = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ALICE = 'bbbbbbbb-0000-0000-0000-000000000001';
const BOB = 'bbbbbbbb-0000-0000-0000-000000000002';
const CARA = 'bbbbbbbb-0000-0000-0000-000000000003';

const REPO_ROOT = path.resolve(__dirname, '../../..');

const admin = createClient(URL, SVC, { auth: { persistSession: false } });

let userId: string;
let asUser: ReturnType<typeof createClient>;

beforeAll(async () => {
  execSync('supabase db reset', { cwd: REPO_ROOT, stdio: 'inherit' });
  const sql = readFileSync(
    path.join(REPO_ROOT, 'supabase/tests/seed_known.sql'),
    'utf8',
  );
  execSync(
    `docker exec -i supabase_db_table-topper psql -U postgres -d postgres`,
    { cwd: REPO_ROOT, input: sql, stdio: ['pipe', 'inherit', 'inherit'] },
  );

  // Provision an auth user attached to the Test Group so auth.uid() resolves.
  const email = `rec-${Date.now()}@example.com`;
  const password = 'correct-horse-battery';
  const { data: created, error: e1 } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: 'Recorder' },
  });
  if (e1 || !created.user) throw e1 ?? new Error('createUser failed');
  userId = created.user.id;

  const { error: e2 } = await admin.from('group_members').insert({
    group_id: GROUP,
    user_id: userId,
    role: 'owner',
  });
  if (e2) throw e2;

  const userClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: signed, error: e3 } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (e3 || !signed.session) throw e3 ?? new Error('signIn failed');
  asUser = createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${signed.session.access_token}` } },
  });
}, 120_000);

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe('record_match RPC', () => {
  test('inserts a match row and the participant rows in one transaction', async () => {
    const { data: matchId, error } = await (asUser.rpc as any)('record_match', {
      p_group_id: GROUP,
      p_game_id: 'catan',
      p_played_on: '2026-05-25',
      p_winner_member_id: ALICE,
      p_member_ids: [ALICE, BOB, CARA],
    });
    expect(error).toBeNull();
    expect(typeof matchId).toBe('string');

    const { data: row } = await admin
      .from('matches')
      .select('id, group_id, game_id, played_on, winner_member_id, created_by')
      .eq('id', matchId as string)
      .single();
    expect(row).toMatchObject({
      group_id: GROUP,
      game_id: 'catan',
      played_on: '2026-05-25',
      winner_member_id: ALICE,
      created_by: userId,
    });

    const { data: parts } = await admin
      .from('match_players')
      .select('member_id')
      .eq('match_id', matchId as string);
    const ids = (parts ?? []).map(p => p.member_id).sort();
    expect(ids).toEqual([ALICE, BOB, CARA].sort());
  });

  test('rejects when winner is not in the player list', async () => {
    const { error } = await (asUser.rpc as any)('record_match', {
      p_group_id: GROUP,
      p_game_id: 'catan',
      p_played_on: '2026-05-25',
      p_winner_member_id: ALICE,
      p_member_ids: [BOB, CARA],
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/winner must be one of/i);
  });

  test('rejects when fewer than 2 players are listed', async () => {
    const { error } = await (asUser.rpc as any)('record_match', {
      p_group_id: GROUP,
      p_game_id: 'catan',
      p_played_on: '2026-05-25',
      p_winner_member_id: ALICE,
      p_member_ids: [ALICE],
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/at least 2 players/i);
  });

  test('rejects unknown game id', async () => {
    const { error } = await (asUser.rpc as any)('record_match', {
      p_group_id: GROUP,
      p_game_id: 'pandemic',
      p_played_on: '2026-05-25',
      p_winner_member_id: ALICE,
      p_member_ids: [ALICE, BOB],
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/unknown game/i);
  });
});
