import { GUN_GAME_ORDER, ECON, DUEL_ECON } from './weapons.js';

const SMALL = ['vault', 'courtyard', 'foundry', 'outpost'];
const LARGE = ['dustline', 'harbor', 'canopy', 'frostbite'];
const ALL = [...SMALL, ...LARGE];

// Featured community maps join the rotation like official maps (js/data/custommaps.js).
export function addMapToPools(id, size) {
  for (const pool of size === 'large' ? [LARGE, ALL] : [SMALL, ALL]) if (!pool.includes(id)) pool.push(id);
}
export function removeMapFromPools(id) {
  for (const pool of [SMALL, LARGE, ALL]) { const i = pool.indexOf(id); if (i >= 0) pool.splice(i, 1); }
}

// Game modes. `teamSize` is players per team (ffa-style modes use `maxPlayers`).
// kind: 'rounds' | 'bomb' | 'retake' | 'hostage' (round based) · 'ffa' | 'tdm' | 'gungame' (respawn based)
//       'training' (the offline range, no opponents)
export const MODES = {
  duel: {
    id: 'duel', name: '1v1 Duel', short: '1V1', teamSize: 1, kind: 'rounds',
    desc: 'Head-to-head rounds on a compact map. Round wins pay more than losses, so the winner can afford better guns. First to 7.',
    economy: true, roundsToWin: 7, roundTime: 75, buyTime: 7, maps: SMALL,
  },
  ranked: {
    id: 'ranked', name: 'Ranked 1v1', short: '1V1', teamSize: 1, kind: 'rounds', ranked: true,
    desc: 'Competitive 1v1 with an economy that rewards winning rounds. Moves your ELO. First to 7. Leaving counts as a loss.',
    economy: true, roundsToWin: 7, roundTime: 75, buyTime: 7, maps: SMALL,
  },
  duo: {
    id: 'duo', name: '2v2 Wingman', short: '2V2', teamSize: 2, kind: 'rounds',
    desc: 'Two-player squads and fast rounds. Round wins pay more than losses, so the winning pair can afford better guns. First to 7.',
    economy: true, roundsToWin: 7, roundTime: 90, buyTime: 8, maps: SMALL,
  },
  bomb: {
    id: 'bomb', name: '5v5 Bomb Defusal', short: '5V5', teamSize: 5, kind: 'bomb',
    desc: 'Attackers plant the charge at site A or B, defenders stop them. Full economy. First to 9.',
    roundsToWin: 9, halftime: 8, roundTime: 115, buyTime: 15, bombTime: 40, plantTime: 3.2, defuseTime: 7,
    maps: LARGE,
  },
  hostage: {
    id: 'hostage', name: 'Hostage Rescue', short: 'HR', teamSize: 5, kind: 'hostage',
    desc: 'Two hostages are held at one of the sites. Attackers carry one back to their spawn to win; defenders hold them until time runs out. Full economy. First to 9.',
    roundsToWin: 9, halftime: 8, roundTime: 120, buyTime: 15, pickupTime: 1.2, maps: LARGE,
  },
  retake: {
    id: 'retake', name: 'Retakes', short: 'RTK', teamSize: 4, kind: 'retake',
    desc: 'The charge is already planted. Attackers start on the site and guard it; defenders push in and defuse before it blows. Free loadouts. First to 8.',
    roundsToWin: 8, halftime: 7, roundTime: 45, buyTime: 6, bombTime: 45, defuseTime: 6, maps: LARGE,
  },
  tdm: {
    id: 'tdm', name: 'Team Deathmatch', short: 'TDM', teamSize: 5, kind: 'tdm',
    desc: 'Five-a-side with instant respawns and free loadouts. First team to 60 kills or 8 minutes.',
    killsToWin: 60, timeLimit: 480, maps: ALL,
  },
  gungame: {
    id: 'gungame', name: 'Gun Game', short: 'GUN', maxPlayers: 8, kind: 'gungame',
    desc: `Every kill swaps you to the next weapon. Get a kill with all ${GUN_GAME_ORDER.length}, ending on the knife. Knife kills set victims back.`,
    timeLimit: 600, maps: ALL,
  },
  ffa: {
    id: 'ffa', name: 'Free For All', short: 'FFA', maxPlayers: 8, kind: 'ffa',
    desc: 'Everyone for themselves. Instant respawns. First to 25 kills or 6 minutes.',
    killsToWin: 25, timeLimit: 360, maps: ALL,
  },
  training: {
    id: 'training', name: 'Training Range', short: 'GYM', maxPlayers: 1, kind: 'training', offlineOnly: true,
    desc: 'Aim drills, moving targets, spray practice and grenade line-ups. Infinite ammo, every weapon free.',
    maps: ['range'],
  },
  // The tutorial is a training variant (same sandbox: no rounds, free buying, no stats); js/game/tutorial.js runs it.
  tutorial: {
    id: 'tutorial', name: 'Tutorial', short: 'TUT', maxPlayers: 2, kind: 'training', offlineOnly: true, plantTime: 3.2, defuseTime: 5, bombTime: 40,
    desc: 'A guided course through movement, shooting, grenades, buying, the charge and team tools, then a 1v1.',
    maps: ['course'],
  },
};

// Money rules for a mode, or null when loadouts are free.
export function econFor(mode) {
  if (mode.kind === 'bomb' || mode.kind === 'hostage') return ECON;
  return mode.economy ? DUEL_ECON : null;
}

export const RESPAWN_KINDS = new Set(['ffa', 'tdm', 'gungame']);
export const SOLO_KINDS = new Set(['ffa', 'gungame', 'training']);
// Modes with a charge to plant or defuse.
export const BOMB_KINDS = new Set(['bomb', 'retake']);
// Attack/defend modes: named sides and played on the large maps with sites.
export const SIDED_KINDS = new Set(['bomb', 'retake', 'hostage']);
export const needsSites = (mode) => SIDED_KINDS.has(mode.kind);

// Short, always-visible description of how a match is won.
export function goalText(mode) {
  switch (mode.kind) {
    case 'rounds': return `First to ${mode.roundsToWin} rounds`;
    case 'bomb': case 'retake': case 'hostage': return `First to ${mode.roundsToWin} rounds · sides swap after ${mode.halftime}`;
    case 'training': return 'Practice at your own pace';
    case 'ffa': return `First to ${mode.killsToWin} kills`;
    case 'tdm': return `First team to ${mode.killsToWin} kills`;
    case 'gungame': return `First through all ${GUN_GAME_ORDER.length} weapons`;
    default: return '';
  }
}

// Cycles each mode through its whole map pool instead of picking at random.
export function nextMap(modeId) {
  const pool = MODES[modeId].maps;
  let i = 0;
  try { i = (Number(localStorage.getItem('jps_rot_' + modeId)) || 0) % pool.length; localStorage.setItem('jps_rot_' + modeId, String(i + 1)); }
  catch { i = Math.floor(Math.random() * pool.length); }
  return pool[i];
}

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
