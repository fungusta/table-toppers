import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CafeViewClient } from "@/components/CafeViewClient";
import type { GameId, Player, Range, RealGameId, Standing } from "@/data/data";

type RpcRow = {
  member_id: string;
  display_name: string;
  handle: string | null;
  color: string;
  initials: string;
  wins: number;
  played: number;
  win_rate: number;
  streak: number;
  catan_wins: number;
  carc_wins: number;
  mono_wins: number;
  catan_played: number;
  carc_played: number;
  mono_played: number;
  fav_game: RealGameId;
};

function toStanding(r: RpcRow): Standing {
  return {
    member_id: r.member_id,
    player: {
      id: r.member_id,
      name: r.display_name,
      handle: r.handle ?? "",
      color: r.color,
      initials: r.initials,
      joined: "",
    },
    wins: r.wins,
    played: r.played,
    winRate: Number(r.win_rate),
    streak: r.streak,
    byGame:       { catan: r.catan_wins,   carcassonne: r.carc_wins,   monopoly: r.mono_wins   },
    playedByGame: { catan: r.catan_played, carcassonne: r.carc_played, monopoly: r.mono_played },
    fav: r.fav_game,
  };
}

const VALID_GAMES: GameId[] = ["cafe", "catan", "carcassonne", "monopoly"];
const VALID_RANGES: Range[] = ["week", "month", "all"];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: gm } = await supabase
    .from("group_members")
    .select("group_id")
    .limit(1)
    .single();
  if (!gm) redirect("/signin");

  const game: GameId =
    (sp.game && (VALID_GAMES as string[]).includes(sp.game)
      ? (sp.game as GameId)
      : "cafe");
  const range: Range =
    (sp.range && (VALID_RANGES as string[]).includes(sp.range)
      ? (sp.range as Range)
      : "month");

  const [{ data: rows, error }, { data: memberRows }] = await Promise.all([
    supabase.rpc("get_standings", { p_group_id: gm.group_id, p_game: game, p_range: range }),
    supabase
      .from("members")
      .select("id, display_name, handle, color, initials, joined_at")
      .eq("group_id", gm.group_id),
  ]);
  if (error) throw error;

  const standings: Standing[] = ((rows as RpcRow[] | null) ?? []).map(toStanding);
  const members: Player[] = (memberRows ?? []).map(m => ({
    id: m.id,
    name: m.display_name,
    handle: m.handle ?? "",
    color: m.color,
    initials: m.initials,
    joined: m.joined_at,
  }));

  return <CafeViewClient standings={standings} members={members} game={game} range={range} />;
}
