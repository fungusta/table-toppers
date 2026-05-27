'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const SENTINELS = [
  'invite_not_found',
  'invite_used',
  'invite_expired',
  'already_member',
  'handle_invalid',
] as const;
type Sentinel = typeof SENTINELS[number];

export interface AcceptInviteInput {
  code: string;
  /**
   * Optional nickname for the joining user's seat row. Validated
   * server-side by `_normalize_handle` (migration 0010).
   */
  handle?: string;
}

export type AcceptInviteResult =
  | { ok: true; groupId: string }
  | { ok: false; error: Sentinel | 'not_authenticated' | string };

/**
 * Server Action: accept an invite code, joining the caller to the target
 * group as a member (with optional handle). Wraps the `accept_invite`
 * Postgres RPC (security definer; see migrations 0006, 0010). Maps known
 * error sentinels so the caller can render distinct messages or branch
 * to /g/[id]/ on `already_member`.
 */
export async function acceptInvite(input: AcceptInviteInput): Promise<AcceptInviteResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_authenticated' };

  const handle = input.handle?.trim() || undefined;

  const { data, error } = await supabase.rpc('accept_invite', {
    p_code: input.code,
    ...(handle ? { p_handle: handle } : {}),
  });
  if (error) {
    const matched = SENTINELS.find(s => error.message.includes(s));
    return { ok: false, error: matched ?? error.message };
  }
  if (typeof data !== 'string') return { ok: false, error: 'unexpected RPC response' };

  revalidatePath('/');
  return { ok: true, groupId: data };
}
