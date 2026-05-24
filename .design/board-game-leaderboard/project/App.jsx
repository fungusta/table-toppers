// App.jsx — Top-level shell: theme switcher, range filter, view router.

const { useState: useStateApp, useMemo: useMemoApp, useEffect: useEffectApp } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "themeIntensity": "full",
  "showAvatars": true,
  "showStreak": true,
  "fontPair": "serif"
}/*EDITMODE-END*/;

function App() {
  const [tab, setTab] = useStateApp('cafe');
  const [range, setRange] = useStateApp('all');
  const [matches, setMatches] = useStateApp(MATCHES);
  const [profileId, setProfileId] = useStateApp(null);
  const [recordOpen, setRecordOpen] = useStateApp(false);
  const [historyOpen, setHistoryOpen] = useStateApp(false);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const themeKey = tab; // 'cafe' | 'catan' | 'carcassonne' | 'monopoly'

  // When tab changes, scroll body to top for a clean entrance
  useEffectApp(() => {
    document.body.classList.remove('theme-cafe', 'theme-catan', 'theme-carcassonne', 'theme-monopoly');
    document.body.classList.add(`theme-${themeKey}`);
    document.body.classList.toggle('intensity-subtle', tweaks.themeIntensity === 'subtle');
    document.body.classList.toggle('intensity-strong', tweaks.themeIntensity === 'strong');
    document.body.classList.toggle('intensity-full', tweaks.themeIntensity === 'full');
    document.body.classList.toggle('font-serif', tweaks.fontPair === 'serif');
    document.body.classList.toggle('font-display', tweaks.fontPair === 'display');
    document.body.classList.toggle('font-modern', tweaks.fontPair === 'modern');
    document.body.classList.toggle('hide-avatars', !tweaks.showAvatars);
    document.body.classList.toggle('hide-streak', !tweaks.showStreak);
  }, [themeKey, tweaks]);

  function handleRecord(match) {
    const id = Math.max(...matches.map(m => m.id)) + 1;
    setMatches([{ ...match, id }, ...matches]);
  }

  return (
    <div className={`app app-theme-${themeKey}`} data-screen-label={`${themeKey} leaderboard`}>
      <TopBar tab={tab} setTab={setTab} range={range} setRange={setRange}
              onRecord={() => setRecordOpen(true)}
              onHistory={() => setHistoryOpen(true)}/>

      <main className="app-main">
        {tab === 'cafe' && (
          <CafeView matches={matches} range={range}
                    onPickPlayer={setProfileId}
                    onRecord={() => setRecordOpen(true)}
                    onOpenHistory={() => setHistoryOpen(true)}/>
        )}
        {tab === 'catan' && (
          <CatanView matches={matches} range={range}
                     onPickPlayer={setProfileId}
                     onRecord={() => setRecordOpen(true)}
                     onOpenHistory={() => setHistoryOpen(true)}/>
        )}
        {tab === 'carcassonne' && (
          <CarcassonneView matches={matches} range={range}
                           onPickPlayer={setProfileId}
                           onRecord={() => setRecordOpen(true)}
                           onOpenHistory={() => setHistoryOpen(true)}/>
        )}
        {tab === 'monopoly' && (
          <MonopolyView matches={matches} range={range}
                        onPickPlayer={setProfileId}
                        onRecord={() => setRecordOpen(true)}
                        onOpenHistory={() => setHistoryOpen(true)}/>
        )}
      </main>

      <PlayerProfileModal playerId={profileId} matches={matches}
                          onClose={() => setProfileId(null)}
                          theme={themeKey}
                          onPickPlayer={setProfileId}/>
      <RecordMatchModal open={recordOpen}
                        onClose={() => setRecordOpen(false)}
                        theme={themeKey}
                        defaultGame={themeKey}
                        onSubmit={handleRecord}/>
      <MatchHistoryModal open={historyOpen}
                         onClose={() => setHistoryOpen(false)}
                         theme={themeKey}
                         matches={matches}
                         currentGame={themeKey}
                         onPickPlayer={(id) => { setHistoryOpen(false); setProfileId(id); }}/>

      <TweaksPanel>
        <TweakSection label="Theme reskin"/>
        <TweakRadio label="Intensity" value={tweaks.themeIntensity}
                    options={['subtle','strong','full']}
                    onChange={(v) => setTweak('themeIntensity', v)}/>
        <TweakSection label="Typography"/>
        <TweakRadio label="Font" value={tweaks.fontPair}
                    options={['serif','display','modern']}
                    onChange={(v) => setTweak('fontPair', v)}/>
        <TweakSection label="Detail"/>
        <TweakToggle label="Show avatars" value={tweaks.showAvatars}
                     onChange={(v) => setTweak('showAvatars', v)}/>
        <TweakToggle label="Show streaks" value={tweaks.showStreak}
                     onChange={(v) => setTweak('showStreak', v)}/>
      </TweaksPanel>
    </div>
  );
}

