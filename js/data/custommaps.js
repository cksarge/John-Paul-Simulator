import * as THREE from 'three';
import { MAPS } from './maps.js';
import { addMapToPools, removeMapFromPools } from './modes.js';
import { World } from '../engine/world.js';
import { UPPER_CHARS } from '../engine/grid.js';

// Community maps made in the map editor. Each account can upload MAX_UPLOADS. They're stored in
// Supabase (public.custom_maps) as a grid of rows, and become ordinary map definitions here with the
// id `cm<number>`. Featured maps (4 slots: 2 small, 2 large, picked by likes and approved by the admin)
// load on every device at start-up and join every queue's rotation. Downloaded maps are kept in this
// browser for lobbies and bot matches, and a match on a custom map carries the map in its payload, so
// everyone in the match has it.
export const MAX_UPLOADS = 5;
export const FEATURED_SLOTS = [[1, 'small'], [2, 'small'], [3, 'large'], [4, 'large']];
export const MAP_LIMITS = {
  small: { minW: 14, maxW: 30, minH: 10, maxH: 24, w: 24, h: 16, spawnCells: 3 },
  large: { minW: 30, maxW: 52, minH: 26, maxH: 48, w: 44, h: 40, spawnCells: 5 },
};
// Map cell characters (see js/data/maps.js for what each one is). The upper layer has its own set.
export const CHARS = '.#XhcCM12345678=LDGBAWkQPJEY^>v<nesw';
const CHAR_SET = new Set(CHARS), UP_SET = new Set(UPPER_CHARS);
const MAX_SITE_RECTS = 24;
// Official maps whose look (textures, sky, lighting, dressing) a custom map can borrow.
export const THEMES = Object.values(MAPS).filter((m) => !m.training).map((m) => [m.id, m.name]);

export const isCustom = (id) => /^cm\d+$/.test(String(id));
const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function rect(r, w, h) {
  if (!Array.isArray(r) || r.length !== 4) return null;
  const [x0, y0, x1, y1] = r.map(int);
  return [clamp(Math.min(x0, x1), 1, w - 2), clamp(Math.min(y0, y1), 1, h - 2), clamp(Math.max(x0, x1), 1, w - 2), clamp(Math.max(y0, y1), 1, h - 2)];
}

// A bomb site: one rectangle or a list of them (any shape). Always cleaned to a list, or null.
function siteRects(r, w, h) {
  if (!Array.isArray(r)) return null;
  const list = (Array.isArray(r[0]) ? r : [r]).slice(0, MAX_SITE_RECTS).map((q) => rect(q, w, h)).filter(Boolean);
  return list.length ? list : null;
}

// Cleans editor/stored data: {w, h, rows: [string], up: [string] (optional upper layer),
// spawns: [[x0,y0,x1,y1] ×2], sites: {A, B} (each a list of rectangles), theme}.
// Anything malformed is repaired, so a tampered upload or match payload can't break the game.
export function cleanData(d, size) {
  const L = MAP_LIMITS[size === 'large' ? 'large' : 'small'];
  const w = clamp(int(d?.w) || L.w, L.minW, L.maxW), h = clamp(int(d?.h) || L.h, L.minH, L.maxH);
  const rows = [], up = [];
  let anyUp = false;
  for (let y = 0; y < h; y++) {
    const src = String(d?.rows?.[y] ?? ''), usrc = String(d?.up?.[y] ?? '');
    let line = '', uline = '';
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      line += edge ? '#' : CHAR_SET.has(src[x]) ? src[x] : '#';
      const u = !edge && UP_SET.has(usrc[x]) ? usrc[x] : '.';
      if (u !== '.') anyUp = true;
      uline += u;
    }
    rows.push(line); up.push(uline);
  }
  const spawns = [0, 1].map((i) => rect(d?.spawns?.[i], w, h));
  const sites = size === 'large' ? { A: siteRects(d?.sites?.A, w, h), B: siteRects(d?.sites?.B, w, h) } : {};
  const theme = THEMES.some(([id]) => id === d?.theme) ? d.theme : size === 'large' ? 'dustline' : 'vault';
  return { w, h, rows, ...(anyUp ? { up } : {}), spawns, sites, theme };
}

