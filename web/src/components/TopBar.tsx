"use client";

import type { GameId, Range } from "@/data/data";

interface TopBarProps {
  tab: GameId;
  setTab: (id: GameId) => void;
  range: Range;
  setRange: (r: Range) => void;
  onRecord: () => void;
  onHistory: () => void;
}

const TABS: { id: GameId; label: string; sub: string }[] = [
  { id: "cafe",        label: "The Cafe",    sub: "All games" },
  { id: "catan",       label: "Catan",       sub: "Hexes & roads" },
  { id: "carcassonne", label: "Carcassonne", sub: "Tiles & meeples" },
  { id: "monopoly",    label: "Monopoly",    sub: "Title deeds" },
];

const RANGES: { id: Range; label: string }[] = [
  { id: "week",  label: "7d"  },
  { id: "month", label: "30d" },
  { id: "all",   label: "All" },
];

export function TopBar({ tab, setTab, range, setRange, onRecord, onHistory }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-brand">
          <div className="topbar-logo">
            <SunIcon />
          </div>
          <div className="topbar-brand-text">
            <div className="topbar-brand-name">Sunday Strategists</div>
            <div className="topbar-brand-sub">Leaderboard · est. 2023</div>
          </div>
        </div>

        <nav className="topbar-tabs" role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              className={"topbar-tab" + (tab === t.id ? " topbar-tab-on" : "")}
              onClick={() => setTab(t.id)}
              data-tab={t.id}
            >
              <span className="topbar-tab-glyph">
                <TabGlyph id={t.id} />
              </span>
              <span className="topbar-tab-text">
                <span className="topbar-tab-label">{t.label}</span>
                <span className="topbar-tab-sub">{t.sub}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <div className="topbar-range">
            {RANGES.map(r => (
              <button
                key={r.id}
                className={"topbar-range-btn" + (range === r.id ? " topbar-range-on" : "")}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button className="topbar-btn topbar-btn-ghost" onClick={onHistory}>History</button>
          <button className="topbar-btn topbar-btn-primary" onClick={onRecord}>＋ Record</button>
        </div>
      </div>
    </header>
  );
}

function TabGlyph({ id }: { id: GameId }) {
  if (id === "cafe") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path d="M3 5 L11 6 L11 20 L3 19 Z" fill="currentColor" opacity=".25" />
        <path d="M21 5 L13 6 L13 20 L21 19 Z" fill="currentColor" opacity=".25" />
        <path
          d="M3 5 L11 6 M11 6 L13 6 M13 6 L21 5 M11 6 L11 20 M13 6 L13 20"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
    );
  }
  if (id === "catan") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20">
        <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" fill="currentColor" opacity=".2" />
        <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    );
  }
  if (id === "carcassonne") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20">
        <rect x="3" y="3" width="18" height="18" rx="1" fill="currentColor" opacity=".18" />
        <rect x="3" y="3" width="18" height="18" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      </svg>
    );
  }
  if (id === "monopoly") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20">
        <rect x="3" y="3" width="18" height="18" fill="currentColor" opacity=".18" />
        <rect x="3" y="3" width="18" height="4" fill="currentColor" />
        <rect x="3" y="3" width="18" height="18" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    );
  }
  return null;
}

function SunIcon() {
  const rays = Array.from({ length: 8 }).map((_, i) => {
    const a = (Math.PI * 2 * i) / 8;
    const x1 = 16 + Math.cos(a) * 9;
    const y1 = 16 + Math.sin(a) * 9;
    const x2 = 16 + Math.cos(a) * 13;
    const y2 = 16 + Math.sin(a) * 13;
    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />;
  });
  return (
    <svg viewBox="0 0 32 32" width="28" height="28">
      <circle cx="16" cy="16" r="6" fill="currentColor" />
      {rays}
    </svg>
  );
}
