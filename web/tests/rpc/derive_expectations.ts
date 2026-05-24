// web/tests/rpc/derive_expectations.ts
// Run with: npx tsx web/tests/rpc/derive_expectations.ts
// Prints expected standings for the fixture in supabase/tests/seed_known.sql.
// Used to manually verify the test expectations against the old computeStandings before deletion.
import { computeStandings, type Match, type Player } from '../../src/data/data';

const players: Player[] = [
  { id: 'alice', name: 'Alice', handle: 'a', color: '#111111', initials: 'AL', joined: '2026-01' },
  { id: 'bob',   name: 'Bob',   handle: 'b', color: '#222222', initials: 'BO', joined: '2026-01' },
  { id: 'cara',  name: 'Cara',  handle: 'c', color: '#333333', initials: 'CA', joined: '2026-01' },
];
const matches: Match[] = [
  { id: 1, game: 'catan',       date: '2026-05-20', players: ['alice','bob','cara'], winner: 'alice' },
  { id: 2, game: 'catan',       date: '2026-05-18', players: ['alice','bob','cara'], winner: 'alice' },
  { id: 3, game: 'catan',       date: '2026-05-10', players: ['alice','bob','cara'], winner: 'bob'   },
  { id: 4, game: 'catan',       date: '2026-04-01', players: ['alice','bob','cara'], winner: 'cara'  },
  { id: 5, game: 'carcassonne', date: '2026-05-15', players: ['alice','bob','cara'], winner: 'cara'  },
  { id: 6, game: 'carcassonne', date: '2026-04-20', players: ['alice','bob','cara'], winner: 'bob'   },
];

for (const range of ['week','month','all'] as const) {
  for (const game of ['cafe','catan','carcassonne'] as const) {
    const out = computeStandings(players, matches, game, range);
    console.log(range, game, JSON.stringify(out.map(s => ({
      name: s.player.name, wins: s.wins, played: s.played,
      winRate: s.winRate, streak: s.streak, fav: s.fav,
    }))));
  }
}