// A stored map row → the definition the game uses. Throws if the map can't be played (no open floor
// in a spawn or, on large maps, a bomb site), so a tampered upload is refused instead of breaking a match.
// row: {id, name, description, size, data, featured_slot, author}
export function toDef(row) {
  const size = row.size === 'large' ? 'large' : 'small';
  const d = cleanData(row.data, size);
  const open = (r) => !!r && d.rows.slice(r[1], r[3] + 1).some((line) => /[.L]/.test(line.slice(r[0], r[2] + 1)));
  if (!open(d.spawns[0]) || !open(d.spawns[1])) throw new Error('Place both spawn zones on open floor.');
  if (size === 'large' && (!d.sites.A?.some(open) || !d.sites.B?.some(open))) throw new Error('Place bomb sites A and B on open floor.');
  const runs = (lines, skip) => {
    const out = [];
    lines.forEach((line, y) => {
      for (let x = 0; x < line.length;) {
        const ch = line[x];
        let x1 = x;
        while (x1 + 1 < line.length && line[x1 + 1] === ch) x1++;
        if (ch !== skip) out.push([ch, x, y, x1, y]);
        x = x1 + 1;
      }
    });
    return out;
  };
  const ops = runs(d.rows, '#'), upper = d.up ? runs(d.up, '.') : [];
  const author = row.author || row.profiles?.username || 'a player';
  const def = {
    id: 'cm' + int(row.id), cmId: int(row.id), name: String(row.name || 'Custom map').slice(0, 24), size, w: d.w, h: d.h,
    desc: String(row.description || `Community map by ${author}.`).slice(0, 120), author, custom: true, featured: !!row.featured_slot,
    ops, upper, spawns: d.spawns.filter(Boolean), theme: MAPS[d.theme].theme, themeId: d.theme, data: d,
  };
  if (size === 'large' && d.sites.A && d.sites.B) def.sites = d.sites;
  return def;
}

// The row to send along in a match payload so every player can build the map.
export function payloadRow(def) {
  return def?.custom ? { id: def.cmId, name: def.name, description: def.desc, size: def.size, data: def.data, author: def.author } : null;
}

// ───────────── this browser's copies ─────────────
const DL_KEY = 'jps_custom_maps', FEAT_KEY = 'jps_featured_maps';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full */ } };

export function registerRow(row) {
  const def = toDef(row);
  MAPS[def.id] = def;
  return def;
}

export const downloadedIds = () => Object.keys(read(DL_KEY));
export const isDownloaded = (id) => !!read(DL_KEY)[id];

export function saveDownloaded(row) {
  const all = read(DL_KEY), def = registerRow(row);
  all[def.id] = { id: row.id, name: row.name, description: row.description, size: row.size, data: row.data, author: def.author };
  write(DL_KEY, all);
  return def;
}

export function removeDownloaded(id) {
  const all = read(DL_KEY);
  delete all[id];
  write(DL_KEY, all);
  if (MAPS[id] && !MAPS[id].featured) delete MAPS[id];
}

let featuredIds = [];
export const featuredList = () => featuredIds.filter((id) => MAPS[id]).map((id) => MAPS[id]);

// Featured rows from the database (or the cached copy when offline): registered and added to the rotation.
export function setFeatured(rows) {
  for (const id of featuredIds) { removeMapFromPools(id); if (MAPS[id]) MAPS[id].featured = false; }
  featuredIds = [];
  for (const row of [...rows].sort((a, b) => a.featured_slot - b.featured_slot)) {
    let def;
    try { def = registerRow(row); } catch { continue; }
    def.featured = true; def.slot = row.featured_slot;
    addMapToPools(def.id, def.size);
    featuredIds.push(def.id);
  }
  write(FEAT_KEY, rows.map((r) => ({ id: r.id, name: r.name, description: r.description, size: r.size, data: r.data, featured_slot: r.featured_slot, author: r.author || r.profiles?.username })));
}

