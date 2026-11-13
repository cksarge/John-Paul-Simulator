// Achievements: badges for milestones and standout matches. Like challenges, progress is tracked by
// the client after every finished match (not the training range) and saved on the profile
// (profiles.achievements) or, for guests, in this browser.
// Stored as { c: {counter: n, …}, u: {id: unlockedAtMs, …} }.
import { WEAPONS } from './weapons.js';
import { MODES, levelFor } from './modes.js';
import { MAPS, VARIANTS } from './maps.js';

export const TIERS = {
  bronze: { name: 'Bronze', color: '#c98a4b', points: 10 },
  silver: { name: 'Silver', color: '#c7d0d8', points: 25 },
  gold: { name: 'Gold', color: '#ffd23f', points: 50 },
};

const PLAY_MODES = Object.keys(MODES).filter((k) => MODES[k].kind !== 'training');
const PLAY_MAPS = Object.keys(MAPS).filter((k) => !MAPS[k].training);
const classKills = (m, cls) => Object.entries(m.weapons || {}).reduce((a, [w, v]) => a + (WEAPONS[w]?.type === cls ? v.k : 0), 0);

// `stat` + `n`: a running counter reaches n (shows a progress bar). `test(m)`: done in a single match.
export const ACHIEVEMENTS = [
  // combat
  { id: 'first_blood', cat: 'Combat', icon: '🩸', tier: 'bronze', name: 'First Blood', desc: 'Get your first kill', stat: 'kills', n: 1 },
  { id: 'kills_100', cat: 'Combat', icon: '💯', tier: 'bronze', name: 'Centurion', desc: 'Get 100 kills', stat: 'kills', n: 100 },
  { id: 'kills_1000', cat: 'Combat', icon: '⚔️', tier: 'gold', name: 'Thousand Yard', desc: 'Get 1,000 kills', stat: 'kills', n: 1000 },
  { id: 'hs_50', cat: 'Combat', icon: '🎯', tier: 'bronze', name: 'Head Hunter', desc: 'Land 50 headshot kills', stat: 'hs', n: 50 },
  { id: 'hs_500', cat: 'Combat', icon: '🧠', tier: 'gold', name: 'Surgeon', desc: 'Land 500 headshot kills', stat: 'hs', n: 500 },
  { id: 'multi3', cat: 'Combat', icon: '⚡', tier: 'bronze', name: 'Triple Threat', desc: 'Get 3 kills within 5 seconds', test: (m) => m.multi >= 3 },
  { id: 'multi5', cat: 'Combat', icon: '🌪️', tier: 'gold', name: 'Rampage', desc: 'Get 5 kills within 5 seconds', test: (m) => m.multi >= 5 },
  { id: 'streak10', cat: 'Combat', icon: '🔥', tier: 'silver', name: 'Unstoppable', desc: 'Get 10 kills in a row without dying', test: (m) => m.streak >= 10 },
  { id: 'long50', cat: 'Combat', icon: '🔭', tier: 'silver', name: 'Long Shot', desc: 'Get a kill from 50 metres or more', test: (m) => m.long >= 50 },
  { id: 'flawless', cat: 'Combat', icon: '🛡️', tier: 'silver', name: 'Untouchable', desc: 'Win a match without dying (at least 5 kills)', test: (m) => m.result === 'win' && m.d === 0 && m.k >= 5 },
  { id: 'match30', cat: 'Combat', icon: '💥', tier: 'gold', name: 'One-Man Army', desc: 'Get 30 kills in one match', test: (m) => m.k >= 30 },
  // weapons
  { id: 'knife10', cat: 'Weapons', icon: '🔪', tier: 'bronze', name: 'Up Close', desc: 'Get 10 knife kills', stat: 'knife', n: 10 },
  { id: 'sniper100', cat: 'Weapons', icon: '🦅', tier: 'silver', name: 'Overwatch', desc: 'Get 100 sniper kills', stat: 'sniper', n: 100 },
  { id: 'pistol50', cat: 'Weapons', icon: '🔫', tier: 'bronze', name: 'Sidearm Specialist', desc: 'Get 50 pistol kills', stat: 'pistol', n: 50 },
  { id: 'shotgun50', cat: 'Weapons', icon: '🚪', tier: 'bronze', name: 'Door Kicker', desc: 'Get 50 shotgun kills', stat: 'shotgun', n: 50 },
  { id: 'arsenal', cat: 'Weapons', icon: '🧰', tier: 'silver', name: 'Arsenal', desc: 'Get a kill with 15 different weapons', stat: 'arsenal', n: 15 },
  { id: 'nades100', cat: 'Weapons', icon: '💣', tier: 'bronze', name: 'Grenadier', desc: 'Throw 100 grenades', stat: 'nades', n: 100 },
  // objectives
  { id: 'plant1', cat: 'Objectives', icon: '📦', tier: 'bronze', name: 'Charge Set', desc: 'Plant the charge', stat: 'plants', n: 1 },
  { id: 'plant25', cat: 'Objectives', icon: '🧨', tier: 'silver', name: 'Demolitionist', desc: 'Plant the charge 25 times', stat: 'plants', n: 25 },
  { id: 'defuse1', cat: 'Objectives', icon: '✂️', tier: 'bronze', name: 'Wire Cutter', desc: 'Defuse the charge', stat: 'defuses', n: 1 },
  { id: 'defuse25', cat: 'Objectives', icon: '🧯', tier: 'silver', name: 'Bomb Squad', desc: 'Defuse the charge 25 times', stat: 'defuses', n: 25 },
  { id: 'rescue10', cat: 'Objectives', icon: '🚑', tier: 'silver', name: 'Extraction', desc: 'Rescue 10 hostages', stat: 'rescues', n: 10 },
  { id: 'gungame', cat: 'Objectives', icon: '🏁', tier: 'silver', name: 'Full Circuit', desc: 'Win a Gun Game match', test: (m) => m.mode === 'gungame' && m.result === 'win' },
  // career
  { id: 'matches10', cat: 'Career', icon: '🎮', tier: 'bronze', name: 'Getting Started', desc: 'Finish 10 matches', stat: 'matches', n: 10 },
  { id: 'matches100', cat: 'Career', icon: '📅', tier: 'silver', name: 'Regular', desc: 'Finish 100 matches', stat: 'matches', n: 100 },
  { id: 'wins50', cat: 'Career', icon: '🏆', tier: 'silver', name: 'Winner', desc: 'Win 50 matches', stat: 'wins', n: 50 },
  { id: 'ranked1', cat: 'Career', icon: '🎖️', tier: 'bronze', name: 'Ranked Debut', desc: 'Win a ranked match', stat: 'rankedWins', n: 1 },
  { id: 'level25', cat: 'Career', icon: '⭐', tier: 'gold', name: 'Veteran', desc: 'Reach level 25', stat: 'level', n: 25 },
  { id: 'all_modes', cat: 'Career', icon: '🃏', tier: 'silver', name: 'Jack of All Trades', desc: `Finish a match in every mode (${PLAY_MODES.length})`, stat: 'modes', n: PLAY_MODES.length },
  { id: 'all_maps', cat: 'Career', icon: '🗺️', tier: 'silver', name: 'World Tour', desc: `Finish a match on every official map (${PLAY_MAPS.length})`, stat: 'maps', n: PLAY_MAPS.length },
  { id: 'night5', cat: 'Career', icon: '🌙', tier: 'bronze', name: 'Night Owl', desc: 'Win 5 matches at night', stat: 'nightWins', n: 5 },
  { id: 'all_weather', cat: 'Career', icon: '🌦️', tier: 'silver', name: 'All-Weather', desc: 'Win a match in every condition (standard, night, rain, fog)', stat: 'conds', n: Object.keys(VARIANTS).length },
  // social
  { id: 'friend1', cat: 'Social', icon: '🤝', tier: 'bronze', name: 'Squad Up', desc: 'Add a friend', stat: 'friends', n: 1 },
  { id: 'party', cat: 'Social', icon: '👥', tier: 'bronze', name: 'Strength in Numbers', desc: 'Finish an online match with a party', test: (m) => m.online && m.party > 1 },
];
export const BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
export const MAX_POINTS = ACHIEVEMENTS.reduce((a, d) => a + TIERS[d.tier].points, 0);

