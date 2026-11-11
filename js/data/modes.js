// Game modes. `teamSize` is players per team (ffa uses `maxPlayers`).
export const MODES = {
  duel: {
    id: 'duel', name: '1v1 Duel', short: '1V1', teamSize: 1, kind: 'rounds',
    desc: 'Head-to-head rounds on a compact map. Free loadout every round. First to 7.',
    roundsToWin: 7, roundTime: 75, buyTime: 7, maps: ['vault', 'courtyard'],
  },
  ranked: {
    id: 'ranked', name: 'Ranked 1v1', short: '1V1', teamSize: 1, kind: 'rounds', ranked: true,
    desc: 'Competitive 1v1 that moves your ELO. First to 7 rounds. Leaving counts as a loss.',
    roundsToWin: 7, roundTime: 75, buyTime: 7, maps: ['vault', 'courtyard'],
  },
  duo: {
    id: 'duo', name: '2v2 Wingman', short: '2V2', teamSize: 2, kind: 'rounds',
    desc: 'Two-player squads, free loadouts, fast rounds. First to 7.',
    roundsToWin: 7, roundTime: 90, buyTime: 8, maps: ['courtyard', 'vault'],
  },
  bomb: {
    id: 'bomb', name: '5v5 Bomb Defusal', short: '5V5', teamSize: 5, kind: 'bomb',
    desc: 'Attackers plant the charge at site A or B, defenders stop them. Full economy. First to 9.',
    roundsToWin: 9, halftime: 8, roundTime: 115, buyTime: 15, bombTime: 40, plantTime: 3.2, defuseTime: 7,
    maps: ['dustline', 'harbor'],
  },
  ffa: {
    id: 'ffa', name: 'Free For All', short: 'FFA', maxPlayers: 8, kind: 'ffa',
    desc: 'Everyone for themselves. Instant respawns. First to 25 kills or 6 minutes.',
    killsToWin: 25, timeLimit: 360, maps: ['courtyard', 'dustline', 'harbor', 'vault'],
  },
};

export const TEAM_NAMES = ['Attackers', 'Defenders'];
export const TEAM_CLASS = ['t', 'ct'];
export const TEAM_COLORS = [0xe8833a, 0x4ea3ff];

export const RANKS = [
  { name: 'Iron', min: 0, color: '#7d7f86' },
  { name: 'Bronze', min: 800, color: '#b27242' },
  { name: 'Silver', min: 950, color: '#c4ccd6' },
  { name: 'Gold', min: 1100, color: '#f2c14e' },
  { name: 'Platinum', min: 1250, color: '#4fd1c5' },
  { name: 'Diamond', min: 1400, color: '#8fa8ff' },
  { name: 'Master', min: 1600, color: '#c06cff' },
  { name: 'Elite', min: 1800, color: '#ff5a5a' },
];

export function rankFor(elo) {
  let r = RANKS[0];
  for (const k of RANKS) if (elo >= k.min) r = k;
  return r;
}

export function rankBadge(elo, big = false) {
  const r = rankFor(elo ?? 1000);
  return `<span class="rank-badge${big ? ' lg' : ''}" style="--rc:${r.color}"><i></i>${r.name}</span>`;
}

// XP curve: level n needs 500 + 150*n XP.
export function levelFor(xp = 0) {
  let lvl = 1, need = 650, left = xp;
  while (left >= need) { left -= need; lvl++; need = 500 + 150 * lvl; }
  return { level: lvl, into: left, need };
}
