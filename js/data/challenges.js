// Daily and weekly challenges. Everyone gets the same three of each, picked from the date (UTC).
// Progress comes from finished matches (not the training range). Rewards: 300 XP per daily and
// 1,000 XP per weekly, added to both your level and the season reward track. The database checks
// claims (supabase/schema.sql → claim_challenge), so the reward amounts here are for display only.
import { WEAPONS } from './weapons.js';

export const DAILY_XP = 300;
export const WEEKLY_XP = 1000;

const CLASS_LABEL = { rifle: 'rifles', smg: 'SMGs', pistol: 'pistols', shotgun: 'shotguns', sniper: 'snipers', lmg: 'LMGs' };

// stat(m) returns how much one match adds. m: {mode, result, online, k, hs, dmg, weapons, nades, plants, defuses, rescues, knife}
const classKills = (cls) => (m) => Object.entries(m.weapons || {}).reduce((a, [w, v]) => a + (WEAPONS[w]?.type === cls ? v.k : 0), 0);

const DAILY = [
  { id: 'kills', text: (n) => `Get ${n} kills`, n: 15, stat: (m) => m.k },
  { id: 'hs', text: (n) => `Land ${n} headshot kills`, n: 6, stat: (m) => m.hs },
  { id: 'wins', text: (n) => `Win ${n} matches`, n: 2, stat: (m) => (m.result === 'win' ? 1 : 0) },
  { id: 'play', text: (n) => `Finish ${n} matches`, n: 3, stat: () => 1 },
  { id: 'dmg', text: (n) => `Deal ${n.toLocaleString()} damage`, n: 1500, stat: (m) => m.dmg },
  { id: 'nades', text: (n) => `Throw ${n} grenades`, n: 6, stat: (m) => m.nades },
  ...Object.keys(CLASS_LABEL).map((c) => ({ id: 'cls_' + c, text: (n) => `Get ${n} kills with ${CLASS_LABEL[c]}`, n: c === 'sniper' || c === 'shotgun' || c === 'lmg' ? 5 : 8, stat: classKills(c) })),
];

const WEEKLY = [
  { id: 'wins', text: (n) => `Win ${n} matches`, n: 10, stat: (m) => (m.result === 'win' ? 1 : 0) },
  { id: 'kills', text: (n) => `Get ${n} kills`, n: 100, stat: (m) => m.k },
  { id: 'hs', text: (n) => `Land ${n} headshot kills`, n: 40, stat: (m) => m.hs },
  { id: 'ranked', text: (n) => `Win ${n} ranked matches`, n: 3, stat: (m) => (m.mode === 'ranked' && m.result === 'win' ? 1 : 0) },
  { id: 'objective', text: (n) => `Plant or defuse the charge ${n} times`, n: 5, stat: (m) => m.plants + m.defuses },
  { id: 'rescue', text: (n) => `Rescue ${n} hostages`, n: 3, stat: (m) => m.rescues },
  { id: 'knife', text: (n) => `Get ${n} knife kills`, n: 5, stat: (m) => m.knife },
  { id: 'dmg', text: (n) => `Deal ${n.toLocaleString()} damage`, n: 8000, stat: (m) => m.dmg },
  ...['rifle', 'smg', 'sniper'].map((c) => ({ id: 'cls_' + c, text: (n) => `Get ${n} kills with ${CLASS_LABEL[c]}`, n: c === 'sniper' ? 20 : 30, stat: classKills(c) })),
];

// UTC day "2026-11-13" and ISO week "2026-W46" — the same strings the database checks.
export function dayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), week = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

function pick(list, seed, n) {
  let h = [...seed].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);
  const pool = [...list], out = [];
  while (out.length < n && pool.length) {
    h = (h * 1103515245 + 12345) >>> 0;
    const c = pool.splice(h % pool.length, 1)[0];
    // Only one class-kills challenge at a time.
    if (c.id.startsWith('cls_') && out.some((o) => o.id.startsWith('cls_'))) continue;
    out.push(c);
  }
  return out;
}

// The active challenges: [{key, period, text, n, xp, def}]. Keys match claim_challenge's format.
export function activeChallenges(now = new Date()) {
  const d = dayKey(now), w = weekKey(now);
  return [
    ...pick(DAILY, 'd' + d, 3).map((c, i) => ({ key: `d:${d}:${i}`, period: 'daily', text: c.text(c.n), n: c.n, xp: DAILY_XP, def: c })),
    ...pick(WEEKLY, 'w' + w, 3).map((c, i) => ({ key: `w:${w}:${i}`, period: 'weekly', text: c.text(c.n), n: c.n, xp: WEEKLY_XP, def: c })),
  ];
}

// Progress is stored as {key: count}, plus `claimed: [keys]`. Old periods are dropped.
export function normalizeProgress(p) {
  const live = new Set(activeChallenges().map((c) => c.key));
  const out = { claimed: (p?.claimed || []).filter((k) => live.has(k)) };
  for (const k of live) out[k] = Math.max(0, Number(p?.[k]) || 0);
  return out;
}

// Adds one finished match. Returns the challenges that just completed.
export function applyMatch(progress, m) {
  const done = [];
  for (const c of activeChallenges()) {
    const before = progress[c.key] || 0;
    const add = Math.max(0, Math.floor(c.def.stat(m) || 0));
    if (!add) continue;
    progress[c.key] = Math.min(c.n, before + add);
    if (before < c.n && progress[c.key] >= c.n) done.push(c);
  }
  return done;
}

// Next reset times for the countdowns.
export function nextDailyReset(now = new Date()) { return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1); }
export function nextWeeklyReset(now = new Date()) {
  const day = now.getUTCDay() || 7;
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (8 - day));
}