// Start-up: downloaded maps plus the last known featured maps (used offline or until the fresh list loads).
export function loadLocalMaps() {
  for (const row of Object.values(read(DL_KEY))) { try { registerRow(row); } catch { /* skip a bad copy */ } }
  const cached = read(FEAT_KEY);
  if (Array.isArray(cached)) { try { setFeatured(cached); } catch { /* ignore */ } }
}

// ───────────── validation (the editor runs this before testing or uploading) ─────────────
// Returns a list of problems; an empty list means the map is playable. The same checks as
// tools/check-spawns.html: spawns can't see each other, and everyone can reach everything.
export function validateMap(def) {
  const problems = [];
  const L = MAP_LIMITS[def.size];
  if (def.spawns.length < 2) { problems.push('Place both spawn zones (Attackers and Defenders).'); return problems; }
  const w = new World(def);
  const [A, B] = w.spawnCells;
  if (A.length < L.spawnCells) problems.push(`The Attackers spawn needs at least ${L.spawnCells} open floor cells (it has ${A.length}).`);
  if (B.length < L.spawnCells) problems.push(`The Defenders spawn needs at least ${L.spawnCells} open floor cells (it has ${B.length}).`);
  if (def.size === 'large') {
    for (const k of ['A', 'B']) {
      const r = def.data.sites[k];
      if (!r) problems.push(`Place bomb site ${k}. Large maps need sites A and B.`);
      else if (w.cellsIn(r, true).length < 4) problems.push(`Bomb site ${k} needs at least 4 open floor cells.`);
      else if (w.cellsIn(r, true).length > 160) problems.push(`Bomb site ${k} is too big (at most 160 cells).`);
    }
  }
  if (problems.length) return problems;
  // Open every door and break everything breakable, then look for any sightline between the spawns.
  for (const p of w.props.values()) { if (p.ch === 'D' || p.ch === 'P') w.setDoor([p.x, p.y], true); else if ('GBWkQ'.includes(p.ch)) w.breakProp(p.x, p.y); }
  const v = new THREE.Vector3(), u = new THREE.Vector3();
  let seen = 0;
  outer: for (const a of A) for (const b of B) {
    for (const eh of [1.64, 1.14]) for (const th of [1.8, 1.15, 0.45]) {
      v.set((a.x + 0.5) * 2, eh, (a.y + 0.5) * 2); u.set((b.x + 0.5) * 2, th, (b.y + 0.5) * 2);
      if (w.lineOfSight(v, u)) { seen++; break outer; }
    }
  }
  if (seen) problems.push('The two spawns can see each other. Put walls between them (doors and glass count as open).');
  const targets = [B[0], ...Object.values(w.sites).map((s) => w.cellsIn(s.rects, true)[0]).filter(Boolean)];
  const from = w.cellCenter(A[0].x, A[0].y);
  if (targets.some((t) => !w.findPath(from, w.cellCenter(t.x, t.y)))) problems.push('Some areas can’t be reached on foot. Make sure the spawns and bomb sites are connected (ladders need a platform next to them).');
  return problems;
}

// ───────────── balance report (shown in the editor; warnings never block an upload) ─────────────
const RUN = 5.2; // metres per second, running with a pistol
const COVER = new Set(['h', 'c', 'C', 'M', 'k', 'W', 'B', 'A', 'Q']);

