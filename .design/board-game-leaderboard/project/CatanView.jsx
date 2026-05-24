// CatanView.jsx — Catan-themed leaderboard.
// Hex tile board layout, resource icons (brick/wood/sheep/wheat/ore), woodcut feel.
// Players are settlements on the board, ranked by total wins → laid out in
// hex rings around a central champion hex.

const { useMemo: useMemoCatan, useState: useStateCatan } = React;

function CatanView({ matches, range, onPickPlayer, onRecord, onOpenHistory }) {
  const standings = useMemoCatan(
    () => computeStandings(PLAYERS, matches, 'catan', range),
    [matches, range]
  );
  const recent = useMemoCatan(
    () => filterMatches(matches, 'catan', range).slice(0, 5),
    [matches, range]
  );
  const totalGames = useMemoCatan(
    () => filterMatches(matches, 'catan', range).length,
    [matches, range]
  );
  const longestStreak = useMemoCatan(() => {
    return standings.reduce((m, s) => s.streak > m.streak ? s : m, standings[0]);
  }, [standings]);

  return (
    <div className="ctn-root">
      {/* Banner — looks like a wooden Catan rulebook header */}
      <header className="ctn-header">
        <div className="ctn-header-bg" aria-hidden="true">
          <CatanHexPattern />
        </div>
        <div className="ctn-header-inner">
          <div className="ctn-header-tag">⬡ Settler's Standings · {rangeLabelCatan(range)}</div>
          <h1 className="ctn-title">CATAN</h1>
          <div className="ctn-header-sub">Leaderboard of the Sunday Strategists</div>
        </div>
      </header>

      {/* Full standings as resource cards — the leaderboard */}
      <section className="ctn-standings-section">
        <div className="ctn-section-head">
          <h2>All Settlers</h2>
          <p>Win count by resource. Click a card to view the settler's record.</p>
        </div>
        <div className="ctn-cards">
          {standings.map((s, i) => (
            <CatanCard key={s.player.id} standing={s} rank={i+1}
                       onClick={() => onPickPlayer(s.player.id)}/>
          ))}
        </div>
      </section>

      {/* Recent matches as a parchment scroll */}
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
                  <div className="ctn-recent-sub">vs {m.players.filter(p=>p!==m.winner).map(p=>playerById(p).name).join(' · ')}</div>
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

// ─── Hex board ──────────────────────────────────────────────────────────────
function CatanHexBoard({ standings, onPickPlayer }) {
  // Center hex + 6 surrounding hexes. Top settler in center (desert/champion).
  // Standard pointy-top hex layout, math:
  //   width = sqrt(3) * size, height = 2 * size
  //   horizontal spacing = width, vertical = 1.5 * size
  const size = 72;
  const w = Math.sqrt(3) * size; // ≈ 124.7
  const h = 2 * size;            // 144
  const positions = [
    { col: 0,  row: 0 },                   // center (champion)
    { col: -1, row: -0.5 }, { col: 1, row: -0.5 },  // top L/R
    { col: -1, row:  0.5 }, { col: 1, row:  0.5 },  // bottom L/R
    { col: 0,  row: -1   }, { col: 0, row:  1   },  // top, bottom
  ];
  // svg dimensions
  const padX = w/2 + 16;
  const padY = h/2 + 16;
  const cx = padX + w;
  const cy = padY + h;
  const vbW = (cx + w + padX);
  const vbH = (cy + h + padY);

  // Resource colors for ring of hexes — based on wins (richer = more wins)
  const resources = ['#9c4b34','#7a5a3d','#8a9e5b','#c9a25e','#5d6b7a','#a87a5d','#5b7a4a'];

  return (
    <div className="ctn-hex-board">
      <svg viewBox={`0 0 ${vbW} ${vbH}`} className="ctn-hex-board-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="ctn-hex-shadow"><feGaussianBlur stdDeviation="1.5"/></filter>
          <pattern id="ctn-grain" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="transparent"/>
            <circle cx="1" cy="1" r=".3" fill="rgba(0,0,0,.18)"/>
          </pattern>
        </defs>

        {/* Ocean ring */}
        <CatanHex cx={cx} cy={cy} size={size*2.4} fill="#3a5e7a" opacity={.35}/>

        {positions.map((p, i) => {
          const standing = standings[i];
          const px = cx + p.col * w;
          const py = cy + p.row * h;
          const isChampion = i === 0;
          if (!standing) return null;
          const resourceColor = resources[i] || '#7a5a3d';
          return (
            <g key={standing.player.id}
               style={{ cursor: 'pointer' }}
               onClick={() => onPickPlayer(standing.player.id)}
               className="ctn-hex-tile">
              <CatanHex cx={px} cy={py} size={size} fill={resourceColor}/>
              <CatanHex cx={px} cy={py} size={size} fill="url(#ctn-grain)"/>
              {/* Inner number disc */}
              <circle cx={px} cy={py - 12} r={20} fill="#f4e6c8" stroke="#3a2a1c" strokeWidth="1.5"/>
              <text x={px} y={py - 5} textAnchor="middle"
                    fontFamily="Georgia, 'Times New Roman', serif"
                    fontSize="24" fontWeight="700" fill="#9c4b34">
                {standing.wins}
              </text>
              {/* Settler initials chip */}
              <g transform={`translate(${px - 24} ${py + 14})`}>
                <rect width="48" height="22" rx="2" fill="#f4e6c8" stroke="#3a2a1c" strokeWidth="1"/>
                <text x="24" y="16" textAnchor="middle"
                      fontFamily="'IM Fell English', Georgia, serif"
                      fontSize="13" fontWeight="700" fill="#3a2a1c">
                  {standing.player.name}
                </text>
              </g>
              {isChampion && (
                <text x={px} y={py + 50} textAnchor="middle"
                      fontFamily="'IM Fell English', Georgia, serif"
                      fontSize="11" fontStyle="italic" fill="#3a2a1c" opacity=".75">
                  ⬡ champion ⬡
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CatanHex({ cx, cy, size, fill, opacity = 1 }) {
  // pointy-top hex
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI/3 * i - Math.PI/2;
    pts.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return <polygon points={pts.join(' ')} fill={fill} opacity={opacity}
                  stroke="#3a2a1c" strokeWidth="2" strokeLinejoin="round"/>;
}

function CatanSettlements({ cx, cy, size, count, color }) {
  // place little house icons around the bottom of the hex
  const items = [];
  for (let i = 0; i < count; i++) {
    const baseY = cy + 40;
    const baseX = cx - (count-1)*7 + i*14;
    items.push(
      <g key={i} transform={`translate(${baseX-6} ${baseY-6})`}>
        <path d="M0 6 L6 0 L12 6 L12 12 L0 12 Z" fill={color} stroke="#3a2a1c" strokeWidth=".8"/>
      </g>
    );
  }
  return <g>{items}</g>;
}

function CatanHexFrame() {
  // background hex for recent rows
  return (
    <svg viewBox="0 0 50 50" className="ctn-recent-hex-svg">
      <polygon points="25,3 45,15 45,35 25,47 5,35 5,15"
               fill="currentColor" stroke="#3a2a1c" strokeWidth="2"/>
    </svg>
  );
}

// ─── Resource card per settler ──────────────────────────────────────────────
function CatanCard({ standing, rank, onClick }) {
  const s = standing;
  // Cycle through a small palette of frame colors so the grid reads like a
  // set of Catan building-cost cards rather than identical tiles.
  const frames = [
    { frame: '#1d6fb5', deep: '#0f4a82', accent: '#9c4b34' }, // classic blue
    { frame: '#9c4b34', deep: '#6e2f1f', accent: '#1d6fb5' }, // brick red
    { frame: '#3d6b3d', deep: '#244524', accent: '#9c4b34' }, // forest green
    { frame: '#c9a25e', deep: '#8a6a2e', accent: '#9c4b34' }, // wheat gold
    { frame: '#5d6b7a', deep: '#3a4654', accent: '#9c4b34' }, // ore grey
  ];
  const f = frames[(rank - 1) % frames.length];
  return (
    <button
      className={"ctn-card" + (rank===1?' ctn-card-top':'')}
      onClick={onClick}
      style={{ '--ctn-frame': f.frame, '--ctn-frame-deep': f.deep, '--ctn-frame-accent': f.accent }}
    >
      <div className="ctn-card-corner">{rank === 1 ? '★' : `#${rank}`}</div>

      <div className="ctn-card-row">
        <div className="ctn-card-name">{s.player.name}</div>
        <div className="ctn-card-vp">
          <span className="ctn-card-vp-eq">=</span>
          <span className="ctn-card-vp-num">{s.wins}</span>
          <span className="ctn-card-vp-lbl">{s.wins === 1 ? 'VP' : 'VPs'}</span>
        </div>
      </div>

      <div className="ctn-card-rule" aria-hidden="true"></div>

      <div className="ctn-card-meta">
        <span>{s.played} matches</span>
        <span className="ctn-dot">⬡</span>
        <span>{Math.round(s.winRate*100)}% win rate</span>
        {s.streak > 0 && <><span className="ctn-dot">⬡</span><span>🔥 {s.streak}</span></>}
      </div>
    </button>
  );
}

function CatanResource({ type, count }) {
  const cfg = {
    brick: { color: '#9c4b34', label: 'brick', icon: '🧱' },
    wood:  { color: '#3d6b3d', label: 'wood',  icon: '🌲' },
    sheep: { color: '#c8d8a8', label: 'sheep', icon: '🐑' },
    wheat: { color: '#e0b94f', label: 'wheat', icon: '🌾' },
    ore:   { color: '#7a8a9c', label: 'ore',   icon: '⛰' },
  }[type];
  return (
    <div className="ctn-res" title={`${count} ${cfg.label}`}>
      <div className="ctn-res-icon" style={{background: cfg.color}}>
        <span>{cfg.icon}</span>
      </div>
      <div className="ctn-res-num">{count}</div>
    </div>
  );
}

function CatanStat({ icon, label, value }) {
  return (
    <div className="ctn-hstat">
      <div className="ctn-hstat-icon">{icon}</div>
      <div className="ctn-hstat-body">
        <div className="ctn-hstat-lbl">{label}</div>
        <div className="ctn-hstat-val">{value}</div>
      </div>
    </div>
  );
}

function CatanHexPattern() {
  // Background of hex tiles for the header
  const hexes = [];
  const size = 36;
  const w = Math.sqrt(3) * size;
  const h = 2 * size;
  for (let r = -2; r < 6; r++) {
    for (let c = -2; c < 14; c++) {
      const cx = c * w + (r % 2 ? w/2 : 0);
      const cy = r * h * 0.75;
      hexes.push(<polygon key={`${r}-${c}`}
        points={hexPts(cx, cy, size)}
        fill="none" stroke="rgba(244,230,200,.13)" strokeWidth="1"/>);
    }
  }
  return (
    <svg className="ctn-header-pattern" viewBox="0 0 900 280" preserveAspectRatio="xMidYMid slice">
      {hexes}
    </svg>
  );
}

function hexPts(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI/3 * i - Math.PI/2;
    pts.push(`${cx + size * Math.cos(a)},${cy + size * Math.sin(a)}`);
  }
  return pts.join(' ');
}

function rangeLabelCatan(r) {
  if (r === 'week') return 'past 7 days';
  if (r === 'month') return 'past 30 days';
  return 'all time';
}

window.CatanView = CatanView;
