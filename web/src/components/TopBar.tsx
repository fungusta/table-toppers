"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GameId, Range } from "@/data/data";

interface TopBarProps {
  tab: GameId;
  setTab: (id: GameId) => void;
  range: Range;
  setRange: (r: Range) => void;
  onRecord: () => void;
  onHistory: () => void;
  groupId: string;
  groupName: string;
  groupRole: 'owner' | 'member';
  groups: { id: string; name: string }[];
}

const TABS: { id: GameId; label: string; sub: string }[] = [
  { id: "cafe",        label: "The Cafe",    sub: "All games" },
  { id: "catan",       label: "Catan",       sub: "Hexes & roads" },
  { id: "carcassonne", label: "Carcassonne", sub: "Tiles & meeples" },
];

const RANGES: { id: Range; label: string }[] = [
  { id: "week",  label: "7d"  },
  { id: "month", label: "30d" },
  { id: "all",   label: "All" },
];

export function TopBar({
  tab, setTab, range, setRange, onRecord, onHistory,
  groupId, groupName, groupRole, groups,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <GroupSwitcher
          groupId={groupId}
          groupName={groupName}
          groupRole={groupRole}
          groups={groups}
        />

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

function GroupSwitcher({
  groupId,
  groupName,
  groupRole,
  groups,
}: {
  groupId: string;
  groupName: string;
  groupRole: 'owner' | 'member';
  groups: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const others = groups.filter(g => g.id !== groupId);

  return (
    <div className="topbar-brand" ref={ref} style={{ position: 'relative' }}>
      <div className="topbar-logo">
        <SunIcon />
      </div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          cursor: 'pointer',
          color: 'inherit',
          font: 'inherit',
        }}
      >
        <div className="topbar-brand-text">
          <div className="topbar-brand-name">{groupName} ▾</div>
          <div className="topbar-brand-sub">Leaderboard</div>
        </div>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            minWidth: 240,
            background: '#fff',
            color: '#222',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            borderRadius: 6,
            padding: '6px 0',
            zIndex: 10,
            fontSize: '0.95em',
          }}
        >
          <div style={{ padding: '6px 12px', fontWeight: 600 }}>
            <span style={{ marginRight: 6 }}>✓</span>
            {groupName}
          </div>
          {others.length > 0 && <Divider />}
          {others.map(g => (
            <Link
              key={g.id}
              href={`/g/${g.id}/`}
              role="menuitem"
              onClick={() => setOpen(false)}
              style={{ display: 'block', padding: '6px 12px', color: 'inherit', textDecoration: 'none' }}
            >
              {g.name}
            </Link>
          ))}
          <Divider />
          <Link
            href="/groups/new"
            role="menuitem"
            onClick={() => setOpen(false)}
            style={{ display: 'block', padding: '6px 12px', color: 'inherit', textDecoration: 'none' }}
          >
            + Create group
          </Link>
          <Link
            href={`/g/${groupId}/manage`}
            role="menuitem"
            onClick={() => setOpen(false)}
            style={{ display: 'block', padding: '6px 12px', color: 'inherit', textDecoration: 'none' }}
          >
            {groupRole === 'owner' ? '⚙ Manage group' : '✉ Invite players'}
          </Link>
          <Divider />
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              role="menuitem"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
                font: 'inherit',
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: '#eee', margin: '4px 0' }} />;
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
