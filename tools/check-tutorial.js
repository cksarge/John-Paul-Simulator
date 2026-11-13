// Dev tool: checks the tutorial course. Every zone must be reachable on foot from the start (jumping,
// mantling, crouching and ladders allowed; doors and gates count as open), the bomb site must be where
// the plant step expects it, and the course must stay out of every map list.
// Usage (browser console on the game page): const m = await import('/tools/check-tutorial.js'); m.checkTutorial();
// It returns a list of problems; an empty list means the course is fine.
import { MAPS, COURSE_ZONES } from '../js/data/maps.js';
import { MODES } from '../js/data/modes.js';
import { World } from '../js/engine/world.js';
import { isPlatform } from '../js/engine/grid.js';
import { STEPS, SECTIONS } from '../js/game/tutorial.js';

// Cells a player can stand in, and the height of the floor there.
function floorH(w, x, y) {
  const ch = w.chars[y]?.[x];
  if (ch === undefined) return null;
  if (ch === '.' || ch === 'L' || ch === 'Y' || ch === 'E' || isPlatform(ch) || ch === 'D' || ch === 'P') return isPlatform(ch) ? w.H[y * w.w + x] : 0;
  if (ch === 'c' || ch === 'k' || ch === 'A' || ch === 'h' || ch === 'J' || ch === 'B') return w.H[y * w.w + x]; // stand on top of low props
  return null;
}

// Every cell a player can get to from (sx, sy).
function reach(w, sx, sy) {
  const seen = new Set([sx + ',' + sy]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift(), h = floorH(w, x, y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k)) continue;
      const nh = floorH(w, nx, ny);
      if (nh === null) continue;
      const lad = w.chars[y][x] === 'L' || w.chars[ny][nx] === 'L';
      const lift = w.chars[y][x] === 'E' || w.chars[ny][nx] === 'E';
      if (nh - h > 2.15 && !lad && !lift) continue; // too high to mantle
      const lo = w.UL[ny * w.w + nx];
      if (lo && lo - nh < 1.1) continue; // can't even crouch under it
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

export function checkTutorial() {
  const bad = [];
  const def = MAPS.course;
  if (!def) return ['course missing'];
  if (!def.training) bad.push('course is not marked training (it would show up in map lists)');
  if (Object.values(MAPS).filter((m) => !m.training).includes(def)) bad.push('course is in the playable map list');
  for (const m of Object.values(MODES)) if (m.id !== 'tutorial' && m.maps?.includes?.('course')) bad.push(`mode ${m.id} rotates course`);
  if (MODES.tutorial?.kind !== 'training' || !MODES.tutorial.maps.includes('course')) bad.push('tutorial mode missing or not on course');
  const w = new World(def);
  const [sx0, sy0] = def.spawns[0];
  const seen = reach(w, sx0, sy0);
  for (const [name, r] of Object.entries(COURSE_ZONES)) {
    const cx = Math.floor((r[0] + r[2]) / 2), cy = Math.floor((r[1] + r[3]) / 2);
    if (!seen.has(cx + ',' + cy)) bad.push(`zone ${name} (${cx},${cy}) is not reachable from the start`);
  }
  const s = COURSE_ZONES.site;
  if (s && w.siteAt(((s[0] + s[2]) / 2 + 0.5) * 2, ((s[1] + s[3]) / 2 + 0.5) * 2) !== 'A') bad.push('site zone is not on bomb site A');
  const ids = new Set();
  for (const st of STEPS) {
    if (!st.id || !st.title || typeof st.done !== 'function' || typeof st.help !== 'function') bad.push(`step ${st.id || '?'} is missing id, title, help or done`);
    if (!(st.zone in COURSE_ZONES)) bad.push(`step ${st.id} has unknown zone ${st.zone}`);
    if (!(st.section >= 1 && st.section <= SECTIONS)) bad.push(`step ${st.id} has section ${st.section}`);
    if (ids.has(st.id)) bad.push(`duplicate step ${st.id}`);
    ids.add(st.id);
  }
  return bad;
}
