// data.ts — types and pure helpers for the Table Topper UI.
// The mock PLAYERS / MATCHES constants moved to supabase/seed.sql at slice time.
// The standings logic survives here as pure functions so the legacy view
// components (Cafe / Catan / Carcassonne) keep working against live data
// fetched from Supabase, transformed into the same Match[] / Player[] shape.

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
  id: string;
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

const REAL_GAMES: RealGameId[] = ["catan", "carcassonne", "monopoly"];

// Range cutoff uses the most recent match's date as the "now" anchor, so the
// slice behaves correctly against historical seed data (newest match: 2026-05-22)
// without hardcoding a calendar date.
function rangeCutoff(matches: Match[], range: Range): Date | null {
  if (range === "all" || matches.length === 0) return null;
  const newest = matches.reduce(
    (max, m) => (m.date > max ? m.date : max),
    matches[0].date,
  );
  const anchor = new Date(newest);
  const cutoff = new Date(anchor);
  cutoff.setDate(anchor.getDate() - (range === "week" ? 7 : 30));
  return cutoff;
}

export function filterMatches(matches: Match[], gameId: GameId, range: Range): Match[] {
  const cutoff = rangeCutoff(matches, range);
  return matches.filter(m => {
    if (gameId !== "cafe" && m.game !== gameId) return false;
    if (cutoff && new Date(m.date) < cutoff) return false;
    return true;
  });
}

export function computeStandings(
  players: Player[],
  matches: Match[],
  gameId: GameId,
  range: Range,
): Standing[] {
  const filtered = filterMatches(matches, gameId, range);
  const stats: Record<string, Standing> = {};
  for (const p of players) {
    stats[p.id] = {
      member_id: p.id,
      player: p,
      wins: 0, played: 0, winRate: 0, streak: 0,
      byGame:       { catan: 0, carcassonne: 0, monopoly: 0 },
      playedByGame: { catan: 0, carcassonne: 0, monopoly: 0 },
      fav: "catan",
    };
  }
  const ordered = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  const lastResult: Record<string, "W" | "L"> = {};
  const curStreak: Record<string, number> = {};
  for (const m of ordered) {
    for (const pid of m.players) {
      const s = stats[pid];
      if (!s) continue;
      s.played += 1;
      s.playedByGame[m.game] = (s.playedByGame[m.game] || 0) + 1;
      const won = m.winner === pid;
      if (won) {
        s.wins += 1;
        s.byGame[m.game] = (s.byGame[m.game] || 0) + 1;
      }
      curStreak[pid] = won
        ? (lastResult[pid] === "W" ? (curStreak[pid] || 0) + 1 : 1)
        : 0;
      lastResult[pid] = won ? "W" : "L";
    }
  }
  for (const pid in stats) {
    const s = stats[pid];
    s.streak = curStreak[pid] || 0;
    s.winRate = s.played ? s.wins / s.played : 0;
    s.fav = REAL_GAMES.reduce<RealGameId>(
      (a, b) => (s.playedByGame[a] >= s.playedByGame[b] ? a : b),
      "catan",
    );
  }
  return Object.values(stats).sort((a, b) =>
    b.wins - a.wins || b.winRate - a.winRate || a.played - b.played
  );
}

export function headToHead(matches: Match[], aId: string, bId: string): H2H {
  let aWins = 0, bWins = 0, played = 0;
  for (const m of matches) {
    if (!m.players.includes(aId) || !m.players.includes(bId)) continue;
    played += 1;
    if      (m.winner === aId) aWins += 1;
    else if (m.winner === bId) bWins += 1;
  }
  return { aWins, bWins, played };
}

export function playerById(players: Player[], id: string): Player {
  const p = players.find(p => p.id === id);
  if (!p) throw new Error(`Unknown player: ${id}`);
  return p;
}

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
