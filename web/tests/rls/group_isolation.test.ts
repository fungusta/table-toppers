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

  test("user A cannot record_match into user B's group", async () => {
    // userA is a legitimate member of their own group, but tries to insert
    // into userB's. The RPC's explicit group-membership check should reject.
    const a = asUser(ctx.userA.jwt);

    // Need a member id that exists in userB's group. Fetch via admin since
    // RLS blocks userA from reading members of userB's group.
    const { data: bMembers } = await admin
      .from('members')
      .select('id')
      .eq('group_id', ctx.userB.groupId)
      .limit(1);
    const bMemberId = bMembers?.[0]?.id;
    expect(bMemberId).toBeTruthy();

    const { data: aMembers } = await admin
      .from('members')
      .select('id')
      .eq('group_id', ctx.userA.groupId)
      .limit(1);
    const aMemberId = aMembers?.[0]?.id;
    expect(aMemberId).toBeTruthy();

    const { error } = await (a.rpc as any)('record_match', {
      p_group_id: ctx.userB.groupId,
      p_game_id: 'catan',
      p_played_on: '2026-05-25',
      p_winner_member_id: bMemberId,
      p_member_ids: [bMemberId, aMemberId],
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not a member of group/i);
  });

  test('direct INSERT into matches is blocked by RLS for non-members', async () => {
    // Even bypassing the RPC, the matches_insert policy must refuse cross-group
    // writes from userA into userB's group.
    const a = asUser(ctx.userA.jwt);
    const { error } = await a.from('matches').insert({
      group_id: ctx.userB.groupId,
      game_id: 'catan',
      played_on: '2026-05-25',
    });
    expect(error).not.toBeNull();
  });

  // ----- get_player_profile isolation (added with 0007_get_player_profile.sql) -----

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

  // ----- invites visibility (added with 0006_groups_invites.sql) -----

  test("non-owner member cannot select invites for another group", async () => {
    // Provision an invite in userA's group via admin (userA is owner of their
    // own group per provisionUserInIsolatedGroup). Then assert userB (also an
    // owner — but of a different group) cannot read it.
    await admin.from('invites').insert({
      group_id: ctx.userA.groupId,
      code: `RLS${Date.now().toString(36).toUpperCase().slice(-5)}`,
      created_by: ctx.userA.id,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const b = asUser(ctx.userB.jwt);
    const { data } = await b
      .from('invites')
      .select('*')
      .eq('group_id', ctx.userA.groupId);
    expect(data ?? []).toHaveLength(0);
  });

  test("unauthenticated client cannot select invites", async () => {
    await admin.from('invites').insert({
      group_id: ctx.userA.groupId,
      code: `RLS${Date.now().toString(36).toUpperCase().slice(-5)}A`,
      created_by: ctx.userA.id,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data } = await anon.from('invites').select('*');
    expect(data ?? []).toHaveLength(0);
  });

  test('a code is a bearer token: outsider can accept_invite if they have the code', async () => {
    // This pins the bearer-token semantics as intentional, not a bug.
    // Spec §10 calls it out explicitly. If it ever flips, that's a deliberate
    // change that needs a new spec.
    const code = `BR${Date.now().toString(36).toUpperCase().slice(-6)}`;
    await admin.from('invites').insert({
      group_id: ctx.userA.groupId,
      code,
      created_by: ctx.userA.id,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    // userB has no prior relationship to userA's group.
    const b = asUser(ctx.userB.jwt);
    const { data: joined, error } = await (b.rpc as any)('accept_invite', { p_code: code });
    expect(error).toBeNull();
    expect(joined).toBe(ctx.userA.groupId);
    // userB now has a group_members row in userA's group.
    const { data: gm } = await admin
      .from('group_members')
      .select('role')
      .eq('group_id', ctx.userA.groupId)
      .eq('user_id', ctx.userB.id)
      .single();
    expect(gm?.role).toBe('member');
  });
});
