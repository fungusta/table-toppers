// web/tests/rpc/groups_invites.test.ts
//
// Layer-1 coverage for the four invite RPCs added in 0006_groups_invites.sql:
// create_group, create_invite, peek_invite, accept_invite.

import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(__dirname, '../../.env.test') });

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const REPO_ROOT = path.resolve(__dirname, '../../..');
const admin = createClient(URL, SVC, { auth: { persistSession: false } });

beforeAll(() => {
  // Reset schema so all migrations including 0006 are present.
  execSync('supabase db reset', { cwd: REPO_ROOT, stdio: 'inherit' });
}, 120_000);

interface SignedUpUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

const provisioned: string[] = [];

async function signUpUser(suffix: string): Promise<SignedUpUser> {
  const email = `t-${Date.now()}-${suffix}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = 'correct-horse-battery';

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `Test ${suffix}` },
  });
  if (error || !created.user) throw error ?? new Error('createUser returned no user');
  const userId = created.user.id;
  provisioned.push(userId);

  const userClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInError } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;

  return { id: userId, email, client: userClient };
}

afterEach(async () => {
  while (provisioned.length) {
    const id = provisioned.pop()!;
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
}, 30_000);

beforeEach(() => {
  // No-op; provisioned cleanup happens in afterEach.
});

describe('create_group', () => {
  test('returns a uuid; owner edge + creator member + ghost members exist', async () => {
    const owner = await signUpUser('cg1');
    const { data: gid, error } = await owner.client.rpc('create_group', {
      p_name: 'TG',
      p_ghosts: [{ display_name: 'Ghost', color: '#abc', initials: 'GH' }] as never,
    });
    expect(error).toBeNull();
    expect(gid).toMatch(/^[0-9a-f-]{36}$/);

    const { data: gm } = await admin
      .from('group_members')
      .select('role')
      .eq('group_id', gid as string)
      .eq('user_id', owner.id)
      .single();
    expect(gm?.role).toBe('owner');

    const { count } = await admin
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', gid as string);
    expect(count).toBe(2);
  });

  test('rejects blank name', async () => {
    const owner = await signUpUser('cg2');
    const { error } = await owner.client.rpc('create_group', {
      p_name: '   ',
      p_ghosts: [] as never,
    });
    expect(error?.message ?? '').toMatch(/group name is required/);
  });

  test('p_color overrides the creator members.color (since 0012)', async () => {
    const owner = await signUpUser('cg-color');
    const { data: gid, error } = await owner.client.rpc('create_group', {
      p_name: 'Colorful',
      p_ghosts: [] as never,
      p_color: '#ff8800',
    });
    expect(error).toBeNull();
    const { data: m } = await admin
      .from('members')
      .select('color')
      .eq('group_id', gid as string)
      .eq('user_id', owner.id)
      .single();
    expect(m?.color).toBe('#ff8800');
  });

  test('omitted p_color falls back to default (#4a6b7a)', async () => {
    const owner = await signUpUser('cg-color-default');
    const { data: gid } = await owner.client.rpc('create_group', {
      p_name: 'Defaulted',
      p_ghosts: [] as never,
    });
    const { data: m } = await admin
      .from('members')
      .select('color')
      .eq('group_id', gid as string)
      .eq('user_id', owner.id)
      .single();
    expect(m?.color).toBe('#4a6b7a');
  });

  test('rejects duplicate ghost display_name (case-insensitive)', async () => {
    const owner = await signUpUser('cg3');
    const { error } = await owner.client.rpc('create_group', {
      p_name: 'Dups',
      p_ghosts: [
        { display_name: 'Alex', color: '#111', initials: 'AL' },
        { display_name: 'alex', color: '#222', initials: 'AL' },
      ] as never,
    });
    expect(error?.message ?? '').toMatch(/duplicate/i);
  });
});

describe('create_invite', () => {
  test('owner: code matches Crockford alphabet, expires ~7d out', async () => {
    const owner = await signUpUser('ci1');
    const { data: gid } = await owner.client.rpc('create_group', {
      p_name: 'G',
      p_ghosts: [] as never,
    });
    const { data, error } = await owner.client.rpc('create_invite', {
      p_group_id: gid as string,
    });
    expect(error).toBeNull();
    const row = (data as unknown as { code: string; expires_at: string }[])[0];
    expect(row.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    const ttlMs = new Date(row.expires_at).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(6.5 * 86_400_000);
    expect(ttlMs).toBeLessThan(7.5 * 86_400_000);
  });

  test('regular member can create an invite (since 0011)', async () => {
    const owner = await signUpUser('ci2-o');
    const { data: gid } = await owner.client.rpc('create_group', {
      p_name: 'G',
      p_ghosts: [] as never,
    });
    const member = await signUpUser('ci2-m');
    await admin.from('group_members').insert({
      group_id: gid as string,
      user_id: member.id,
      role: 'member',
    });
    const { data, error } = await member.client.rpc('create_invite', {
      p_group_id: gid as string,
    });
    expect(error).toBeNull();
    const row = (data as unknown as { code: string }[])[0];
    expect(row.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  test('non-member outsider is rejected', async () => {
    const outsider = await signUpUser('ci3');
    const { error } = await outsider.client.rpc('create_invite', {
      p_group_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(error?.message ?? '').toMatch(/only group members/);
  });
});

describe('peek_invite', () => {
  test('valid -> group info; expired -> empty; unknown -> empty', async () => {
    const owner = await signUpUser('pk1');
    const { data: gid } = await owner.client.rpc('create_group', {
      p_name: 'Peekable',
      p_ghosts: [] as never,
    });
    const { data: invRows } = await owner.client.rpc('create_invite', {
      p_group_id: gid as string,
    });
    const code = (invRows as unknown as { code: string }[])[0].code;

    const { data: peek } = await owner.client.rpc('peek_invite', { p_code: code });
    const peekRow = (peek as unknown as { group_name: string; used: boolean }[])[0];
    expect(peekRow.group_name).toBe('Peekable');
    expect(peekRow.used).toBe(false);

    await admin
      .from('invites')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('code', code);
    const { data: expired } = await owner.client.rpc('peek_invite', { p_code: code });
    expect((expired as unknown[] | null)?.length ?? 0).toBe(0);

    const { data: unknown_ } = await owner.client.rpc('peek_invite', { p_code: 'ZZZZZZZZ' });
    expect((unknown_ as unknown[] | null)?.length ?? 0).toBe(0);
  });
});

describe('accept_invite', () => {
  async function setupInvite(suffix: string) {
    const owner = await signUpUser(`ai-${suffix}-o`);
    const { data: gid } = await owner.client.rpc('create_group', {
      p_name: `JM-${suffix}`,
      p_ghosts: [] as never,
    });
    const { data: invRows } = await owner.client.rpc('create_invite', {
      p_group_id: gid as string,
    });
    const code = (invRows as unknown as { code: string }[])[0].code;
    return { owner, groupId: gid as string, code };
  }

  test('happy: joiner gets group_members + members rows; invite marked used', async () => {
    const { groupId, code } = await setupInvite('ok');
    const joiner = await signUpUser('ai-ok-j');

    const { data: joined, error } = await joiner.client.rpc('accept_invite', {
      p_code: code,
    });
    expect(error).toBeNull();
    expect(joined).toBe(groupId);

    const { data: gm } = await admin
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', joiner.id)
      .single();
    expect(gm?.role).toBe('member');

    const { data: usedInvite } = await admin
      .from('invites')
      .select('used_by, used_at')
      .eq('code', code)
      .single();
    expect(usedInvite?.used_by).toBe(joiner.id);
    expect(usedInvite?.used_at).not.toBeNull();
  });

  test('rejects already-used code', async () => {
    const { code } = await setupInvite('used');
    const j1 = await signUpUser('ai-used-j1');
    await j1.client.rpc('accept_invite', { p_code: code });

    const j2 = await signUpUser('ai-used-j2');
    const { error } = await j2.client.rpc('accept_invite', { p_code: code });
    expect(error?.message ?? '').toMatch(/invite_used/);
  });

  test('rejects expired code', async () => {
    const { code } = await setupInvite('exp');
    await admin
      .from('invites')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('code', code);

    const j = await signUpUser('ai-exp-j');
    const { error } = await j.client.rpc('accept_invite', { p_code: code });
    expect(error?.message ?? '').toMatch(/invite_expired|invite_not_found/);
  });

  test('rejects unknown code', async () => {
    const j = await signUpUser('ai-unk');
    const { error } = await j.client.rpc('accept_invite', { p_code: 'ZZZZZZZZ' });
    expect(error?.message ?? '').toMatch(/invite_not_found/);
  });

  test('rejects already-member (owner trying to accept own invite)', async () => {
    const { owner, code } = await setupInvite('mem');
    const { error } = await owner.client.rpc('accept_invite', { p_code: code });
    expect(error?.message ?? '').toMatch(/already_member/);
  });
});
