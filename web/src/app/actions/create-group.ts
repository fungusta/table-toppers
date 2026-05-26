'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export interface GhostInput {
  display_name: string;
  color: string;
  initials: string;
  handle?: string;
}

export interface CreateGroupInput {
  name: string;
  /**
   * Optional nickname for the creator's own seat. Validated server-side
   * by `_normalize_handle` — see migration 0010. May be empty / omitted.
   */
  handle?: string;
  /**
   * Optional color for the creator's own seat. When omitted / blank the
   * server falls back to the previous members.color or the default
   * `#4a6b7a`. See migration 0012.
   */
  color?: string;
  ghosts: GhostInput[];
}

export type CreateGroupResult =
  | { ok: true; groupId: string }
  | { ok: false; error: string };

/**
 * Server Action: atomically create a group, owner edge, creator's members
 * row (with optional handle), and any ghost members, via the
 * `create_group` Postgres RPC (security definer; see migrations 0006,
 * 0010).
 */
export async function createGroup(input: CreateGroupInput): Promise<CreateGroupResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not authenticated' };

  if (!input.name.trim()) return { ok: false, error: 'group name is required' };

  const handle = input.handle?.trim() || undefined;
  const color = input.color?.trim() || undefined;

  const { data, error } = await supabase.rpc('create_group', {
    p_name: input.name,
    p_ghosts: input.ghosts as unknown as never,
    ...(handle ? { p_handle: handle } : {}),
    ...(color ? { p_color: color } : {}),
  });
  if (error) {
    // Surface the server's handle-policy violation as a stable sentinel
    // so the form can render a precise, copy-friendly message.
    if (error.message.includes('handle_invalid')) {
      return { ok: false, error: 'handle_invalid' };
    }
    return { ok: false, error: error.message };
  }
  if (typeof data !== 'string') return { ok: false, error: 'unexpected RPC response' };

  revalidatePath('/');
  return { ok: true, groupId: data };
}
