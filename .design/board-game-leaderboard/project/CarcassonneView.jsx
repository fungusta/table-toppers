// CarcassonneView.jsx — Carcassonne-themed leaderboard.
// Medieval / illuminated manuscript aesthetic. Parchment background, drop-cap
// chapter title, stone-wall section dividers, meeple icons in colored circles,
// tile-laying grid where each tile is a player.

const { useMemo: useMemoCarc } = React;

function CarcassonneView({ matches, range, onPickPlayer, onRecord, onOpenHistory }) {
  const standings = useMemoCarc(
    () => computeStandings(PLAYERS, matches, 'carcassonne', range),
    [matches, range]
  );
  const recent = useMemoCarc(
    () => filterMatches(matches, 'carcassonne', range).slice(0, 5),
    [matches, range]
  );
  const totalGames = useMemoCarc(
    () => filterMatches(matches, 'carcassonne', range).length,
    [matches, range]
  );
  const top = standings[0];

  return (
    <div className="carc-root">
      <div className="carc-page">
        {/* Illuminated header */}
        <header className="carc-illum-header">
          <div className="carc-illum-corner carc-illum-corner-tl">
            <CarcOrnamentCorner/>
          </div>
          <div className="carc-illum-corner carc-illum-corner-tr">
            <CarcOrnamentCorner flip/>
          </div>
          <div className="carc-illum-eyebrow">— Chapter the First —</div>
          <h1 className="carc-illum-title">
            <span className="carc-illum-dropcap">A</span>
            <span className="carc-illum-title-text">Chronicle of <em>Carcassonne</em></span>
          </h1>
          <p className="carc-illum-sub">
            Wherein the meeples of the Sunday Strategists do contest for cloister,
            road, and field over {totalGames} most-recorded games.
          </p>
        </header>

        {/* The Scoreboard — Carcassonne-style 0-49 track with meeples placed by wins */}
        <CarcScoreboard standings={standings} onPickPlayer={onPickPlayer}/>

        {/* The Tile Grid — every player as a tile */}
        <section className="carc-tilegrid-section">
          <div className="carc-section-divider">
            <CarcDivider/>
            <span className="carc-section-title">The Meeples</span>
            <CarcDivider flip/>
          </div>
          <div className="carc-tilegrid">
            {standings.map((s, i) => (
              <CarcTile key={s.player.id} standing={s} rank={i+1}
                        onClick={() => onPickPlayer(s.player.id)}/>
            ))}
          </div>
        </section>

        {/* The Standings — manuscript table */}
        <section className="carc-table-section">
          <div className="carc-section-divider">
            <CarcDivider/>
            <span className="carc-section-title">The Standings</span>
            <CarcDivider flip/>
          </div>
          <div className="carc-table-wrap">
            <table className="carc-table">
              <thead>
                <tr>
                  <th className="carc-th-rank">Rank</th>
                  <th>Settler</th>
                  <th className="carc-th-num">Games</th>
                  <th className="carc-th-num">Wins</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <tr key={s.player.id} onClick={() => onPickPlayer(s.player.id)}>
                    <td className="carc-td-rank">
                      {i === 0 ? <span className="carc-roman-1">I</span>
                       : i === 1 ? <span className="carc-roman">II</span>
                       : i === 2 ? <span className="carc-roman">III</span>
                       : <span className="carc-roman">{toRoman(i+1)}</span>}
                    </td>
                    <td>
                      <div className="carc-td-name">
                        <CarcMeeple color={s.player.color} size={22}/>
                        <div>
                          <div className="carc-td-name-main">{s.player.name}</div>
                          <div className="carc-td-name-handle">— {s.player.handle.replace(/_/g,' ')}</div>
                        </div>
                      </div>
                    </td>
                    <td className="carc-td-num">{s.played}</td>
                    <td className="carc-td-num carc-td-tally">{s.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Latest tournaments */}
        <section className="carc-recent-section">
          <div className="carc-section-divider">
            <CarcDivider/>
            <span className="carc-section-title">Recent Tournaments</span>
            <CarcDivider flip/>
          </div>
          <ul className="carc-recent">
            {recent.map(m => {
              const w = playerById(m.winner);
              return (
                <li key={m.id} className="carc-recent-row" onClick={() => onPickPlayer(w.id)}>
                  <div className="carc-recent-body">
                    <div className="carc-recent-title">
                      <CarcMeeple color={w.color} size={18}/>
                      <span><strong>{w.name}</strong> closed the city · {fmtDateLong(m.date)}</span>
                    </div>
                    <div className="carc-recent-sub">
                      together with {m.players.filter(p=>p!==m.winner).map(p=>playerById(p).name).join(', ')}
                    </div>
                  </div>
                  <div className="carc-recent-date">{relTime(m.date)}</div>
                </li>
              );
            })}
          </ul>
          <div className="carc-actions">
            <button className="carc-btn carc-btn-primary" onClick={onRecord}>
              ✦ Record new tournament
            </button>
            <button className="carc-btn" onClick={onOpenHistory}>
              Read the full chronicle
            </button>
          </div>
        </section>

        <footer className="carc-footer">
          <span>Champion of the realm: <strong>{top?.player.name || '—'}</strong></span>
          <span className="carc-footer-flourish">⚜</span>
          <span>{rangeLabelCarc(range)}</span>
        </footer>
      </div>
    </div>
  );
}

