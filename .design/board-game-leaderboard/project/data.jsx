// data.jsx — mock data for The Sunday Strategists
// 8 players, 3 games, ~50 matches over the last 6 months.

const PLAYERS = [
  { id: 'mara',   name: 'Mara',   handle: 'the_architect',  color: '#b9543d', initials: 'MA', joined: '2023-09' },
  { id: 'tomas',  name: 'Tomás',  handle: 'dice_whisperer', color: '#5b7a4a', initials: 'TO', joined: '2023-09' },
  { id: 'lena',   name: 'Lena',   handle: 'meeple_mayor',   color: '#8a6a2e', initials: 'LE', joined: '2023-11' },
  { id: 'wren',   name: 'Wren',   handle: 'the_trader',     color: '#4a6b7a', initials: 'WR', joined: '2024-01' },
  { id: 'jules',  name: 'Jules',  handle: 'sheep_baron',    color: '#7a4a6b', initials: 'JU', joined: '2024-02' },
  { id: 'otto',   name: 'Otto',   handle: 'tile_layer',     color: '#3d6b56', initials: 'OT', joined: '2024-03' },
  { id: 'hana',   name: 'Hana',   handle: 'rent_collector', color: '#a8744a', initials: 'HA', joined: '2024-05' },
  { id: 'felix',  name: 'Felix',  handle: 'longest_road',   color: '#5d4a7a', initials: 'FE', joined: '2024-08' },
];

const GAMES = {
  cafe:        { id: 'cafe',        label: 'All Games',    short: 'All' },
  catan:       { id: 'catan',       label: 'Catan',        short: 'Catan' },
  carcassonne: { id: 'carcassonne', label: 'Carcassonne',  short: 'Carc.' },
  monopoly:    { id: 'monopoly',    label: 'Monopoly',     short: 'Mono.' },
};

