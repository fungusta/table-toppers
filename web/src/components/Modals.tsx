"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fmtDate,
  GAMES,
  headToHead,
  playerById,
  type GameId,
  type Match,
  type Player,
  type RealGameId,
} from "@/data/data";

const REAL_GAMES: RealGameId[] = ["catan", "carcassonne", "monopoly"];

// ─── Shared shell ──────────────────────────────────────────────────────────
interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  theme: GameId;
  size?: "md" | "lg";
  title: string;
  subtitle?: string;
  children: ReactNode;
}

function ModalShell({ open, onClose, theme, size = "md", children, title, subtitle }: ModalShellProps) {
  if (!open) return null;
  return (
    <div className={`modal-backdrop modal-theme-${theme}`} onClick={onClose}>
      <div className={`modal-card modal-size-${size}`} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ─── Player Profile ────────────────────────────────────────────────────────
interface PlayerProfileModalProps {
  playerId: string | null;
  players: Player[];
  matches: Match[];
  onClose: () => void;
  theme: GameId;
  onPickPlayer: (id: string) => void;
}

export function PlayerProfileModal({ playerId, players, matches, onClose, theme, onPickPlayer }: PlayerProfileModalProps) {
  const open = !!playerId;
  const player: Player | null = open ? playerById(players, playerId!) : null;

  const data = useMemo(() => {
    if (!player) return null;
    const all = matches.filter(m => m.players.includes(player.id));
    const wins = all.filter(m => m.winner === player.id);
    const byGame: Record<RealGameId, number> = { catan: 0, carcassonne: 0, monopoly: 0 };
    const playedByGame: Record<RealGameId, number> = { catan: 0, carcassonne: 0, monopoly: 0 };
    for (const m of all) {
      playedByGame[m.game]++;
      if (m.winner === player.id) byGame[m.game]++;
    }
    const fav = REAL_GAMES.reduce<RealGameId>(
      (a, b) => (playedByGame[a] >= playedByGame[b] ? a : b),
      "catan"
    );

    const ordered = [...all].sort((a, b) => b.date.localeCompare(a.date));
    let streak = 0;
    for (const m of ordered) {
      if (m.winner === player.id) streak++;
      else break;
    }

    const last10 = ordered.slice(0, 10).map(m => ({
      won: m.winner === player.id,
      game: m.game,
      date: m.date,
    }));

    const h2h = players.filter(p => p.id !== player.id)
      .map(other => ({ other, ...headToHead(matches, player.id, other.id) }))
      .filter(r => r.played > 0)
      .sort((a, b) => b.played - a.played);

    return { all, wins, byGame, playedByGame, fav, streak, last10, h2h, recent: ordered.slice(0, 8) };
  }, [player, players, matches]);

  if (!open || !player || !data) return null;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      theme={theme}
      size="lg"
      title={`${player.name}'s record`}
      subtitle={`@${player.handle} · joined ${player.joined}`}
    >
      <div className="pp-grid">
        <div className="pp-hero">
          <div className="pp-avatar" style={{ background: player.color }}>
            {player.initials}
          </div>
          <div className="pp-hero-stats">
            <div className="pp-hstat"><span>{data.wins.length}</span><i>total wins</i></div>
            <div className="pp-hstat"><span>{data.all.length}</span><i>games played</i></div>
            <div className="pp-hstat">
              <span>{Math.round((data.wins.length / Math.max(data.all.length, 1)) * 100)}%</span>
              <i>win rate</i>
            </div>
            <div className="pp-hstat"><span>{data.streak}</span><i>current streak</i></div>
          </div>
        </div>

        <div className="pp-section">
          <h4>Wins by game</h4>
          <div className="pp-bygame">
            {REAL_GAMES.map(g => {
              const w = data.byGame[g];
              const p = data.playedByGame[g];
              const pct = p ? (w / p) * 100 : 0;
              return (
                <div key={g} className="pp-bygame-row">
                  <div className="pp-bygame-name">
                    {GAMES[g].label}
                    {data.fav === g && <span className="pp-fav">★ favorite</span>}
                  </div>
                  <div className="pp-bygame-bar">
                    <div
                      className="pp-bygame-fill"
                      style={{ width: `${pct}%`, background: player.color }}
                    />
                  </div>
                  <div className="pp-bygame-num">{w}/{p}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pp-section">
          <h4>Recent form (last 10)</h4>
          <div className="pp-form">
            {data.last10.map((r, i) => (
              <div
                key={i}
                className={`pp-form-cell ${r.won ? "pp-form-w" : "pp-form-l"}`}
                title={`${r.won ? "Won" : "Lost"} ${GAMES[r.game].label} · ${fmtDate(r.date)}`}
              >
                {r.won ? "W" : "L"}
              </div>
            ))}
            {data.last10.length === 0 && <div className="pp-empty">No games yet</div>}
          </div>
        </div>

        <div className="pp-section pp-section-h2h">
          <h4>Head to head</h4>
          <div className="pp-h2h">
            {data.h2h.map(r => {
              const total = r.aWins + r.bWins;
              const aPct = total ? (r.aWins / total) * 100 : 50;
              return (
                <div key={r.other.id} className="pp-h2h-row" onClick={() => onPickPlayer(r.other.id)}>
                  <div className="pp-h2h-name">vs {r.other.name}</div>
                  <div className="pp-h2h-bar">
                    <div className="pp-h2h-a" style={{ width: `${aPct}%`, background: player.color }}>
                      <span>{r.aWins}</span>
                    </div>
                    <div className="pp-h2h-b" style={{ background: r.other.color }}>
                      <span>{r.bWins}</span>
                    </div>
                  </div>
                  <div className="pp-h2h-total">{r.played} total</div>
                </div>
              );
            })}
            {data.h2h.length === 0 && <div className="pp-empty">No shared matches</div>}
          </div>
        </div>

        <div className="pp-section pp-section-recent">
          <h4>Recent matches</h4>
          <ul className="pp-recent">
            {data.recent.map(m => (
              <li
                key={m.id}
                className={"pp-recent-row " + (m.winner === player.id ? "pp-won" : "pp-lost")}
              >
                <span className="pp-recent-result">{m.winner === player.id ? "W" : "L"}</span>
                <span className="pp-recent-game">{GAMES[m.game].label}</span>
                <span className="pp-recent-date">{fmtDate(m.date)}</span>
                <span className="pp-recent-opps">
                  {m.players.filter(p => p !== player.id).map(p => playerById(players, p).name).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Record Match ──────────────────────────────────────────────────────────
export interface NewMatch {
  game: RealGameId;
  players: string[];
  winner: string;
  date: string;
}

interface RecordMatchModalProps {
  open: boolean;
  onClose: () => void;
  theme: GameId;
  defaultGame: GameId;
  players: Player[];
  onSubmit: (match: NewMatch) => void;
}

function hexFade(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function initialGame(defaultGame: GameId): RealGameId {
  if (defaultGame === "cafe") return "catan";
  return defaultGame;
}

export function RecordMatchModal({ open, onClose, theme, onSubmit, defaultGame, players }: RecordMatchModalProps) {
  const [game, setGame] = useState<RealGameId>(initialGame(defaultGame));
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [date, setDate] = useState<string>("2026-05-23");
  const [step, setStep] = useState<0 | 1>(0);

  useEffect(() => {
    if (open) {
      setGame(initialGame(defaultGame));
      setSelectedPlayers([]);
      setWinner(null);
      setDate("2026-05-23");
      setStep(0);
    }
  }, [open, defaultGame]);

  function togglePlayer(id: string) {
    if (selectedPlayers.includes(id)) {
      setSelectedPlayers(selectedPlayers.filter(p => p !== id));
      if (winner === id) setWinner(null);
    } else {
      setSelectedPlayers([...selectedPlayers, id]);
    }
  }

  const canSubmit = selectedPlayers.length >= 2 && !!winner && !!date && !!game;

  function submit() {
    if (!canSubmit || !winner) return;
    onSubmit({ game, players: selectedPlayers, winner, date });
    setStep(1);
    setTimeout(() => onClose(), 1400);
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      theme={theme}
      size="md"
      title="Record a match"
      subtitle="Log the latest game-night result"
    >
      {step === 1 && winner ? (
        <div className="rm-success">
          <div className="rm-success-mark">✓</div>
          <div className="rm-success-title">Match recorded</div>
          <div className="rm-success-sub">
            {playerById(players, winner).name} beat {selectedPlayers.length - 1} other
            {selectedPlayers.length - 1 === 1 ? "" : "s"} at {GAMES[game].label}
          </div>
        </div>
      ) : (
        <div className="rm-form">
          <div className="rm-row">
            <label className="rm-label">Game</label>
            <div className="rm-segctl">
              {REAL_GAMES.map(g => (
                <button
                  key={g}
                  className={"rm-seg" + (game === g ? " rm-seg-on" : "")}
                  onClick={() => setGame(g)}
                >
                  {GAMES[g].label}
                </button>
              ))}
            </div>
          </div>

          <div className="rm-row">
            <label className="rm-label">Date</label>
            <input
              type="date"
              className="rm-input"
              value={date}
              onChange={e => setDate(e.target.value)}
              max="2026-05-23"
            />
          </div>

          <div className="rm-row">
            <label className="rm-label">Who played?</label>
            <div className="rm-players">
              {players.map(p => (
                <button
                  key={p.id}
                  className={"rm-player" + (selectedPlayers.includes(p.id) ? " rm-player-on" : "")}
                  onClick={() => togglePlayer(p.id)}
                >
                  <span className="rm-player-dot" style={{ background: p.color }}>{p.initials}</span>
                  <span className="rm-player-name">{p.name}</span>
                  {selectedPlayers.includes(p.id) && <span className="rm-check">✓</span>}
                </button>
              ))}
            </div>
            <div className="rm-hint">Select at least 2 players</div>
          </div>

          {selectedPlayers.length >= 2 && (
            <div className="rm-row">
              <label className="rm-label">Winner</label>
              <div className="rm-winners">
                {selectedPlayers.map(pid => {
                  const p = playerById(players, pid);
                  const isWinner = winner === pid;
                  return (
                    <button
                      key={pid}
                      className={"rm-winner" + (isWinner ? " rm-winner-on" : "")}
                      onClick={() => setWinner(pid)}
                      style={isWinner ? { borderColor: p.color, background: hexFade(p.color, 0.12) } : undefined}
                    >
                      <span className="rm-player-dot" style={{ background: p.color }}>{p.initials}</span>
                      <span>{p.name}</span>
                      {isWinner && <span className="rm-crown">♛</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rm-actions">
            <button className="rm-btn-secondary" onClick={onClose}>Cancel</button>
            <button className="rm-btn-primary" disabled={!canSubmit} onClick={submit}>
              Record match
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ─── Match History ─────────────────────────────────────────────────────────
interface MatchHistoryModalProps {
  open: boolean;
  onClose: () => void;
  theme: GameId;
  players: Player[];
  matches: Match[];
  currentGame: GameId;
  onPickPlayer: (id: string) => void;
}

type HistoryFilter = "all" | RealGameId;

function initialFilter(currentGame: GameId): HistoryFilter {
  return currentGame === "cafe" ? "all" : currentGame;
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function monthShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short" });
}

export function MatchHistoryModal({
  open,
  onClose,
  theme,
  players,
  matches,
  currentGame,
  onPickPlayer,
}: MatchHistoryModalProps) {
  const [filterGame, setFilterGame] = useState<HistoryFilter>(initialFilter(currentGame));

  useEffect(() => {
    if (open) setFilterGame(initialFilter(currentGame));
  }, [open, currentGame]);

  const filtered = useMemo(
    () => matches.filter(m => filterGame === "all" || m.game === filterGame),
    [matches, filterGame]
  );

  const byMonth = useMemo(() => {
    const groups: Record<string, Match[]> = {};
    for (const m of filtered) {
      const key = m.date.slice(0, 7);
      (groups[key] = groups[key] || []).push(m);
    }
    return Object.keys(groups)
      .sort()
      .reverse()
      .map(k => ({ month: k, label: monthLabel(k), matches: groups[k] }));
  }, [filtered]);

  const FILTERS: HistoryFilter[] = ["all", "catan", "carcassonne", "monopoly"];

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      theme={theme}
      size="lg"
      title="Match history"
      subtitle={`${filtered.length} game${filtered.length === 1 ? "" : "s"} on record`}
    >
      <div className="mh-filter">
        {FILTERS.map(g => (
          <button
            key={g}
            className={"mh-filter-btn" + (filterGame === g ? " mh-filter-on" : "")}
            onClick={() => setFilterGame(g)}
          >
            {g === "all" ? "All games" : GAMES[g].label}
          </button>
        ))}
      </div>
      <div className="mh-list">
        {byMonth.map(grp => (
          <div key={grp.month} className="mh-month">
            <div className="mh-month-head">{grp.label}</div>
            <ul>
              {grp.matches.map(m => {
                const w = playerById(players, m.winner);
                return (
                  <li key={m.id} className="mh-row">
                    <div className="mh-date">
                      <div className="mh-date-day">{m.date.slice(8, 10)}</div>
                      <div className="mh-date-mo">{monthShort(m.date)}</div>
                    </div>
                    <div className="mh-game" data-game={m.game}>{GAMES[m.game].label}</div>
                    <div className="mh-result">
                      <button className="mh-winner" onClick={() => onPickPlayer(w.id)}>
                        <span className="mh-dot" style={{ background: w.color }}>{w.initials}</span>
                        <strong>{w.name}</strong>
                        <em>won vs</em>
                      </button>
                      <span className="mh-others">
                        {m.players.filter(p => p !== m.winner).map(p => playerById(players, p).name).join(", ")}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {byMonth.length === 0 && <div className="mh-empty">No matches in this filter</div>}
      </div>
    </ModalShell>
  );
}
