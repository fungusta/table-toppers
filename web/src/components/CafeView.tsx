"use client";

import { useMemo } from "react";
import {
  computeStandings,
  filterMatches,
  GAMES,
  PLAYERS,
  playerById,
  relTime,
  type Match,
  type Range,
  type RealGameId,
  type Standing,
} from "@/data/data";

interface CafeViewProps {
  matches: Match[];
  range: Range;
  onPickPlayer: (id: string) => void;
  onRecord: () => void;
  onOpenHistory: () => void;
}

export function CafeView({ matches, range, onPickPlayer, onRecord, onOpenHistory }: CafeViewProps) {
  const allStandings = useMemo(
    () => computeStandings(PLAYERS, matches, "cafe", range),
    [matches, range]
  );
  const recent = useMemo(
    () => filterMatches(matches, "cafe", range).slice(0, 6),
    [matches, range]
  );
  const totalGames = useMemo(
    () => filterMatches(matches, "cafe", range).length,
    [matches, range]
  );
  const champs = useMemo(() => {
    const realGames: RealGameId[] = ["catan", "carcassonne", "monopoly"];
    return realGames.map(g => {
      const s = computeStandings(PLAYERS, matches, g, range);
      return { game: g, top: s[0] as Standing | undefined };
    });
  }, [matches, range]);
  const longest = useMemo(
    () => allStandings.reduce<Standing | null>((m, s) => (s.streak > (m?.streak ?? 0) ? s : m), null),
    [allStandings]
  );
  const mostActive = useMemo(
    () => [...allStandings].sort((a, b) => b.played - a.played)[0],
    [allStandings]
  );

  return (
    <div className="caf-root">
      {/* At-a-glance — replaces the old hero, much smaller */}
      <section>
        <div className="caf-stats">
          <CafeStat lbl="Matches" val={totalGames} sub={rangeSubCafe(range)} />
          <CafeStat lbl="Players" val={PLAYERS.length} sub="regulars" />
          <CafeStat
            lbl="Hottest streak"
            val={longest?.streak ? `${longest.streak}` : "—"}
            sub={longest?.streak ? `${longest.player.name} 🔥` : "no current streaks"}
          />
          <CafeStat
            lbl="Most active"
            val={mostActive?.played ?? "—"}
            sub={mostActive ? `${mostActive.player.name} · matches` : ""}
          />
        </div>
      </section>

      {/* Champions per game */}
      <section>
        <div className="caf-section-head">
          <div>
            <div className="caf-eyebrow">Reigning</div>
            <h2>Game champions</h2>
          </div>
          <p>The top win-count holder of each game in the cafe.</p>
        </div>
        <div className="caf-champs">
          {champs.map(c => (
            <CafeChamp
              key={c.game}
              game={c.game}
              top={c.top}
              onClick={() => c.top && onPickPlayer(c.top.player.id)}
            />
          ))}
        </div>
      </section>

      {/* League table */}
      <section>
        <div className="caf-section-head">
          <div>
            <div className="caf-eyebrow">All games · {rangeSubCafe(range)}</div>
            <h2>League table</h2>
          </div>
          <p>Combined standings across Catan, Carcassonne &amp; Monopoly.</p>
        </div>
        <div className="caf-table-wrap">
          <table className="caf-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th className="num">Wins</th>
                <th className="num">Played</th>
                <th className="num caf-col-wr">Win rate</th>
                <th className="caf-col-pips">By game</th>
                <th className="num caf-col-streak">Streak</th>
              </tr>
            </thead>
            <tbody>
              {allStandings.map((s, i) => (
                <tr key={s.player.id} onClick={() => onPickPlayer(s.player.id)}>
                  <td>
                    <span className={"caf-rank" + (i === 0 ? " caf-rank-1" : "")}>{i + 1}</span>
                  </td>
                  <td>
                    <div className="caf-player">
                      <div className="caf-avatar" style={{ background: s.player.color }}>
                        {s.player.initials}
                      </div>
                      <div className="caf-player-text">
                        <span className="caf-player-name">{s.player.name}</span>
                        <span className="caf-player-handle">@{s.player.handle}</span>
                      </div>
                    </div>
                  </td>
                  <td className="num">
                    <strong style={{ color: "#9c4b34", fontSize: 15 }}>{s.wins}</strong>
                  </td>
                  <td className="num">{s.played}</td>
                  <td className="num caf-col-wr">
                    <span className="caf-bar">
                      <span className="caf-bar-fill" style={{ width: `${Math.round(s.winRate * 100)}%` }} />
                    </span>
                    {Math.round(s.winRate * 100)}%
                  </td>
                  <td className="caf-col-pips">
                    <span className="caf-pips">
                      <span className="caf-pip"><span className="caf-pip-dot catan" />{s.byGame.catan}</span>
                      <span className="caf-pip"><span className="caf-pip-dot carcassonne" />{s.byGame.carcassonne}</span>
                      <span className="caf-pip"><span className="caf-pip-dot monopoly" />{s.byGame.monopoly}</span>
                    </span>
                  </td>
                  <td className="num caf-col-streak">
                    <span className={"caf-streak" + (s.streak >= 2 ? " caf-streak-hot" : "")}>
                      {s.streak > 0 ? `🔥 ${s.streak}` : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent matches across all games */}
      <section>
        <div className="caf-section-head">
          <div>
            <div className="caf-eyebrow">Latest</div>
            <h2>Recent matches</h2>
          </div>
          <button className="caf-link" onClick={onOpenHistory}>Open full history →</button>
        </div>
        <ul className="caf-recent">
          {recent.map(m => {
            const w = playerById(m.winner);
            return (
              <li key={m.id} className="caf-recent-row" onClick={() => onPickPlayer(w.id)}>
                <div className="caf-recent-avatar" style={{ background: w.color }}>
                  {w.initials}
                </div>
                <div>
                  <div className="caf-recent-title">
                    <strong>{w.name}</strong> won {GAMES[m.game].label}
                  </div>
                  <div className="caf-recent-sub">
                    vs {m.players.filter(p => p !== m.winner).map(p => playerById(p).name).join(" · ")}
                  </div>
                </div>
                <span className={`caf-recent-game ${m.game}`}>{GAMES[m.game].short}</span>
                <span className="caf-recent-date">{relTime(m.date)}</span>
              </li>
            );
          })}
        </ul>
        <button className="caf-record-btn" onClick={onRecord}>＋ Record a match</button>
      </section>
    </div>
  );
}

function CafeStat({ lbl, val, sub }: { lbl: string; val: React.ReactNode; sub?: string }) {
  return (
    <div className="caf-stat">
      <div className="caf-stat-lbl">{lbl}</div>
      <div className="caf-stat-val">{val}</div>
      {sub && <div className="caf-stat-sub">{sub}</div>}
    </div>
  );
}

function CafeChamp({
  game,
  top,
  onClick,
}: {
  game: RealGameId;
  top: Standing | undefined;
  onClick: () => void;
}) {
  return (
    <button className="caf-champ" onClick={onClick} disabled={!top}>
      <div className="caf-champ-glyph">
        <CafeGameGlyph id={game} />
      </div>
      <div className="caf-champ-body">
        <div className="caf-champ-game">{GAMES[game].label}</div>
        <div className="caf-champ-name">{top?.player.name || "—"}</div>
        <div className="caf-champ-wins">
          {top
            ? `${top.wins} win${top.wins === 1 ? "" : "s"} · ${Math.round(top.winRate * 100)}% rate`
            : "no matches yet"}
        </div>
      </div>
      {top && (
        <div className="caf-champ-portrait" style={{ background: top.player.color }}>
          {top.player.initials}
        </div>
      )}
    </button>
  );
}

function CafeGameGlyph({ id }: { id: RealGameId }) {
  if (id === "catan") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22">
        <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (id === "carcassonne") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22">
        <rect x="3" y="3" width="18" height="18" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    );
  }
  if (id === "monopoly") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22">
        <rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="3" width="18" height="4" fill="currentColor" />
      </svg>
    );
  }
  return null;
}

function rangeSubCafe(r: Range): string {
  if (r === "week")  return "past 7 days";
  if (r === "month") return "past 30 days";
  return "all time";
}

export default CafeView;
