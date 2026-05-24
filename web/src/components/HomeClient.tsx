"use client";

import { useEffect, useState } from "react";
import { CafeView } from "./CafeView";
import { CarcassonneView } from "./CarcassonneView";
import { CatanView } from "./CatanView";
import {
  MatchHistoryModal,
  PlayerProfileModal,
  RecordMatchModal,
  type NewMatch,
} from "./Modals";
import { TopBar } from "./TopBar";
import type { GameId, Match, Player, Range } from "@/data/data";

const THEME_CLASSES = ["theme-cafe", "theme-catan", "theme-carcassonne", "theme-monopoly"];

interface HomeClientProps {
  players: Player[];
  initialMatches: Match[];
}

export function HomeClient({ players, initialMatches }: HomeClientProps) {
  const [tab, setTab] = useState<GameId>("cafe");
  const [range, setRange] = useState<Range>("all");
  // Local mutation only — writes don't persist until the next slice. The Record
  // modal updates this state so the UI feels responsive, but a page reload
  // throws it away. The modal's "saving" message reflects that honestly.
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    document.body.classList.remove(...THEME_CLASSES);
    document.body.classList.add(`theme-${tab}`);
  }, [tab]);

  function handleRecord(match: NewMatch) {
    const newId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `local-${Date.now()}`;
    setMatches([{ ...match, id: newId }, ...matches]);
  }

  const viewProps = {
    players,
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
        players={players}
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
        players={players}
        onSubmit={handleRecord}
      />
      <MatchHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        theme={tab}
        players={players}
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
