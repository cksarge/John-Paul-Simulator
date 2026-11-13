// Ranked seasons and their reward tracks. Dates (UTC) are owned by the `seasons` table in the database;
// the copies here are the fallback when it can't be reached. Each season lasts three months, except the
// first, which runs from launch to the end of December 2026.
import { KINDS, RARITIES, setSeasonGate } from './skins.js';

export const SEASONS = [
  { id: 's1', num: 1, name: 'First Contact', start: '2026-11-01T00:00:00Z', end: '2027-01-01T00:00:00Z', color: '#f2a33a' },
  { id: 's2', num: 2, name: 'Frostline', start: '2027-01-01T00:00:00Z', end: '2027-04-01T00:00:00Z', color: '#7cc7ff' },
  { id: 's3', num: 3, name: 'Overgrowth', start: '2027-04-01T00:00:00Z', end: '2027-07-01T00:00:00Z', color: '#6ddc5a' },
  { id: 's4', num: 4, name: 'Heatwave', start: '2027-07-01T00:00:00Z', end: '2027-10-01T00:00:00Z', color: '#ff7a3d' },
  { id: 's5', num: 5, name: 'Nightfall', start: '2027-10-01T00:00:00Z', end: '2028-01-01T00:00:00Z', color: '#c06cff' },
];

export const TIERS = 30;
export const TIER_XP = 1000;
// Ranked wins in a season needed for that season's ranked calling card.
export const RANKED_REWARD_WINS = 5;

// Season-exclusive cosmetics by tier. They never drop and stay locked until their season's track is earned.
const EXCLUSIVE_TIERS = { card: 6, finish: 14, outfit: 22, legend: 30 };

// Updates dates from the database rows ({id, starts_at, ends_at}).
export function applySeasonRows(rows) {
  for (const r of rows || []) {
    const s = SEASONS.find((x) => x.id === r.id);
    if (s) { s.start = r.starts_at; s.end = r.ends_at; if (r.name) s.name = r.name; }
  }
}

export function seasonAt(t = Date.now()) {
  return SEASONS.find((s) => t >= Date.parse(s.start) && t < Date.parse(s.end)) || null;
}
export const currentSeason = () => seasonAt();
export const seasonById = (id) => SEASONS.find((s) => s.id === id) || null;
export const seasonStarted = (s) => !!s && Date.now() >= Date.parse(s.start);
setSeasonGate((id) => !seasonStarted(seasonById(id)));

export function tierFor(passXp = 0) {
  const tier = Math.min(TIERS, Math.floor(passXp / TIER_XP));
  return { tier, into: tier >= TIERS ? TIER_XP : passXp % TIER_XP, need: TIER_XP };
}

// Small seeded RNG so every player sees the same track for a season.
function rng(seed) {
  let h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
  return () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
}

const RARITY_BY_TIER = (t) => (t < 8 ? ['common', 'uncommon'] : t < 16 ? ['uncommon', 'rare'] : t < 24 ? ['rare', 'epic'] : ['epic', 'legendary']);

// Regular (non-exclusive) tiers are drawn with a seeded RNG from the cosmetics in skins.js, so adding or
// removing cosmetics mid-season reshuffles those tiers.
// The 30 rewards for a season: the four exclusives at fixed tiers, the rest picked from the regular
// collection (no starters, milestones or other seasons' items), getting rarer as the track goes on.
const trackCache = new Map();
export function seasonTrack(seasonId) {
  if (trackCache.has(seasonId)) return trackCache.get(seasonId);
  const r = rng(seasonId + ':track');
  const exclusives = {};
  for (const [kind, k] of Object.entries(KINDS)) {
    for (const [id, d] of Object.entries(k.defs)) {
      if (d.season !== seasonId || d.rankedReward) continue;
      exclusives[d.slot] = { kind, id };
    }
  }
  const pool = [];
  for (const [kind, k] of Object.entries(KINDS)) {
    for (const [id, d] of Object.entries(k.defs)) if (!d.starter && !d.milestone && !d.season) pool.push({ kind, id, rarity: d.rarity });
  }
  const used = new Set(), track = [];
  for (let t = 1; t <= TIERS; t++) {
    const slot = Object.entries(EXCLUSIVE_TIERS).find(([, n]) => n === t)?.[0];
    if (slot && exclusives[slot]) { track.push({ tier: t, ...exclusives[slot], exclusive: true }); continue; }
    const want = RARITY_BY_TIER(t);
    let cands = pool.filter((it) => want.includes(it.rarity) && !used.has(it.kind + it.id));
    if (!cands.length) cands = pool.filter((it) => !used.has(it.kind + it.id));
    if (!cands.length) cands = pool;
    const pick = cands[Math.floor(r() * cands.length)];
    used.add(pick.kind + pick.id);
    track.push({ tier: t, kind: pick.kind, id: pick.id });
  }
  trackCache.set(seasonId, track);
  return track;
}

export function rankedReward(seasonId) {
  for (const [kind, k] of Object.entries(KINDS)) for (const [id, d] of Object.entries(k.defs)) if (d.season === seasonId && d.rankedReward) return { kind, id };
  return null;
}

export const itemDef = (it) => KINDS[it.kind]?.defs[it.id];
export const rarityColor = (it) => RARITIES[itemDef(it)?.rarity]?.color || '#9aa4ad';

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function timeLeft(iso) {
  const s = Math.max(0, (Date.parse(iso) - Date.now()) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
