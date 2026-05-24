"use client";

import { useEffect, useState } from "react";
import { CafeView } from "@/components/CafeView";
import { CarcassonneView } from "@/components/CarcassonneView";
import { CatanView } from "@/components/CatanView";
import {
  MatchHistoryModal,
  PlayerProfileModal,
  RecordMatchModal,
  type NewMatch,
} from "@/components/Modals";
import { TopBar } from "@/components/TopBar";
import { MATCHES, type GameId, type Match, type Range } from "@/data/data";

const THEME_CLASSES = ["theme-cafe", "theme-catan", "theme-carcassonne", "theme-monopoly"];

export default function HomePage() {
  const [tab, setTab] = useState<GameId>("cafe");
  const [range, setRange] = useState<Range>("all");
  const [matches, setMatches] = useState<Match[]>(MATCHES);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    document.body.classList.remove(...THEME_CLASSES);
    document.body.classList.add(`theme-${tab}`);
  }, [tab]);

  function handleRecord(match: NewMatch) {
    const nextId = Math.max(...matches.map(m => m.id)) + 1;
    setMatches([{ ...match, id: nextId }, ...matches]);
  }

  const viewProps = {
    matches,
    range,
    onPickPlayer: setProfileId,
    onRecord: () => setRecordOpen(true),
    onOpenHistory: () => setHistoryOpen(true),
  };

  return (
    <div className={`app app-theme-${tab}`} data-screen-label={`${tab} leaderboard`}>
      <TopBar
        tab={tab}
        setTab={setTab}
        range={range}
        setRange={setRange}
        onRecord={() => setRecordOpen(true)}
        onHistory={() => setHistoryOpen(true)}
      />

      <main className="app-main">
        {tab === "catan" ? (
          <CatanView {...viewProps} />
        ) : tab === "carcassonne" ? (
          <CarcassonneView {...viewProps} />
        ) : (
          <CafeView {...viewProps} />
        )}
      </main>

      <PlayerProfileModal
        playerId={profileId}
        matches={matches}
        onClose={() => setProfileId(null)}
        theme={tab}
        onPickPlayer={setProfileId}
      />
      <RecordMatchModal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        theme={tab}
        defaultGame={tab}
        onSubmit={handleRecord}
      />
      <MatchHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        theme={tab}
        matches={matches}
        currentGame={tab}
        onPickPlayer={(id) => {
          setHistoryOpen(false);
          setProfileId(id);
        }}
      />
    </div>
  );
}
