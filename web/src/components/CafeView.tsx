"use client";

import { useId, useMemo } from "react";
import {
  computeStandings,
  filterMatches,
  GAMES,
  playerById,
  relTime,
  type Match,
  type Player,
  type Range,
  type RealGameId,
  type Standing,
} from "@/data/data";

interface CafeViewProps {
  players: Player[];
  matches: Match[];
  range: Range;
  onPickPlayer: (id: string) => void;
  onRecord: () => void;
  onOpenHistory: () => void;
}

export function CafeView({ players, matches, range, onPickPlayer, onRecord, onOpenHistory }: CafeViewProps) {
  const allStandings = useMemo(
    () => computeStandings(players, matches, "cafe", range),
    [players, matches, range]
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
    const realGames: RealGameId[] = ["catan", "carcassonne"];
    return realGames.map(g => {
      const s = computeStandings(players, matches, g, range);
      return { game: g, top: s[0] as Standing | undefined };
    });
  }, [matches, range]);
  const longest = useMemo(
    () => allStandings.reduce<Standing | null>((m, s) => (s.streak > (m?.streak ?? 0) ? s : m), null),
    [allStandings]
  );
  // Most matches played in the current range.
  const mostActive = useMemo(
    () =>
      allStandings.reduce<Standing | null>(
        (m, s) => (s.played > (m?.played ?? 0) ? s : m),
        null
      ),
    [allStandings]
  );
  // Best win rate, requiring a minimum sample size so a single lucky win
  // doesn't crown someone at 100 %.
  const topRate = useMemo(() => {
    const MIN_PLAYED = 3;
    return allStandings.reduce<Standing | null>((m, s) => {
      if (s.played < MIN_PLAYED) return m;
      if (!m) return s;
      if (s.winRate > m.winRate) return s;
      if (s.winRate === m.winRate && s.played > m.played) return s;
      return m;
    }, null);
  }, [allStandings]);
  // Game with the highest match count for the current range. Returns
  // null if there are no matches at all.
  const mostPlayedGame = useMemo(() => {
    const counts: Record<RealGameId, number> = { catan: 0, carcassonne: 0 };
    for (const m of filterMatches(matches, "cafe", range)) {
      if (m.game === "catan" || m.game === "carcassonne") counts[m.game] += 1;
    }
    const ordered = (["catan", "carcassonne"] as RealGameId[]).sort(
      (a, b) => counts[b] - counts[a]
    );
    const top = ordered[0];
    return counts[top] > 0 ? { game: top, count: counts[top] } : null;
  }, [matches, range]);
  // Podium: take the top three *distinct* win-groups (regardless of how
  // many players are in each). Each entry keeps the actual competition
  // rank for the medal number — so a tie at 1st bumps the next group's
  // rank to 3 (with no vacant 2nd slot on the podium).
  const podiumSlots = useMemo(() => {
    const ranked = allStandings.filter(s => s.wins > 0);
    const groups: { wins: number; standings: Standing[] }[] = [];
    for (const s of ranked) {
      const last = groups[groups.length - 1];
      if (last && last.wins === s.wins) last.standings.push(s);
      else groups.push({ wins: s.wins, standings: [s] });
    }
    const slots: { rank: number; standings: Standing[] }[] = [];
    let cursor = 1;
    for (const g of groups.slice(0, 3)) {
      slots.push({ rank: cursor, standings: g.standings });
      cursor += g.standings.length;
    }
    return slots;
  }, [allStandings]);
  const hasPodium = podiumSlots.length > 0;
  // Pure-wins league rank for each row (competition ranking). Two rows
  // with the same wins share the same number; the next rank skips
  // accordingly so 1, 1, 3 is possible.
  const leagueRanks = useMemo(
    () => allStandings.map(s => allStandings.filter(o => o.wins > s.wins).length + 1),
    [allStandings]
  );

  return (
    <div className="caf-root">
      {/* Podium — top 3 by total wins */}
      {hasPodium && (
        <section>
          <div className="caf-section-head">
            <div>
              <div className="caf-eyebrow">Top scorers · {rangeSubCafe(range)}</div>
              <h2>Podium</h2>
            </div>
          </div>
          <div className="caf-podium">
            {/* Visual order: 2nd slot (left) · 1st slot (centre) · 3rd
                slot (right). Slots that don't exist (e.g. only 1 group
                of players) are simply skipped — never rendered as
                vacancies. */}
            {[
              { slot: 2 as const, data: podiumSlots[1] },
              { slot: 1 as const, data: podiumSlots[0] },
              { slot: 3 as const, data: podiumSlots[2] },
            ]
              .filter(x => !!x.data)
              .map(({ slot, data }) => (
                <PodiumSpot
                  key={slot}
                  slot={slot}
                  rank={data!.rank}
                  standings={data!.standings}
                  onPickPlayer={onPickPlayer}
                />
              ))}
          </div>
        </section>
      )}

      {/* Highlights ticker — infinite left-to-right slider */}
      <section>
        <CafeTicker
          totalGames={totalGames}
          range={range}
          playerCount={players.length}
          longest={longest}
          mostActive={mostActive}
          topRate={topRate}
          mostPlayedGame={mostPlayedGame}
          champs={champs}
          onPickPlayer={onPickPlayer}
        />
      </section>

      {/* League table */}
      <section>
        <div className="caf-section-head">
          <div>
            <div className="caf-eyebrow">All games · {rangeSubCafe(range)}</div>
            <h2>League table</h2>
          </div>
        </div>
        <div className="caf-table-wrap">
          <table className="caf-table">
            <thead>
              <tr>
                <th className="caf-col-rank">#</th>
                <th>Player</th>
                <th className="num">Wins</th>
                <th className="num">Played</th>
                <th className="num caf-col-wr">Win rate</th>
                <th className="caf-col-pips">By game</th>
                <th className="caf-col-streak">Streak</th>
              </tr>
            </thead>
            <tbody>
              {allStandings.map((s, i) => {
                // Tie-aware competition ranking: equal wins → equal rank.
                const r = leagueRanks[i];
                const medalCls = s.wins > 0 && r <= 3 ? ` caf-row-medal caf-row-${r}` : "";
                const rankMedalCls = s.wins > 0 && r <= 3 ? ` caf-rank-${r}` : "";
                return (
                <tr key={s.player.id} className={"caf-row" + medalCls} onClick={() => onPickPlayer(s.player.id)}>
                  <td className="caf-col-rank">
                    <span className={"caf-rank" + rankMedalCls}>{r}</span>
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
                    </span>
                  </td>
                  <td className="caf-col-streak">
                    {s.streak > 0 ? (
                      <FireStreak n={s.streak} hot={s.streak >= 2} />
                    ) : (
                      <span className="caf-streak">—</span>
                    )}
                  </td>
                </tr>
                );
              })}
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
        {recent.length === 0 ? (
          <div className="caf-recent caf-recent-empty">
            <div className="caf-recent-empty-title">No matches yet</div>
            <div className="caf-recent-empty-sub">
              Record your first game to start the league.
            </div>
            <button className="caf-recent-empty-btn" onClick={onRecord}>
              ＋ Record a match
            </button>
          </div>
        ) : (
          <>
            <ul className="caf-recent">
              {recent.map(m => {
                const w = playerById(players, m.winner);
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
                        vs {m.players.filter(p => p !== m.winner).map(p => playerById(players, p).name).join(" · ")}
                      </div>
                    </div>
                    <span className={`caf-recent-game ${m.game}`}>{GAMES[m.game].short}</span>
                    <span className="caf-recent-date">{relTime(m.date)}</span>
                  </li>
                );
              })}
            </ul>
            <button className="caf-record-btn" onClick={onRecord}>＋ Record a match</button>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * Infinite left-to-right ticker showing high-level highlights for the
 * current range. Items: total matches, hottest streak, and the top
 * win-count holder of each real game. The track is duplicated so the
 * CSS animation can loop seamlessly.
 */
function CafeTicker({
  totalGames,
  range,
  playerCount,
  longest,
  mostActive,
  topRate,
  mostPlayedGame,
  champs,
  onPickPlayer,
}: {
  totalGames: number;
  range: Range;
  playerCount: number;
  longest: Standing | null;
  mostActive: Standing | null;
  topRate: Standing | null;
  mostPlayedGame: { game: RealGameId; count: number } | null;
  champs: { game: RealGameId; top: Standing | undefined }[];
  onPickPlayer: (id: string) => void;
}) {
  const items: React.ReactNode[] = [];

  // Build a per-card accent style derived from a player's color. The
  // soft tint is computed via color-mix so we don't have to ship a
  // pre-baked rgba for every possible player color.
  const playerAccent = (color: string): React.CSSProperties =>
    ({
      ["--tick-accent" as never]: color,
      ["--tick-accent-soft" as never]: `color-mix(in srgb, ${color} 14%, transparent)`,
    } as React.CSSProperties);

  // Matches total
  items.push(
    <div key="matches" className="caf-tick">
      <div className="caf-tick-eyebrow">Matches</div>
      <div className="caf-tick-val">{totalGames}</div>
      <div className="caf-tick-sub">{rangeSubCafe(range)}</div>
    </div>
  );

  // Players in the cafe (group regulars)
  items.push(
    <div key="players" className="caf-tick">
      <div className="caf-tick-eyebrow">Players</div>
      <div className="caf-tick-val">{playerCount}</div>
      <div className="caf-tick-sub">regulars at the table</div>
    </div>
  );

  // Hottest streak — only included when there's an active streak.
  if (longest?.streak) {
    items.push(
      <button
        key="streak"
        className="caf-tick caf-tick--streak caf-tick-btn"
        style={playerAccent(longest.player.color)}
        onClick={() => onPickPlayer(longest.player.id)}
      >
        <div className="caf-tick-eyebrow">Hottest streak</div>
        <div className="caf-tick-val caf-tick-streak">
          <FireStreak n={longest.streak} hot={longest.streak >= 2} />
          <span>{longest.player.name}</span>
        </div>
        <div className="caf-tick-sub">@{longest.player.handle}</div>
      </button>
    );
  }

  // Most active player (matches played)
  items.push(
    <button
      key="active"
      className="caf-tick caf-tick--active caf-tick-btn"
      style={mostActive?.played ? playerAccent(mostActive.player.color) : undefined}
      onClick={() => mostActive && onPickPlayer(mostActive.player.id)}
      disabled={!mostActive?.played}
    >
      <div className="caf-tick-eyebrow">Most active</div>
      {mostActive?.played ? (
        <>
          <div className="caf-tick-val caf-tick-champ">
            <span
              className="caf-tick-portrait"
              style={{ background: mostActive.player.color }}
            >
              {mostActive.player.initials}
            </span>
            <span>{mostActive.player.name}</span>
          </div>
          <div className="caf-tick-sub">
            {mostActive.played} match{mostActive.played === 1 ? "" : "es"} played
          </div>
        </>
      ) : (
        <>
          <div className="caf-tick-val">—</div>
          <div className="caf-tick-sub">no matches yet</div>
        </>
      )}
    </button>
  );

  // Best win rate (≥ 3 games to avoid 100 % on a single lucky win)
  items.push(
    <button
      key="rate"
      className="caf-tick caf-tick--rate caf-tick-btn"
      style={topRate ? playerAccent(topRate.player.color) : undefined}
      onClick={() => topRate && onPickPlayer(topRate.player.id)}
      disabled={!topRate}
    >
      <div className="caf-tick-eyebrow">Top win rate</div>
      {topRate ? (
        <>
          <div className="caf-tick-val caf-tick-champ">
            <span
              className="caf-tick-portrait"
              style={{ background: topRate.player.color }}
            >
              {topRate.player.initials}
            </span>
            <span>{Math.round(topRate.winRate * 100)}%</span>
          </div>
          <div className="caf-tick-sub">
            {topRate.player.name} · {topRate.played} played
          </div>
        </>
      ) : (
        <>
          <div className="caf-tick-val">—</div>
          <div className="caf-tick-sub">need ≥ 3 games</div>
        </>
      )}
    </button>
  );

  // Most-played game in the current range
  items.push(
    <div
      key="popular"
      className={`caf-tick${mostPlayedGame ? ` caf-tick--${mostPlayedGame.game}` : ""}`}
    >
      <div className="caf-tick-eyebrow caf-tick-eyebrow-icon">
        {mostPlayedGame && (
          <span className={`caf-tick-glyph caf-tick-glyph-${mostPlayedGame.game}`}>
            <CafeGameGlyph id={mostPlayedGame.game} />
          </span>
        )}
        Most played
      </div>
      {mostPlayedGame ? (
        <>
          <div className="caf-tick-val">{GAMES[mostPlayedGame.game].label}</div>
          <div className="caf-tick-sub">
            {mostPlayedGame.count} match{mostPlayedGame.count === 1 ? "" : "es"} · {rangeSubCafe(range)}
          </div>
        </>
      ) : (
        <>
          <div className="caf-tick-val">—</div>
          <div className="caf-tick-sub">no matches yet</div>
        </>
      )}
    </div>
  );

  // One card per real game champion
  for (const c of champs) {
    items.push(
      <button
        key={`champ-${c.game}`}
        className={`caf-tick caf-tick--${c.game} caf-tick-btn`}
        style={c.top ? playerAccent(c.top.player.color) : undefined}
        onClick={() => c.top && onPickPlayer(c.top.player.id)}
        disabled={!c.top}
      >
        <div className="caf-tick-eyebrow caf-tick-eyebrow-icon">
          <span className={`caf-tick-glyph caf-tick-glyph-${c.game}`}>
            <CafeGameGlyph id={c.game} />
          </span>
          {GAMES[c.game].label} champion
        </div>
        {c.top ? (
          <>
            <div className="caf-tick-val caf-tick-champ">
              <span
                className="caf-tick-portrait"
                style={{ background: c.top.player.color }}
              >
                {c.top.player.initials}
              </span>
              <span>{c.top.player.name}</span>
            </div>
            <div className="caf-tick-sub">
              {c.top.wins} win{c.top.wins === 1 ? "" : "s"} · {Math.round(c.top.winRate * 100)}% rate
            </div>
          </>
        ) : (
          <>
            <div className="caf-tick-val">—</div>
            <div className="caf-tick-sub">no matches yet</div>
          </>
        )}
      </button>
    );
  }

  return (
    <div className="caf-ticker" aria-label="Cafe highlights">
      <div className="caf-ticker-track">
        {items}
        {/* Duplicate copy for seamless infinite loop. Hidden from
            assistive tech to avoid duplicate announcements. */}
        <div className="caf-ticker-dup" aria-hidden="true">
          {items}
        </div>
      </div>
    </div>
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
  return null;
}

function FireStreak({ n, hot }: { n: number; hot: boolean }) {
  // Stylised cartoon flame inspired by the "orange flames collection" art
  // pack — bulbous base, twin pointed tongues at the top, layered
  // orange→yellow gradients. The outer (red-orange) and inner (yellow)
  // bodies animate independently for a flicker effect; the number sits
  // statically inside the bulb so digits don't wobble.
  const uid = useId().replace(/[:]/g, "");
  const gOuter = `caf-flame-outer-${uid}`;
  const gInner = `caf-flame-inner-${uid}`;
  const cls = "caf-flame" + (hot ? " caf-flame-hot" : "");
  // Slightly smaller glyph for double-digit streaks
  const fontSize = n >= 10 ? 13 : 16;
  return (
    <span className={cls} aria-label={`${n} win streak`}>
      <svg
        viewBox="0 0 32 44"
        width="22"
        height="30"
        role="img"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gOuter} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="var(--flame-tip,  #f04e1c)" />
            <stop offset="55%"  stopColor="var(--flame-mid,  #f7831c)" />
            <stop offset="100%" stopColor="var(--flame-base, #ffae00)" />
          </linearGradient>
          <linearGradient id={gInner} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="var(--flame-inner-top, #f7a51c)" />
            <stop offset="60%"  stopColor="var(--flame-inner-mid, #fcd84a)" />
            <stop offset="100%" stopColor="var(--flame-inner-bot, #fff2a8)" />
          </linearGradient>
        </defs>
        {/* Outer flame — twin-tongue silhouette, wide bulbous base */}
        <path
          className="caf-flame-outer"
          d="M 17 3
             C 19 8, 22.5 11, 23.5 16
             C 24.5 14, 25 11.5, 25 9
             C 26.5 13, 25 17, 25.5 21
             C 27.5 25, 29 29, 29 33
             C 29 38.5, 23.2 42, 16 42
             C 8.8 42, 3 38.5, 3 33
             C 3 25, 10.5 22, 11.5 15
             C 12 11, 13.5 7, 17 3 Z"
          fill={`url(#${gOuter})`}
        />
        {/* Inner flame — softer, smaller core sitting in the bulb */}
        <path
          className="caf-flame-inner"
          d="M 17 17
             C 18 20, 20 22.5, 20 26
             C 20 28, 21 30, 21 32.5
             C 21 36.5, 18.5 39, 16 39
             C 13.2 39, 10.5 36.8, 10.5 33
             C 10.5 30, 12.5 28, 12.5 25.5
             C 12.5 22, 14.5 19.5, 17 17 Z"
          fill={`url(#${gInner})`}
        />
        {/* Streak count sitting in the bulb */}
        <text
          x="16"
          y="37"
          textAnchor="middle"
          fontFamily="'IBM Plex Sans', system-ui, sans-serif"
          fontSize={fontSize}
          fontWeight={800}
          fill="#1f0a02"
          stroke="rgba(255, 240, 200, .55)"
          strokeWidth={0.4}
          paintOrder="stroke"
        >
          {n}
        </text>
      </svg>
    </span>
  );
}

function PodiumSpot({
  slot,
  rank,
  standings,
  onPickPlayer,
}: {
  /** Visual position on the podium: 1 = centre (gold), 2 = left
   *  (silver), 3 = right (bronze). Drives card sizing/colour only. */
  slot: 1 | 2 | 3;
  /** Actual competition rank shown on the medal (e.g. `3` if there's a
   *  tie at 1st above this slot). */
  rank: number;
  standings: Standing[];
  onPickPlayer: (id: string) => void;
}) {
  const baseCls = `caf-podium-spot caf-podium-spot-${slot}`;
  const medal = String(rank);

  // Solo holder — entire card is the click target
  if (standings.length === 1) {
    const s = standings[0];
    return (
      <button
        className={baseCls}
        onClick={() => onPickPlayer(s.player.id)}
        aria-label={`Rank ${rank}: ${s.player.name}`}
      >
        <div className="caf-podium-medal">{medal}</div>
        <div className="caf-podium-avatar" style={{ background: s.player.color }}>
          {s.player.initials}
        </div>
        <div className="caf-podium-name">{s.player.name}</div>
        <div className="caf-podium-handle">@{s.player.handle}</div>
        <div className="caf-podium-wins">{s.wins}</div>
        <div className="caf-podium-wins-lbl">{s.wins === 1 ? "win" : "wins"}</div>
      </button>
    );
  }

  // Tied — multiple players share this place. Each avatar is its own
  // click target so users can still drill into a specific profile.
  const wins = standings[0].wins;
  const visible = standings.slice(0, 4);
  const overflow = standings.length - visible.length;
  const names =
    standings.length === 2
      ? `${standings[0].player.name} & ${standings[1].player.name}`
      : `${standings.length} players tied`;
  return (
    <div className={`${baseCls} caf-podium-spot-tied`}>
      <div className="caf-podium-medal">{medal}</div>
      <div className="caf-podium-stack">
        {visible.map(s => (
          <button
            key={s.player.id}
            type="button"
            className="caf-podium-avatar caf-podium-avatar-btn"
            style={{ background: s.player.color }}
            onClick={() => onPickPlayer(s.player.id)}
            aria-label={`Open ${s.player.name}'s profile`}
          >
            {s.player.initials}
          </button>
        ))}
        {overflow > 0 && (
          <span className="caf-podium-avatar caf-podium-avatar-more">+{overflow}</span>
        )}
      </div>
      <div className="caf-podium-name">{names}</div>
      <div className="caf-podium-handle">tied</div>
      <div className="caf-podium-wins">{wins}</div>
      <div className="caf-podium-wins-lbl">{wins === 1 ? "win" : "wins"}</div>
    </div>
  );
}

function rangeSubCafe(r: Range): string {
  if (r === "week")  return "past 7 days";
  if (r === "month") return "past 30 days";
  return "all time";
}

export default CafeView;
