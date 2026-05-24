"use client";

import { useMemo } from "react";
import {
  computeStandings,
  filterMatches,
  PLAYERS,
  playerById,
  relTime,
  type Match,
  type Range,
  type Standing,
} from "@/data/data";

interface CatanViewProps {
  matches: Match[];
  range: Range;
  onPickPlayer: (id: string) => void;
  onRecord: () => void;
  onOpenHistory: () => void;
}

export function CatanView({ matches, range, onPickPlayer, onRecord, onOpenHistory }: CatanViewProps) {
  const standings = useMemo(
    () => computeStandings(PLAYERS, matches, "catan", range),
    [matches, range]
  );
  const recent = useMemo(
    () => filterMatches(matches, "catan", range).slice(0, 5),
    [matches, range]
  );

  return (
    <div className="ctn-root">
      <header className="ctn-header">
        <div className="ctn-header-bg" aria-hidden="true">
          <CatanHexPattern />
        </div>
        <div className="ctn-header-inner">
          <div className="ctn-header-tag">⬡ Settler&apos;s Standings · {rangeLabelCatan(range)}</div>
          <h1 className="ctn-title">CATAN</h1>
          <div className="ctn-header-sub">Leaderboard of the Sunday Strategists</div>
        </div>
      </header>

      <section className="ctn-standings-section">
        <div className="ctn-section-head">
          <h2>All Settlers</h2>
          <p>Win count by resource. Click a card to view the settler&apos;s record.</p>
        </div>
        <div className="ctn-cards">
          {standings.map((s, i) => (
            <CatanCard
              key={s.player.id}
              standing={s}
              rank={i + 1}
              onClick={() => onPickPlayer(s.player.id)}
            />
          ))}
        </div>
      </section>

      <section className="ctn-recent-section">
        <div className="ctn-section-head">
          <h2>Recent Voyages</h2>
          <button className="ctn-link" onClick={onOpenHistory}>Open full chronicle →</button>
        </div>
        <ul className="ctn-recent">
          {recent.map(m => {
            const w = playerById(m.winner);
            return (
              <li key={m.id} className="ctn-recent-row" onClick={() => onPickPlayer(w.id)}>
                <div className="ctn-recent-body">
                  <div className="ctn-recent-title"><strong>{w.name}</strong> claimed the longest road</div>
                  <div className="ctn-recent-sub">
                    vs {m.players.filter(p => p !== m.winner).map(p => playerById(p).name).join(" · ")}
                  </div>
                </div>
                <div className="ctn-recent-date">{relTime(m.date)}</div>
              </li>
            );
          })}
        </ul>
        <button className="ctn-record-btn" onClick={onRecord}>
          ⬡ Record a Catan match
        </button>
      </section>
    </div>
  );
}

function CatanCard({
  standing,
  rank,
  onClick,
}: {
  standing: Standing;
  rank: number;
  onClick: () => void;
}) {
  const s = standing;
  const frames = [
    { frame: "#1d6fb5", deep: "#0f4a82", accent: "#9c4b34" },
    { frame: "#9c4b34", deep: "#6e2f1f", accent: "#1d6fb5" },
    { frame: "#3d6b3d", deep: "#244524", accent: "#9c4b34" },
    { frame: "#c9a25e", deep: "#8a6a2e", accent: "#9c4b34" },
    { frame: "#5d6b7a", deep: "#3a4654", accent: "#9c4b34" },
  ];
  const f = frames[(rank - 1) % frames.length];
  const cssVars: React.CSSProperties = {
    ["--ctn-frame" as string]: f.frame,
    ["--ctn-frame-deep" as string]: f.deep,
    ["--ctn-frame-accent" as string]: f.accent,
  };
  return (
    <button
      className={"ctn-card" + (rank === 1 ? " ctn-card-top" : "")}
      onClick={onClick}
      style={cssVars}
    >
      <div className="ctn-card-corner">{rank === 1 ? "★" : `#${rank}`}</div>

      <div className="ctn-card-row">
        <div className="ctn-card-name">{s.player.name}</div>
        <div className="ctn-card-vp">
          <span className="ctn-card-vp-eq">=</span>
          <span className="ctn-card-vp-num">{s.wins}</span>
          <span className="ctn-card-vp-lbl">{s.wins === 1 ? "VP" : "VPs"}</span>
        </div>
      </div>

      <div className="ctn-card-rule" aria-hidden="true" />

      <div className="ctn-card-meta">
        <span>{s.played} matches</span>
        <span className="ctn-dot">⬡</span>
        <span>{Math.round(s.winRate * 100)}% win rate</span>
        {s.streak > 0 && (
          <>
            <span className="ctn-dot">⬡</span>
            <span>🔥 {s.streak}</span>
          </>
        )}
      </div>
    </button>
  );
}

function CatanHexPattern() {
  const size = 36;
  const w = Math.sqrt(3) * size;
  const h = 2 * size;
  const hexes: React.ReactNode[] = [];
  for (let r = -2; r < 6; r++) {
    for (let c = -2; c < 14; c++) {
      const cx = c * w + (r % 2 ? w / 2 : 0);
      const cy = r * h * 0.75;
      hexes.push(
        <polygon
          key={`${r}-${c}`}
          points={hexPts(cx, cy, size)}
          fill="none"
          stroke="rgba(244,230,200,.13)"
          strokeWidth="1"
        />
      );
    }
  }
  return (
    <svg
      className="ctn-header-pattern"
      viewBox="0 0 900 280"
      preserveAspectRatio="xMidYMid slice"
    >
      {hexes}
    </svg>
  );
}

function hexPts(cx: number, cy: number, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${cx + size * Math.cos(a)},${cy + size * Math.sin(a)}`);
  }
  return pts.join(" ");
}

function rangeLabelCatan(r: Range): string {
  if (r === "week") return "past 7 days";
  if (r === "month") return "past 30 days";
  return "all time";
}

export default CatanView;