// Counters stored as lists (distinct things seen) count by their length.
const LISTS = ['modes', 'maps', 'conds', 'weaponsUsed'];

export function normalizeAchievements(a) {
  const c = {}, u = {};
  for (const [k, v] of Object.entries(a?.c || {})) c[k] = LISTS.includes(k) ? [...new Set(Array.isArray(v) ? v.map(String) : [])] : Math.max(0, Number(v) || 0);
  for (const [k, v] of Object.entries(a?.u || {})) if (BY_ID[k]) u[k] = Number(v) || Date.now();
  return { c, u };
}

// Combines two records (e.g. what a guest earned on this device and the account's).
export function mergeAchievements(a, b) {
  const x = normalizeAchievements(a), y = normalizeAchievements(b);
  for (const [k, v] of Object.entries(y.c)) x.c[k] = Array.isArray(v) ? [...new Set([...(x.c[k] || []), ...v])] : Math.max(x.c[k] || 0, v);
  for (const [k, v] of Object.entries(y.u)) x.u[k] = Math.min(x.u[k] || Infinity, v);
  return x;
}

// Current value of a counter. `profile` (signed in) lifts the career ones to the server totals.
export function statValue(rec, stat, profile = null) {
  const v = rec.c[stat];
  const own = Array.isArray(v) ? v.length : v || 0;
  if (stat === 'arsenal') return (rec.c.weaponsUsed || []).length;
  if (!profile) return own;
  const server = { kills: profile.kills, hs: profile.headshots, wins: profile.wins, matches: profile.matches, rankedWins: profile.ranked_wins, level: levelFor(profile.xp || 0).level }[stat];
  return Math.max(own, server || 0);
}