// ─── Scoreboard — Carcassonne-style 0-49 winding track (SVG) ──────────────
function CarcScoreboard({ standings, onPickPlayer }) {
  const COLS = 10;
  const ROWS = 5;
  const TILES = COLS * ROWS;
  const TW = 84;   // tile width
  const TH = 70;   // tile height
  const PAD = 18;
  const W = COLS * TW + PAD * 2;
  const H = ROWS * TH + PAD * 2;

  // Snake winding: row 0 left→right (0-9), row 1 right→left (10-19), …
  const cellFor = (n) => {
    const row = Math.floor(n / COLS);
    const col = row % 2 === 0 ? n % COLS : COLS - 1 - (n % COLS);
    return {
      row, col,
      x: PAD + col * TW,
      y: PAD + row * TH,
      cx: PAD + col * TW + TW / 2,
      cy: PAD + row * TH + TH / 2,
    };
  };

  const byScore = {};
  standings.forEach(s => {
    const score = Math.max(0, Math.min(TILES - 1, s.wins));
    (byScore[score] ||= []).push(s);
  });

  return (
    <section className="carc-scoreboard-section">
      <div className="carc-section-divider">
        <CarcDivider/>
        <span className="carc-section-title">The Scoreboard</span>
        <CarcDivider flip/>
      </div>
      <p className="carc-scoreboard-cap">Each meeple sits on the number of games its player has won.</p>
      <div className="carc-scoreboard-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="carc-scoreboard-svg"
             preserveAspectRatio="xMidYMid meet" role="img"
             aria-label="Carcassonne-style scoring track from 0 to 49">
          <defs>
            <pattern id="carc-sb-grain" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="transparent"/>
              <circle cx="2" cy="2" r=".5" fill="rgba(92,67,41,.3)"/>
              <circle cx="5" cy="4" r=".4" fill="rgba(92,67,41,.2)"/>
            </pattern>
            <linearGradient id="carc-sb-tile" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f5e6b8"/>
              <stop offset="100%" stopColor="#e2cc88"/>
            </linearGradient>
            <linearGradient id="carc-sb-tile-milestone" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#c8b287"/>
              <stop offset="100%" stopColor="#a8956a"/>
            </linearGradient>
            <filter id="carc-sb-meeple-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="1"/>
              <feOffset dx="0" dy="1"/>
              <feComponentTransfer><feFuncA type="linear" slope=".5"/></feComponentTransfer>
              <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Outer parchment frame */}
          <rect x="2" y="2" width={W - 4} height={H - 4} rx="6"
                fill="#e8d8a8" stroke="#5c4329" strokeWidth="3"/>
          <rect x="2" y="2" width={W - 4} height={H - 4} rx="6"
                fill="url(#carc-sb-grain)"/>

          {/* Path connectors — a soft underlay tying tiles together */}
          {Array.from({ length: TILES - 1 }, (_, i) => {
            const a = cellFor(i);
            const b = cellFor(i + 1);
            return (
              <line key={`conn-${i}`} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy}
                    stroke="#c8b287" strokeWidth={TH * 0.55}
                    strokeLinecap="round" opacity=".55"/>
            );
          })}

          {/* Tiles */}
          {Array.from({ length: TILES }, (_, n) => {
            const { x, y } = cellFor(n);
            const milestone = n % 10 === 0;
            return (
              <g key={`tile-${n}`}>
                <rect x={x + 3} y={y + 3} width={TW - 6} height={TH - 6} rx="4"
                      fill={milestone ? 'url(#carc-sb-tile-milestone)' : 'url(#carc-sb-tile)'}
                      stroke="#7a6748" strokeWidth="1.4"/>
                <rect x={x + 3} y={y + 3} width={TW - 6} height={TH - 6} rx="4"
                      fill="url(#carc-sb-grain)" opacity=".4"/>
                <text x={x + 8} y={y + 18}
                      fontFamily="'IM Fell English', 'Cormorant Garamond', serif"
                      fontSize="14" fontWeight="700"
                      fill="#3a2a1c" opacity=".85">
                  {n}
                </text>
                {milestone && (
                  <g transform={`translate(${x + TW - 22} ${y + TH - 22})`} opacity=".55">
                    {/* tiny castle silhouette */}
                    <path d="M0 14 L0 6 L3 6 L3 2 L6 2 L6 6 L9 6 L9 2 L12 2 L12 6 L15 6 L15 14 Z"
                          fill="#5c4329"/>
                  </g>
                )}
              </g>
            );
          })}

          {/* Meeples */}
          {Object.entries(byScore).map(([scoreStr, players]) => {
            const score = +scoreStr;
            const { x, y } = cellFor(score);
            return players.map((s, i) => {
              // stack meeples inside the tile in a small grid
              const perRow = 3;
              const mx = x + 10 + (i % perRow) * 20;
              const my = y + 24 + Math.floor(i / perRow) * 22;
              return (
                <g key={`m-${s.player.id}`}
                   transform={`translate(${mx} ${my})`}
                   style={{ cursor: 'pointer' }}
                   filter="url(#carc-sb-meeple-shadow)"
                   onClick={() => onPickPlayer(s.player.id)}>
                  <title>{`${s.player.name} · ${s.wins} wins`}</title>
                  <CarcMeepleSvg color={s.player.color} size={20}/>
                </g>
              );
            });
          })}
        </svg>
      </div>
    </section>
  );
}

