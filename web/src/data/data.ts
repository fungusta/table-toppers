// data.ts — types and pure formatters for the Table Topper UI.
// Mock data and the standings computation have moved into Supabase
// (see supabase/seed.sql and the get_standings RPC).

export type GameId = "cafe" | "catan" | "carcassonne" | "monopoly";
export type RealGameId = Exclude<GameId, "cafe">;
export type Range = "week" | "month" | "all";

export interface Player {
  id: string;
  name: string;
  handle: string;
  color: string;
  initials: string;
  joined: string;
}

export interface Match {
  id: number;
  game: RealGameId;
  date: string;
  players: string[];
  winner: string;
}

export interface GameMeta {
  id: GameId;
  label: string;
  short: string;
}

export interface Standing {
  member_id: string;
  player: Player;
  wins: number;
  played: number;
  winRate: number;
  streak: number;
  byGame: Record<RealGameId, number>;
  playedByGame: Record<RealGameId, number>;
  fav: RealGameId;
}

export interface H2H {
  aWins: number;
  bWins: number;
  played: number;
}

export const GAMES: Record<GameId, GameMeta> = {
  cafe:        { id: "cafe",        label: "All Games",   short: "All"   },
  catan:       { id: "catan",       label: "Catan",       short: "Catan" },
  carcassonne: { id: "carcassonne", label: "Carcassonne", short: "Carc." },
  monopoly:    { id: "monopoly",    label: "Monopoly",    short: "Mono." },
};

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function relTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7)   return `${days}d ago`;
  if (days < 30)  return `${Math.round(days / 7)}w ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}