// [current, goal] for counter achievements, or null.
export function progressOf(rec, def, profile) {
  return def.stat ? [Math.min(def.n, statValue(rec, def.stat, profile)), def.n] : null;
}

// Unlocks anything newly reached. Returns the newly unlocked definitions.
export function checkUnlocks(rec, profile = null, match = null) {
  const out = [];
  for (const d of ACHIEVEMENTS) {
    if (rec.u[d.id]) continue;
    const done = d.stat ? statValue(rec, d.stat, profile) >= d.n : !!(match && d.test(match));
    if (done) { rec.u[d.id] = Date.now(); out.push(d); }
  }
  return out;
}

// Adds one finished match to the counters, then unlocks. m: {mode, map, variant, result, online, k, d, hs,
// weapons, nades, plants, defuses, rescues, knife, multi, streak, long, party}
export function applyMatchAchievements(rec, m, profile) {
  const c = rec.c, add = (k, n) => { if (n > 0) c[k] = (c[k] || 0) + n; };
  const addTo = (k, v) => { c[k] = [...new Set([...(c[k] || []), v])]; };
  add('kills', m.k); add('hs', m.hs); add('matches', 1); add('wins', m.result === 'win' ? 1 : 0);
  add('knife', m.knife); add('nades', m.nades); add('plants', m.plants); add('defuses', m.defuses); add('rescues', m.rescues);
  add('sniper', classKills(m, 'sniper')); add('pistol', classKills(m, 'pistol')); add('shotgun', classKills(m, 'shotgun'));
  add('rankedWins', m.mode === 'ranked' && m.result === 'win' ? 1 : 0);
  add('nightWins', m.variant === 'night' && m.result === 'win' ? 1 : 0);
  addTo('modes', m.mode);
  if (MAPS[m.map] && !MAPS[m.map].training && !MAPS[m.map].custom) addTo('maps', m.map);
  if (m.result === 'win') addTo('conds', m.variant || 'day');
  for (const [w, v] of Object.entries(m.weapons || {})) if (v.k > 0) addTo('weaponsUsed', w);
  return checkUnlocks(rec, profile, m);
}

export function points(rec) {
  return Object.keys(rec.u).reduce((a, id) => a + (BY_ID[id] ? TIERS[BY_ID[id].tier].points : 0), 0);
}