// Curated match history — each match has: id, game, date (ISO), players[], winner.
// Dates span Nov 2025 → May 2026 so "last week / month / all" filters all return data.
const MATCHES = [
  // ===== May 2026 (recent — "this week" / "this month") =====
  { id: 51, game: 'catan',       date: '2026-05-22', players: ['mara','tomas','lena','wren'],          winner: 'mara'  },
  { id: 50, game: 'carcassonne', date: '2026-05-21', players: ['otto','hana','felix'],                 winner: 'otto'  },
  { id: 49, game: 'monopoly',    date: '2026-05-19', players: ['hana','jules','wren','felix'],         winner: 'hana'  },
  { id: 48, game: 'catan',       date: '2026-05-17', players: ['tomas','jules','otto','felix'],        winner: 'tomas' },
  { id: 47, game: 'carcassonne', date: '2026-05-15', players: ['lena','mara','otto'],                  winner: 'lena'  },
  { id: 46, game: 'catan',       date: '2026-05-12', players: ['wren','mara','jules','tomas'],         winner: 'mara'  },
  { id: 45, game: 'monopoly',    date: '2026-05-10', players: ['hana','felix','lena'],                 winner: 'hana'  },
  { id: 44, game: 'carcassonne', date: '2026-05-08', players: ['otto','wren','felix','jules'],         winner: 'otto'  },
  { id: 43, game: 'catan',       date: '2026-05-05', players: ['mara','lena','hana','tomas'],          winner: 'tomas' },
  { id: 42, game: 'monopoly',    date: '2026-05-02', players: ['hana','jules','otto','wren'],          winner: 'jules' },

  // ===== April 2026 =====
  { id: 41, game: 'carcassonne', date: '2026-04-28', players: ['otto','lena','mara','felix'],          winner: 'otto'  },
  { id: 40, game: 'catan',       date: '2026-04-25', players: ['mara','wren','tomas','jules'],         winner: 'mara'  },
  { id: 39, game: 'monopoly',    date: '2026-04-22', players: ['hana','felix','wren'],                 winner: 'hana'  },
  { id: 38, game: 'catan',       date: '2026-04-18', players: ['tomas','mara','otto','lena'],          winner: 'mara'  },
  { id: 37, game: 'carcassonne', date: '2026-04-15', players: ['otto','jules','hana'],                 winner: 'otto'  },
  { id: 36, game: 'monopoly',    date: '2026-04-11', players: ['hana','tomas','felix','wren'],         winner: 'felix' },
  { id: 35, game: 'catan',       date: '2026-04-08', players: ['mara','lena','wren','jules'],          winner: 'mara'  },
  { id: 34, game: 'carcassonne', date: '2026-04-04', players: ['lena','otto','tomas'],                 winner: 'lena'  },
  { id: 33, game: 'monopoly',    date: '2026-04-01', players: ['jules','hana','felix','wren'],         winner: 'hana'  },

  // ===== March 2026 =====
  { id: 32, game: 'catan',       date: '2026-03-28', players: ['tomas','mara','wren','otto'],          winner: 'tomas' },
  { id: 31, game: 'carcassonne', date: '2026-03-25', players: ['otto','felix','lena','jules'],         winner: 'otto'  },
  { id: 30, game: 'catan',       date: '2026-03-21', players: ['mara','jules','hana'],                 winner: 'mara'  },
  { id: 29, game: 'monopoly',    date: '2026-03-18', players: ['hana','wren','felix','tomas'],         winner: 'hana'  },
  { id: 28, game: 'carcassonne', date: '2026-03-14', players: ['lena','mara','otto','wren'],           winner: 'lena'  },
  { id: 27, game: 'catan',       date: '2026-03-10', players: ['mara','tomas','felix','jules'],        winner: 'jules' },
  { id: 26, game: 'monopoly',    date: '2026-03-07', players: ['hana','jules','lena','otto'],          winner: 'hana'  },
  { id: 25, game: 'carcassonne', date: '2026-03-03', players: ['otto','tomas','felix'],                winner: 'otto'  },

  // ===== February 2026 =====
  { id: 24, game: 'catan',       date: '2026-02-26', players: ['mara','wren','lena','hana'],           winner: 'mara'  },
  { id: 23, game: 'monopoly',    date: '2026-02-22', players: ['hana','felix','jules'],                winner: 'hana'  },
  { id: 22, game: 'carcassonne', date: '2026-02-18', players: ['otto','lena','mara','tomas'],          winner: 'lena'  },
  { id: 21, game: 'catan',       date: '2026-02-14', players: ['tomas','mara','jules','wren'],         winner: 'tomas' },
  { id: 20, game: 'monopoly',    date: '2026-02-10', players: ['jules','hana','wren','otto'],          winner: 'jules' },
  { id: 19, game: 'carcassonne', date: '2026-02-06', players: ['otto','felix','hana'],                 winner: 'otto'  },
  { id: 18, game: 'catan',       date: '2026-02-02', players: ['mara','otto','lena','felix'],          winner: 'mara'  },

  // ===== January 2026 =====
  { id: 17, game: 'monopoly',    date: '2026-01-28', players: ['hana','tomas','wren'],                 winner: 'hana'  },
  { id: 16, game: 'catan',       date: '2026-01-24', players: ['tomas','jules','mara','otto'],         winner: 'tomas' },
  { id: 15, game: 'carcassonne', date: '2026-01-20', players: ['lena','otto','wren','jules'],          winner: 'lena'  },
  { id: 14, game: 'catan',       date: '2026-01-16', players: ['mara','hana','felix','wren'],          winner: 'wren'  },
  { id: 13, game: 'monopoly',    date: '2026-01-12', players: ['hana','jules','otto','felix'],         winner: 'hana'  },
  { id: 12, game: 'carcassonne', date: '2026-01-08', players: ['otto','mara','tomas'],                 winner: 'otto'  },
  { id: 11, game: 'catan',       date: '2026-01-04', players: ['mara','lena','jules','hana'],          winner: 'mara'  },

  // ===== December 2025 =====
  { id: 10, game: 'monopoly',    date: '2025-12-28', players: ['hana','wren','felix','tomas'],         winner: 'felix' },
  { id: 9,  game: 'carcassonne', date: '2025-12-22', players: ['otto','lena','jules'],                 winner: 'otto'  },
  { id: 8,  game: 'catan',       date: '2025-12-18', players: ['tomas','mara','otto','wren'],          winner: 'mara'  },
  { id: 7,  game: 'monopoly',    date: '2025-12-14', players: ['hana','jules','lena'],                 winner: 'hana'  },
  { id: 6,  game: 'carcassonne', date: '2025-12-10', players: ['lena','otto','felix','mara'],          winner: 'otto'  },
  { id: 5,  game: 'catan',       date: '2025-12-05', players: ['mara','tomas','jules','felix'],        winner: 'tomas' },

  // ===== November 2025 =====
  { id: 4,  game: 'monopoly',    date: '2025-11-26', players: ['hana','wren','otto','jules'],          winner: 'hana'  },
  { id: 3,  game: 'catan',       date: '2025-11-19', players: ['mara','tomas','lena','wren'],          winner: 'mara'  },
  { id: 2,  game: 'carcassonne', date: '2025-11-12', players: ['otto','jules','felix'],                winner: 'otto'  },
  { id: 1,  game: 'monopoly',    date: '2025-11-05', players: ['hana','tomas','mara','wren'],          winner: 'hana'  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Aggregations

// Returns matches filtered by game id ('cafe' = all) and time range.
function filterMatches(matches, gameId, range) {
  const today = new Date('2026-05-23'); // pinned "today" for deterministic filtering
  let cutoff = null;
  if (range === 'week')  { cutoff = new Date(today); cutoff.setDate(today.getDate() - 7); }
  if (range === 'month') { cutoff = new Date(today); cutoff.setDate(today.getDate() - 30); }
  return matches.filter(m => {
    if (gameId !== 'cafe' && m.game !== gameId) return false;
    if (cutoff && new Date(m.date) < cutoff) return false;
    return true;
  });
}

// Returns: [{ player, wins, played, winRate, streak, byGame:{catan:n,...}, fav }]
// sorted by wins desc, then winRate desc, then played asc.
function computeStandings(players, matches, gameId, range) {
  const filtered = filterMatches(matches, gameId, range);
  const stats = {};
  for (const p of players) {
    stats[p.id] = {
      player: p,
      wins: 0, played: 0, winRate: 0, streak: 0,
      byGame: { catan: 0, carcassonne: 0, monopoly: 0 },
      playedByGame: { catan: 0, carcassonne: 0, monopoly: 0 },
    };
  }
  // sort matches oldest-first for streak calc
  const ordered = [...filtered].sort((a,b) => a.date.localeCompare(b.date));
  const lastResult = {}; // pid -> 'W' | 'L'
  const curStreak = {};  // pid -> n
  for (const m of ordered) {
    for (const pid of m.players) {
      if (!stats[pid]) continue;
      stats[pid].played += 1;
      stats[pid].playedByGame[m.game] = (stats[pid].playedByGame[m.game] || 0) + 1;
      const won = m.winner === pid;
      if (won) {
        stats[pid].wins += 1;
        stats[pid].byGame[m.game] = (stats[pid].byGame[m.game] || 0) + 1;
      }
      // streak: count consecutive most-recent wins
      if (won) {
        if (lastResult[pid] === 'W') curStreak[pid] = (curStreak[pid] || 0) + 1;
        else curStreak[pid] = 1;
      } else {
        curStreak[pid] = 0;
      }
      lastResult[pid] = won ? 'W' : 'L';
    }
  }
  for (const pid in stats) {
    stats[pid].streak = curStreak[pid] || 0;
    stats[pid].winRate = stats[pid].played ? stats[pid].wins / stats[pid].played : 0;
    // favorite game = most-played
    const pbg = stats[pid].playedByGame;
    stats[pid].fav = Object.keys(pbg).reduce((a,b) => pbg[a] >= pbg[b] ? a : b, 'catan');
  }
  return Object.values(stats).sort((a,b) =>
    b.wins - a.wins || b.winRate - a.winRate || a.played - b.played
  );
}

// Head-to-head record between two player ids — returns {aWins, bWins, played}
function headToHead(matches, aId, bId) {
  let aWins=0, bWins=0, played=0;
  for (const m of matches) {
    if (!m.players.includes(aId) || !m.players.includes(bId)) continue;
    played += 1;
    if (m.winner === aId) aWins += 1;
    else if (m.winner === bId) bWins += 1;
  }
  return { aWins, bWins, played };
}

function playerById(id) { return PLAYERS.find(p => p.id === id); }
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDateLong(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function relTime(iso) {
  const today = new Date('2026-05-23');
  const d = new Date(iso);
  const days = Math.round((today - d) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.round(days/7)}w ago`;
  if (days < 365) return `${Math.round(days/30)}mo ago`;
  return `${Math.round(days/365)}y ago`;
}

Object.assign(window, {
  PLAYERS, GAMES, MATCHES,
  filterMatches, computeStandings, headToHead,
  playerById, fmtDate, fmtDateLong, relTime,
});
