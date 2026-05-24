// MonopolyView.jsx — Monopoly-themed leaderboard.
// Original art-deco "Property Tycoon" aesthetic — NOT a recreation of Hasbro's
// trade dress. Cream + ink + a curated set of property-deed color bars in our
// own palette (not the canonical Monopoly group colors). The conceit: each
// player is a real-estate magnate; their leaderboard entry is a "Title Deed"
// card stacked on the desk.

const { useMemo: useMemoMono } = React;

function MonopolyView({ matches, range, onPickPlayer, onRecord, onOpenHistory }) {
  const standings = useMemoMono(
    () => computeStandings(PLAYERS, matches, 'monopoly', range),
    [matches, range]
  );
  const recent = useMemoMono(
    () => filterMatches(matches, 'monopoly', range).slice(0, 5),
    [matches, range]
  );
  const totalGames = useMemoMono(
    () => filterMatches(matches, 'monopoly', range).length,
    [matches, range]
  );
  const top = standings[0];

  return (
    <div className="mono-root">
      {/* Vault-door header */}
      <header className="mono-header">
        <div className="mono-header-rule"></div>
        <div className="mono-header-inner">
          <div className="mono-header-eyebrow">
            <span className="mono-bull">◆</span>
            <span>Property Tycoon Standings · Vol. III · {rangeLabelMono(range)}</span>
            <span className="mono-bull">◆</span>
          </div>
          <h1 className="mono-title">
            <span className="mono-title-line">The Great</span>
            <span className="mono-title-amp">&amp;</span>
            <span className="mono-title-line">Ruthless Estate</span>
          </h1>
          <div className="mono-header-sub">
            A record of Sunday acquisitions, rents collected, and the occasional bankruptcy
          </div>
        </div>
        <div className="mono-header-stats">
          <MonoStat lbl="Tycoon-in-chief"  val={top?.player.name || '—'}/>
          <MonoStat lbl="Properties traded" val={totalGames}/>
          <MonoStat lbl="Active speculators" val={standings.filter(s=>s.played>0).length}/>
        </div>
        <div className="mono-header-rule"></div>
      </header>

      {/* The Title Deeds */}
      <section className="mono-deeds-section">
        <div className="mono-section-head">
          <div className="mono-section-eyebrow">— I —</div>
          <h2>The Title Deeds</h2>
          <p>Each magnate holds a deed; rank is determined by victories sealed.</p>
        </div>
        <div className="mono-deeds">
          {standings.map((s, i) => (
            <MonoDeed key={s.player.id} standing={s} rank={i+1}
                      onClick={() => onPickPlayer(s.player.id)}/>
          ))}
        </div>
      </section>

      {/* Ticker / Big Board */}
      <section className="mono-bigboard-section">
        <div className="mono-section-head">
          <div className="mono-section-eyebrow">— II —</div>
          <h2>The Big Board</h2>
          <p>Win-rate visualised. Bars are scaled to the leader.</p>
        </div>
        <div className="mono-bigboard">
          {standings.map((s, i) => {
            const maxWins = Math.max(...standings.map(x => x.wins), 1);
            const pct = (s.wins / maxWins) * 100;
            return (
              <div key={s.player.id} className="mono-bb-row" onClick={() => onPickPlayer(s.player.id)}>
                <div className="mono-bb-rank">{String(i+1).padStart(2,'0')}</div>
                <div className="mono-bb-name">{s.player.name}</div>
                <div className="mono-bb-track">
                  <div className="mono-bb-fill" style={{width: `${pct}%`, background: s.player.color}}>
                    <div className="mono-bb-fill-shine"></div>
                  </div>
                </div>
                <div className="mono-bb-val">{s.wins} <span>W</span></div>
                <div className="mono-bb-pct">{Math.round(s.winRate*100)}%</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Latest acquisitions */}
      <section className="mono-recent-section">
        <div className="mono-section-head">
          <div className="mono-section-eyebrow">— III —</div>
          <h2>Latest Acquisitions</h2>
          <button className="mono-link" onClick={onOpenHistory}>Full ledger →</button>
        </div>
        <ol className="mono-ticker">
          {recent.map(m => {
            const w = playerById(m.winner);
            const total = m.players.length;
            return (
              <li key={m.id} className="mono-ticker-row" onClick={() => onPickPlayer(w.id)}>
                <div className="mono-ticker-stamp" style={{background: w.color}}>
                  <div className="mono-ticker-stamp-line">PAID</div>
                </div>
                <div className="mono-ticker-body">
                  <div className="mono-ticker-title">
                    <strong>{w.name}</strong> bankrupted {total - 1} opponent{total - 1 === 1 ? '' : 's'}
                  </div>
                  <div className="mono-ticker-sub">
                    {m.players.filter(p=>p!==m.winner).map(p=>playerById(p).name).join(' · ')}
                  </div>
                </div>
                <div className="mono-ticker-date">
                  <div className="mono-ticker-date-main">{fmtDate(m.date)}</div>
                  <div className="mono-ticker-date-sub">{relTime(m.date)}</div>
                </div>
              </li>
            );
          })}
        </ol>
        <button className="mono-record-btn" onClick={onRecord}>
          ◆ Register a new acquisition
        </button>
      </section>
    </div>
  );
}

// ─── Title Deed card ────────────────────────────────────────────────────────
function MonoDeed({ standing, rank, onClick }) {
  const s = standing;
  // Property "value" derived from wins. Show as currency on the deed.
  const rent = 20 + s.wins * 18 + s.streak * 6;
  return (
    <button className={"mono-deed" + (rank === 1 ? ' mono-deed-top' : '')} onClick={onClick}>
      <div className="mono-deed-color" style={{background: s.player.color}}>
        <div className="mono-deed-color-stripe"></div>
      </div>
      <div className="mono-deed-body">
        <div className="mono-deed-titleline">TITLE DEED</div>
        <div className="mono-deed-name">{s.player.name}</div>
        <div className="mono-deed-rank">№ {String(rank).padStart(2,'0')}</div>

        <div className="mono-deed-rent">
          <div className="mono-deed-rent-row mono-deed-rent-row-strong">
            <span>RENT</span>
            <span className="mono-deed-currency">${rent}</span>
          </div>
          <div className="mono-deed-rent-row">
            <span>With 1 house</span>
            <span>${rent * 5}</span>
          </div>
          <div className="mono-deed-rent-row">
            <span>With 2 houses</span>
            <span>${rent * 12}</span>
          </div>
          <div className="mono-deed-rent-row">
            <span>With 3 houses</span>
            <span>${rent * 28}</span>
          </div>
          <div className="mono-deed-rent-row">
            <span>With 4 houses</span>
            <span>${rent * 50}</span>
          </div>
          <div className="mono-deed-rent-row mono-deed-rent-row-strong">
            <span>HOTEL</span>
            <span>${rent * 70}</span>
          </div>
        </div>

        <div className="mono-deed-houses">
          {Array.from({length: 5}).map((_, i) => (
            <div key={i} className={"mono-deed-house" + (i < s.wins ? ' mono-deed-house-on' : '')}>
              <svg viewBox="0 0 16 12">
                <path d="M0 5 L8 0 L16 5 L16 12 L0 12 Z" fill={i < s.wins ? s.player.color : 'none'} stroke="#1c1410" strokeWidth="1.2"/>
              </svg>
            </div>
          ))}
        </div>

        <div className="mono-deed-foot">
          <div className="mono-deed-foot-stat">
            <span>{s.wins}</span><i>wins</i>
          </div>
          <div className="mono-deed-foot-stat">
            <span>{s.played}</span><i>played</i>
          </div>
          <div className="mono-deed-foot-stat">
            <span>{Math.round(s.winRate*100)}%</span><i>rate</i>
          </div>
        </div>
      </div>
    </button>
  );
}

function MonoStat({ lbl, val }) {
  return (
    <div className="mono-hstat">
      <div className="mono-hstat-lbl">{lbl}</div>
      <div className="mono-hstat-val">{val}</div>
    </div>
  );
}

function rangeLabelMono(r) {
  if (r === 'week') return 'this week';
  if (r === 'month') return 'this month';
  return 'all years';
}

window.MonopolyView = MonopolyView;