// ─── Top Bar ────────────────────────────────────────────────────────────────
function TopBar({ tab, setTab, range, setRange, onRecord, onHistory }) {
  const tabs = [
    { id: 'cafe',        label: 'The Cafe',    sub: 'All games' },
    { id: 'catan',       label: 'Catan',       sub: 'Hexes & roads' },
    { id: 'carcassonne', label: 'Carcassonne', sub: 'Tiles & meeples' },
    { id: 'monopoly',    label: 'Monopoly',    sub: 'Title deeds' },
  ];
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-brand">
          <div className="topbar-logo">
            <SunIcon/>
          </div>
          <div className="topbar-brand-text">
            <div className="topbar-brand-name">Sunday Strategists</div>
            <div className="topbar-brand-sub">Leaderboard · est. 2023</div>
          </div>
        </div>

        <nav className="topbar-tabs" role="tablist">
          {tabs.map(t => (
            <button key={t.id}
                    className={"topbar-tab" + (tab === t.id ? ' topbar-tab-on' : '')}
                    onClick={() => setTab(t.id)}
                    data-tab={t.id}>
              <span className="topbar-tab-glyph">
                <TabGlyph id={t.id}/>
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
            {[
              { id: 'week',  label: '7d'  },
              { id: 'month', label: '30d' },
              { id: 'all',   label: 'All' },
            ].map(r => (
              <button key={r.id}
                      className={"topbar-range-btn" + (range === r.id ? ' topbar-range-on' : '')}
                      onClick={() => setRange(r.id)}>
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

function TabGlyph({ id }) {
  if (id === 'cafe') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path d="M3 5 L11 6 L11 20 L3 19 Z" fill="currentColor" opacity=".25"/>
        <path d="M21 5 L13 6 L13 20 L21 19 Z" fill="currentColor" opacity=".25"/>
        <path d="M3 5 L11 6 M11 6 L13 6 M13 6 L21 5 M11 6 L11 20 M13 6 L13 20"
              stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    );
  }
  if (id === 'catan') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20">
        <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" fill="currentColor" opacity=".2"/>
        <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    );
  }
  if (id === 'carcassonne') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20">
        <rect x="3" y="3" width="18" height="18" rx="1" fill="currentColor" opacity=".18"/>
        <rect x="3" y="3" width="18" height="18" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
      </svg>
    );
  }
  if (id === 'monopoly') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20">
        <rect x="3" y="3" width="18" height="18" fill="currentColor" opacity=".18"/>
        <rect x="3" y="3" width="18" height="4" fill="currentColor"/>
        <rect x="3" y="3" width="18" height="18" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    );
  }
  return null;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28">
      <circle cx="16" cy="16" r="6" fill="currentColor"/>
      {Array.from({length: 8}).map((_, i) => {
        const a = (Math.PI * 2 * i) / 8;
        const x1 = 16 + Math.cos(a) * 9;
        const y1 = 16 + Math.sin(a) * 9;
        const x2 = 16 + Math.cos(a) * 13;
        const y2 = 16 + Math.sin(a) * 13;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>;
      })}
    </svg>
  );
}

window.App = App;
