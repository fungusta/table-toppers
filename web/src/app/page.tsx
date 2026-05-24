import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "@/components/HomeClient";
import type { Match, Player, RealGameId } from "@/data/data";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: gm } = await supabase
    .from("group_members")
    .select("group_id")
    .limit(1)
    .single();
  if (!gm) redirect("/signin");

  const [{ data: memberRows }, { data: matchRows }, { data: matchPlayerRows }] =
    await Promise.all([
      supabase
        .from("members")
        .select("id, display_name, handle, color, initials, joined_at")
        .eq("group_id", gm.group_id),
      supabase
        .from("matches")
        .select("id, game_id, played_on, winner_member_id")
        .eq("group_id", gm.group_id)
        .order("played_on", { ascending: false }),
      supabase
        .from("match_players")
        .select("match_id, member_id, matches!inner(group_id)")
        .eq("matches.group_id", gm.group_id),
    ]);

  const players: Player[] = (memberRows ?? []).map(m => ({
    id: m.id,
    name: m.display_name,
    handle: m.handle ?? "",
    color: m.color,
    initials: m.initials,
    joined: m.joined_at,
  }));

  const participantsByMatch = new Map<string, string[]>();
  for (const row of matchPlayerRows ?? []) {
    const arr = participantsByMatch.get(row.match_id) ?? [];
    arr.push(row.member_id);
    participantsByMatch.set(row.match_id, arr);
  }

  const matches: Match[] = (matchRows ?? []).map(m => ({
    id: m.id,
    game: m.game_id as RealGameId,
    date: m.played_on,
    players: participantsByMatch.get(m.id) ?? [],
    winner: m.winner_member_id ?? "",
  }));

  return <HomeClient players={players} initialMatches={matches} />;
}
