'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { RealGameId } from '@/data/data';

export interface RecordMatchInput {
  groupId: string;
  gameId: RealGameId;
  playedOn: string; // ISO yyyy-mm-dd
  winnerMemberId: string;
  memberIds: string[];
}

export type RecordMatchResult =
  | { ok: true; matchId: string }
  | { ok: false; error: string };

/**
 * Server Action: insert a match + its participants atomically via the
 * `record_match` Postgres RPC (security definer; see migration 0004).
 *
 * Returns the new match id on success. Triggers `revalidatePath('/')` so the
 * leaderboard re-fetches with the freshly inserted row.
 */
export async function recordMatch(input: RecordMatchInput): Promise<RecordMatchResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not authenticated' };

  if (input.memberIds.length < 2) {
    return { ok: false, error: 'at least 2 players are required' };
  }
  if (!input.memberIds.includes(input.winnerMemberId)) {
    return { ok: false, error: 'winner must be one of the listed players' };
  }

  const { data, error } = await supabase.rpc('record_match', {
    p_group_id: input.groupId,
    p_game_id: input.gameId,
    p_played_on: input.playedOn,
    p_winner_member_id: input.winnerMemberId,
    p_member_ids: input.memberIds,
  });

  if (error) return { ok: false, error: error.message };
  if (typeof data !== 'string') return { ok: false, error: 'unexpected RPC response' };

  revalidatePath('/');
  return { ok: true, matchId: data };
}
