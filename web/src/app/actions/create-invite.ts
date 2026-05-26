'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export interface CreateInviteInput {
  groupId: string;
  ttlHours?: number;
}

export type CreateInviteResult =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; error: string };

/**
 * Server Action: generate a single-use, 7-day Crockford-base32 invite code
 * via the `create_invite` Postgres RPC (security definer; owners only).
 * See migration 0006.
 */
export async function createInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not authenticated' };

  const { data, error } = await supabase.rpc('create_invite', {
    p_group_id: input.groupId,
    p_ttl_hours: input.ttlHours ?? 168,
  });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row.code !== 'string' || typeof row.expires_at !== 'string') {
    return { ok: false, error: 'unexpected RPC response' };
  }

  revalidatePath(`/g/${input.groupId}/manage`);
  return { ok: true, code: row.code, expiresAt: row.expires_at };
}
