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
import type { GameId, Match, Player, PlayerProfilePayload, Range } from "@/data/data";
import { recordMatch } from "@/app/actions/record-match";
import { createClient } from "@/lib/supabase/client";

const THEME_CLASSES = ["theme-cafe", "theme-catan", "theme-carcassonne"];

interface HomeClientProps {
  groupId: string;
  groupName: string;
  groupRole: 'owner' | 'member';
  groups: { id: string; name: string }[];
  players: Player[];
  initialMatches: Match[];
}

export function HomeClient({
  groupId,
  groupName,
  groupRole,
  groups,
  players,
  initialMatches,
}: HomeClientProps) {
  const [tab, setTab] = useState<GameId>("cafe");
  const [range, setRange] = useState<Range>("all");
  // Server-action-backed mutation. We optimistically prepend the new row using
  // the real DB-assigned id returned by `recordMatch`, and rely on
  // `revalidatePath('/')` inside the action to keep the rest of the page in
  // sync on the next navigation/refresh.
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlayerProfilePayload | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    document.body.classList.remove(...THEME_CLASSES);
    document.body.classList.add(`theme-${tab}`);
  }, [tab]);

  // Lazy-load the player profile when the modal opens. AbortController
  // covers the rapid-click case where the user opens one profile, then
  // jumps to another (head-to-head row click) before the first resolves.
  useEffect(() => {
    if (!profileId) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    const ctrl = new AbortController();
    setProfileLoading(true);
    setProfileError(null);
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .rpc('get_player_profile', { p_member_id: profileId })
        .abortSignal(ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (error) {
        setProfileError(error.message);
        setProfile(null);
      } else {
        // Cast: the generated `Json` return is structurally PlayerProfilePayload
        // (or null for unauthorized / unknown member), shape pinned by the
        // RPC + tests in web/tests/rpc/get_player_profile.test.ts.
        setProfile((data as unknown) as PlayerProfilePayload | null);
      }
      setProfileLoading(false);
    })();
    return () => ctrl.abort();
  }, [profileId]);

  async function handleRecord(match: NewMatch): Promise<{ ok: true } | { ok: false; error: string }> {
    const result = await recordMatch({
      groupId,
      gameId: match.game,
      playedOn: match.date,
      winnerMemberId: match.winner,
      memberIds: match.players,
    });
    if (!result.ok) return { ok: false, error: result.error };
    setMatches([{ ...match, id: result.matchId }, ...matches]);
    return { ok: true };
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
        groupId={groupId}
        groupName={groupName}
        groupRole={groupRole}
        groups={groups}
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
        profile={profile}
        loading={profileLoading}
        error={profileError}
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
