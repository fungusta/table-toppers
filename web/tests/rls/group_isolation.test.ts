// web/tests/rls/group_isolation.test.ts
//
// Asserts that the database itself (via RLS), not the client, prevents users from
// reading other groups' data. Two ephemeral auth users are provisioned by the admin
// (service-role) client; the auto-join trigger lands them in the seed group, so we
// delete those rows before creating per-test isolated groups.

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: path.resolve(__dirname, '../../.env.test') });

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL, SVC, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type ProvisionedUser = {
  id: string;
  email: string;
  jwt: string;
  groupId: string;
};

async function provisionUserInIsolatedGroup(suffix: string): Promise<ProvisionedUser> {
  const email = `t-${Date.now()}-${suffix}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = 'correct-horse-battery';

  const { data: created, error: e1 } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `Test ${suffix}` },
  });
  if (e1 || !created.user) throw e1 ?? new Error('createUser returned no user');
  const userId = created.user.id;

  // The handle_new_user trigger auto-joined this user to the seed group;
  // rip those rows out so we can put them in an isolated group.
  await admin.from('group_members').delete().eq('user_id', userId);
  await admin.from('members').delete().eq('user_id', userId);

  const groupId = randomUUID();
  const { error: e2 } = await admin.from('groups').insert({ id: groupId, name: `iso-${suffix}-${Date.now()}` });
  if (e2) throw e2;
  const { error: e3 } = await admin.from('group_members').insert({
    group_id: groupId,
    user_id: userId,
    role: 'owner',
  });
  if (e3) throw e3;
  const { error: e4 } = await admin.from('members').insert({
    group_id: groupId,
    user_id: userId,
    display_name: `Test ${suffix}`,
    color: '#000000',
    initials: 'TS',
  });
  if (e4) throw e4;

  // Seed one match in this isolated group so cross-reads have something to find.
  const matchId = randomUUID();
  await admin.from('matches').insert({
    id: matchId,
    group_id: groupId,
    game_id: 'catan',
    played_on: '2026-05-01',
  });

  // Sign in to capture the user's anon JWT.
  const userClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: signed, error: e5 } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (e5 || !signed.session) throw e5 ?? new Error('signIn returned no session');

  return { id: userId, email, jwt: signed.session.access_token, groupId };
}

function asUser(jwt: string) {
  return createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

let ctx: { userA: ProvisionedUser; userB: ProvisionedUser };

beforeEach(async () => {
  ctx = {
    userA: await provisionUserInIsolatedGroup('A'),
    userB: await provisionUserInIsolatedGroup('B'),
  };
}, 60_000);

afterEach(async () => {
  if (ctx?.userA) await admin.auth.admin.deleteUser(ctx.userA.id);
  if (ctx?.userB) await admin.auth.admin.deleteUser(ctx.userB.id);
}, 30_000);

describe('RLS group isolation', () => {
  test("user A cannot read user B's matches", async () => {
    const a = asUser(ctx.userA.jwt);
    const { data } = await a.from('matches').select('*').eq('group_id', ctx.userB.groupId);
    expect(data ?? []).toHaveLength(0);
  });

  test("user A cannot read user B's members", async () => {
    const a = asUser(ctx.userA.jwt);
    const { data } = await a.from('members').select('*').eq('group_id', ctx.userB.groupId);
    expect(data ?? []).toHaveLength(0);
  });

  test("get_standings under user A for user B's group returns []", async () => {
    const a = asUser(ctx.userA.jwt);
    const { data } = await a.rpc('get_standings', {
      p_group_id: ctx.userB.groupId,
      p_game: 'cafe',
      p_range: 'all',
    });
    expect(data ?? []).toHaveLength(0);
  });

  test('unauthenticated client cannot select matches', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data } = await anon.from('matches').select('*');
    expect(data ?? []).toHaveLength(0);
  });
});
