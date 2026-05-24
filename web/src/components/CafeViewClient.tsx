"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  GAMES,
  type GameId,
  type Player,
  type Range,
  type Standing,
} from "@/data/data";

interface Props {
  standings: Standing[];
  members: Player[];
  game: GameId;
  range: Range;
}

const GAME_IDS: GameId[] = ["cafe", "catan", "carcassonne", "monopoly"];
const RANGES: Range[] = ["week", "month", "all"];

export function CafeViewClient({ standings, members, game, range }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setFilter(next: Partial<{ game: GameId; range: Range }>) {
    const url = new URLSearchParams(params.toString());
    if (next.game)  url.set("game", next.game);
    if (next.range) url.set("range", next.range);
    startTransition(() => router.push(`/?${url.toString()}`));
  }

  const totalWins = standings.reduce((sum, s) => sum + s.wins, 0);
  const longest = standings.reduce<Standing | null>(
    (m, s) => (s.streak > (m?.streak ?? 0) ? s : m),
    null,
  );
  const mostActive = [...standings].sort((a, b) => b.played - a.played)[0];

  return (
    <div className="caf-root" style={{ maxWidth: 960, margin: "0 auto", padding: "0 16px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0" }}>
        <h1 style={{ margin: 0, fontFamily: "system-ui", fontSize: 24 }}>
          Table Topper · {GAMES[game].label}
        </h1>
        <form action="/auth/signout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </header>

      <nav style={{ display: "flex", gap: 8, marginBottom: 12 }} aria-label="Game">
        {GAME_IDS.map(g => (
          <button
            key={g}
            disabled={g === game || pending}
            onClick={() => setFilter({ game: g })}
            aria-pressed={g === game}
          >
            {GAMES[g].short}
          </button>
        ))}
      </nav>
      <nav style={{ display: "flex", gap: 8, marginBottom: 16 }} aria-label="Range">
        {RANGES.map(r => (
          <button
            key={r}
            disabled={r === range || pending}
            onClick={() => setFilter({ range: r })}
            aria-pressed={r === range}
          >
            {r === "week" ? "Past 7 days" : r === "month" ? "Past 30 days" : "All time"}
          </button>
        ))}
      </nav>

      <section style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
        <Stat label="Roster" value={members.length} sub="people" />
        <Stat label="Wins (this view)" value={totalWins} sub={rangeSub(range)} />
        <Stat
          label="Hottest streak"
          value={longest?.streak ? `🔥 ${longest.streak}` : "—"}
          sub={longest?.streak ? longest.player.name : "no current streaks"}
        />
        <Stat
          label="Most active"
          value={mostActive?.played ?? "—"}
          sub={mostActive?.player.name ?? ""}
        />
      </section>

      <section>
        <h2 style={{ fontSize: 18 }}>League table</h2>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={th}>Player</th>
              <th style={thNum}>Wins</th>
              <th style={thNum}>Played</th>
              <th style={thNum}>Win rate</th>
              <th style={th}>By game</th>
              <th style={thNum}>Streak</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.member_id}>
                <td style={td}>{i + 1}</td>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: s.player.color, color: "white",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 600,
                    }}>
                      {s.player.initials}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.player.name}</div>
                      {s.player.handle && (
                        <div style={{ fontSize: 11, color: "#888" }}>@{s.player.handle}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={tdNum}><strong>{s.wins}</strong></td>
                <td style={tdNum}>{s.played}</td>
                <td style={tdNum}>{Math.round(s.winRate * 100)}%</td>
                <td style={td}>
                  <span style={{ fontSize: 12, color: "#666" }}>
                    C {s.byGame.catan} · K {s.byGame.carcassonne} · M {s.byGame.monopoly}
                  </span>
                </td>
                <td style={tdNum}>
                  {s.streak > 0 ? `🔥 ${s.streak}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#666" }}>{sub}</div>}
    </div>
  );
}

function rangeSub(r: Range): string {
  if (r === "week")  return "past 7 days";
  if (r === "month") return "past 30 days";
  return "all time";
}

const th: React.CSSProperties    = { textAlign: "left",  padding: 8, borderBottom: "1px solid #ddd", fontSize: 12 };
const thNum: React.CSSProperties = { textAlign: "right", padding: 8, borderBottom: "1px solid #ddd", fontSize: 12 };
const td: React.CSSProperties    = { padding: 8, borderBottom: "1px solid #f0f0f0" };
const tdNum: React.CSSProperties = { padding: 8, borderBottom: "1px solid #f0f0f0", textAlign: "right" };