// Walking times from each spawn to each site (or to the middle on small maps), and warnings about
// things that tend to make a map one-sided.
export function mapReport(def) {
  const out = { times: [], warnings: [] };
  if (def.spawns.length < 2) return out;
  const w = new World(def);
  for (const p of w.props.values()) if (p.ch === 'D' || p.ch === 'P') w.setDoor([p.x, p.y], true);
  const [A, B] = w.spawnCells;
  if (!A.length || !B.length) return out;
  const center = (cells) => { const c = cells[Math.floor(cells.length / 2)]; return w.cellCenter(c.x, c.y); };
  const secs = (from, to) => {
    const p = w.findPath(from, to);
    if (!p) return null;
    let d = 0, prev = from;
    for (const q of p) { d += Math.hypot(q.x - prev.x, q.z - prev.z); prev = q; }
    return d / RUN;
  };
  const fmt = (t) => (t === null ? 'no route' : `${t.toFixed(1)} s`);
  const atk = center(A), def1 = center(B);
  if (def.size === 'large' && w.sites.A && w.sites.B) {
    const t = {};
    for (const k of ['A', 'B']) {
      const site = w.cellsIn(w.sites[k].rects, true), target = site.length ? w.cellCenter(site[Math.floor(site.length / 2)].x, site[Math.floor(site.length / 2)].y) : null;
      t[k] = { atk: target && secs(atk, target), def: target && secs(def1, target), cover: w.cellsIn(w.sites[k].rects, false).filter((c) => COVER.has(w.chars[c.y][c.x])).length, cells: site.length };
      out.times.push(`Site ${k}: attackers ${fmt(t[k].atk)}, defenders ${fmt(t[k].def)}`);
      if (t[k].atk !== null && t[k].def !== null && t[k].def > t[k].atk - 3) out.warnings.push(`Defenders reach site ${k} only ${Math.max(0, t[k].atk - t[k].def).toFixed(1)} s before the attackers. Most maps give defenders 5 s or more to set up.`);
      if (t[k].atk !== null && t[k].atk < 8) out.warnings.push(`Attackers can reach site ${k} in ${t[k].atk.toFixed(1)} s, which makes rushes very strong.`);
    }
    if (t.A.atk && t.B.atk && Math.max(t.A.atk, t.B.atk) > 1.7 * Math.min(t.A.atk, t.B.atk)) out.warnings.push(`One site is much further for the attackers (${fmt(t.A.atk)} to A, ${fmt(t.B.atk)} to B), so they'll mostly go to the closer one.`);
    const [ca, cb] = [t.A.cover, t.B.cover];
    if (Math.max(ca, cb) >= 4 && Math.max(ca, cb) > 2 * Math.max(1, Math.min(ca, cb))) out.warnings.push(`Site ${ca > cb ? 'A' : 'B'} has much more cover than site ${ca > cb ? 'B' : 'A'} (${Math.max(ca, cb)} vs ${Math.min(ca, cb)} cover cells).`);
    if (Math.max(t.A.cells, t.B.cells) > 2.5 * Math.min(t.A.cells, t.B.cells)) out.warnings.push(`The bomb sites are very different sizes (${t.A.cells} and ${t.B.cells} cells).`);
  } else {
    // Small maps: both spawns should be the same distance from the middle.
    const mid = w.cellsIn([Math.floor(w.w / 2) - 2, Math.floor(w.h / 2) - 2, Math.floor(w.w / 2) + 2, Math.floor(w.h / 2) + 2], true)[0];
    if (mid) {
      const m = w.cellCenter(mid.x, mid.y), ta = secs(atk, m), tb = secs(def1, m);
      out.times.push(`To the middle: attackers ${fmt(ta)}, defenders ${fmt(tb)}`);
      if (ta && tb && Math.abs(ta - tb) > 2 && !def.mirror) out.warnings.push(`One spawn is ${Math.abs(ta - tb).toFixed(1)} s closer to the middle. Mirror painting keeps small maps fair.`);
    }
  }
  if (Math.max(A.length, B.length) > 2.5 * Math.min(A.length, B.length)) out.warnings.push(`The spawn zones are very different sizes (${A.length} and ${B.length} cells).`);
  return out;
}