// Bare meeple path for use inside another <svg>.
function CarcMeepleSvg({ color, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" x="0" y="0" overflow="visible">
      <path
        d="M16 4
           C 18 4, 19.5 5.5, 19.5 7.5
           C 19.5 9, 18.7 10, 17.7 10.7
           L 23 11
           C 26 11, 27 12.5, 27 14
           C 27 15.3, 26 16.3, 24.5 16.3
           L 20 16.3
           L 22 28
           L 17.5 28
           L 16 21
           L 14.5 28
           L 10 28
           L 12 16.3
           L 7.5 16.3
           C 6 16.3, 5 15.3, 5 14
           C 5 12.5, 6 11, 9 11
           L 14.3 10.7
           C 13.3 10, 12.5 9, 12.5 7.5
           C 12.5 5.5, 14 4, 16 4 Z"
        fill={color} stroke="#3a2a1c" strokeWidth="1.4" strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Tile component — each player is a square Carcassonne-style land tile ───
function CarcTile({ standing, rank, onClick }) {
  const s = standing;
  return (
    <button className={"carc-tile" + (rank === 1 ? ' carc-tile-top' : '')} onClick={onClick}>
      <div className="carc-tile-art">
        <CarcTileArt seed={s.player.id} color={s.player.color}/>
        <div className="carc-tile-meeple">
          <CarcMeeple color={s.player.color} size={32}/>
        </div>
      </div>
      <div className="carc-tile-foot">
        <div className="carc-tile-rank">{toRoman(rank)}</div>
        <div className="carc-tile-name">{s.player.name}</div>
        <div className="carc-tile-wins">{s.wins} <span>wins</span></div>
      </div>
    </button>
  );
}

function CarcTileArt({ seed, color }) {
  // Use the seed to deterministically pick one of the four real Carcassonne
  // tile images, so each player has a stable tile.
  const tiles = [
    'uploads/carc-cloister.png',
    'uploads/carc-city-corner.png',
    'uploads/carc-field-cows.png',
    'uploads/carc-city-full.png',
  ];
  let h = 0; for (const c of seed) h = (h*31 + c.charCodeAt(0)) | 0;
  const src = tiles[Math.abs(h) % tiles.length];
  return (
    <img
      src={src}
      alt=""
      className="carc-tile-svg"
      style={{ objectFit: 'cover' }}
      draggable={false}
    />
  );
}

function CarcMeeple({ color, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="carc-meeple">
      {/* Classic meeple shape: head + arms + body + legs */}
      <path
        d="M16 4
           C 18 4, 19.5 5.5, 19.5 7.5
           C 19.5 9, 18.7 10, 17.7 10.7
           L 23 11
           C 26 11, 27 12.5, 27 14
           C 27 15.3, 26 16.3, 24.5 16.3
           L 20 16.3
           L 22 28
           L 17.5 28
           L 16 21
           L 14.5 28
           L 10 28
           L 12 16.3
           L 7.5 16.3
           C 6 16.3, 5 15.3, 5 14
           C 5 12.5, 6 11, 9 11
           L 14.3 10.7
           C 13.3 10, 12.5 9, 12.5 7.5
           C 12.5 5.5, 14 4, 16 4 Z"
        fill={color} stroke="#3a2a1c" strokeWidth="1.2" strokeLinejoin="round"
      />
    </svg>
  );
}

function CarcOrnamentCorner({ flip }) {
  return (
    <svg viewBox="0 0 60 60" width="60" height="60"
         style={{ transform: flip ? 'scaleX(-1)' : 'none' }}>
      <g fill="none" stroke="#5c4329" strokeWidth="1.2" strokeLinecap="round">
        <path d="M2 2 L58 2 L58 8 L8 8 L8 58 L2 58 Z" fill="#9c4b34" stroke="#3a2a1c"/>
        <path d="M14 14 Q26 14 26 26 Q26 38 14 38 Q14 26 26 26"/>
        <circle cx="14" cy="14" r="2" fill="#e0b94f" stroke="#5c4329"/>
        <circle cx="26" cy="26" r="1.5" fill="#e0b94f" stroke="#5c4329"/>
        <path d="M14 38 Q14 50 26 50"/>
        <circle cx="26" cy="50" r="1.5" fill="#e0b94f" stroke="#5c4329"/>
      </g>
    </svg>
  );
}

function CarcDivider({ flip }) {
  return (
    <svg viewBox="0 0 120 12" className="carc-divider-svg"
         style={{ transform: flip ? 'scaleX(-1)' : 'none' }}>
      <line x1="0" y1="6" x2="120" y2="6" stroke="#5c4329" strokeWidth="1"/>
      <circle cx="110" cy="6" r="2" fill="#5c4329"/>
      <path d="M85 2 Q95 6 85 10" fill="none" stroke="#5c4329" strokeWidth="1"/>
      <path d="M75 4 Q82 6 75 8" fill="none" stroke="#5c4329" strokeWidth="1"/>
    </svg>
  );
}

function CarcRoadTile() {
  return (
    <div className="carc-recent-tile">
      <svg viewBox="0 0 40 40">
        <rect width="40" height="40" fill="#aebd7a" stroke="#3a2a1c" strokeWidth="1.5"/>
        <rect x="16" y="0" width="8" height="40" fill="#c8b287"/>
        <line x1="20" y1="0" x2="20" y2="40" stroke="#7a6748" strokeWidth="1" strokeDasharray="3 4"/>
        <rect x="0" y="0" width="40" height="14" fill="#94816a"/>
        <line x1="0" y1="8" x2="40" y2="8" stroke="#5c4329" strokeWidth=".5" opacity=".4"/>
      </svg>
    </div>
  );
}

function toRoman(num) {
  const map = [['M',1000],['CM',900],['D',500],['CD',400],['C',100],['XC',90],
               ['L',50],['XL',40],['X',10],['IX',9],['V',5],['IV',4],['I',1]];
  let result = '';
  for (const [r, v] of map) {
    while (num >= v) { result += r; num -= v; }
  }
  return result;
}

function rangeLabelCarc(r) {
  if (r === 'week') return 'in the past sennight';
  if (r === 'month') return 'in the past month';
  return 'since the realm was founded';
}

window.CarcassonneView = CarcassonneView;
