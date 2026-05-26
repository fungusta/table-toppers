import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "@/components/HomeClient";
import type { Match, Player, RealGameId } from "@/data/data";

export default async function GroupHome({
  params,
}: {
  params: Promise<{ group_id: string }>;
}) {
  const { group_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/g/${group_id}/`)}`);

  // Membership check + group name in one round trip.
  const { data: gm } = await supabase
    .from("group_members")
    .select("role, groups(name)")
    .eq("group_id", group_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!gm) notFound();

  const [
    { data: memberRows },
    { data: matchRows },
    { data: matchPlayerRows },
    { data: groupsList },
  ] = await Promise.all([
    supabase
      .from("members")
      .select("id, display_name, handle, color, initials, joined_at")
      .eq("group_id", group_id),
    supabase
      .from("matches")
      .select("id, game_id, played_on, winner_member_id")
      .eq("group_id", group_id)
      .order("played_on", { ascending: false }),
    supabase
      .from("match_players")
      .select("match_id, member_id, matches!inner(group_id)")
      .eq("matches.group_id", group_id),
    supabase
      .from("group_members")
      .select("group_id, groups!inner(id, name)")
      .eq("user_id", user.id),
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

  // Boundary guard: drop rows whose game_id isn't one we render. Without this
  // a stale DB row (e.g. legacy 'monopoly' matches predating migration 0009)
  // would slip past the `as RealGameId` cast and crash GAMES[m.game].label
  // downstream in CafeView / Modals.
  const KNOWN_GAME_IDS: ReadonlySet<string> = new Set<RealGameId>([
    "catan",
    "carcassonne",
  ]);
  const matches: Match[] = (matchRows ?? [])
    .filter(m => KNOWN_GAME_IDS.has(m.game_id))
    .map(m => ({
      id: m.id,
      game: m.game_id as RealGameId,
      date: m.played_on,
      players: participantsByMatch.get(m.id) ?? [],
      winner: m.winner_member_id ?? "",
    }));

  type GroupsListRow = { group_id: string; groups: { id: string; name: string } };
  const groups = (groupsList as GroupsListRow[] | null ?? [])
    .map(row => ({ id: row.groups.id, name: row.groups.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  type GmRow = { role: string; groups: { name: string } };
  const gmTyped = gm as unknown as GmRow;

  return (
    <HomeClient
      groupId={group_id}
      groupName={gmTyped.groups.name}
      groupRole={gmTyped.role === "owner" ? "owner" : "member"}
      groups={groups}
      players={players}
      initialMatches={matches}
    />
  );
}
