// Shared helpers for map grid characters.
// '1'..'8' are raised platforms, 0.5 m per step (so '8' is a 4 m catwalk).
export const isPlatform = (ch) => ch >= '1' && ch <= '8';
export const platformH = (ch) => (isPlatform(ch) ? (ch.charCodeAt(0) - 48) * 0.5 : 0);
// Cells you can stand on (ladders 'L' are floor with a ladder against the neighbouring platform).
export const isWalkable = (ch) => ch === '.' || ch === 'L' || isPlatform(ch);

// The upper layer: things overhead that you can walk under (and on). A slab from `lo` to `top`.
// '=' bridge 4 m · '-' bridge 2 m (crouch under it) · 'R' / 'r' the same with railings ·
// 'g' breakable grate catwalk 4 m (shoot or blow it out) · 'T' tunnel roof (thick, 3–4 m).
export const UPPER = {
  '=': { top: 4, lo: 3.7 },
  '-': { top: 2, lo: 1.7 },
  'R': { top: 4, lo: 3.7, rails: true },
  'r': { top: 2, lo: 1.7, rails: true },
  'g': { top: 4, lo: 3.8, grate: true },
  'T': { top: 4, lo: 3.0, roof: true },
};
export const UPPER_CHARS = Object.keys(UPPER).join('');

// Directional cells swap when a map is mirrored (rotated 180°), rotated or flipped.
// Ramps '^' '>' 'v' '<' and stairs 'n' 'e' 's' 'w' rise towards north / east / south / west.
const DIRS = { ramp: ['^', '>', 'v', '<'], stairs: ['n', 'e', 's', 'w'] };
export const DIR_OF = {};
for (const [kind, set] of Object.entries(DIRS)) set.forEach((ch, i) => { DIR_OF[ch] = { kind, i }; });
// Rotates a directional cell by `quarter` 90° turns clockwise (2 = the mirror's 180°).
export function turnChar(ch, quarter) {
  const d = DIR_OF[ch];
  return d ? DIRS[d.kind][(d.i + quarter + 4) % 4] : ch;
}
// Flips a directional cell left-right ('x') or top-bottom ('y').
export function flipChar(ch, axis) {
  const d = DIR_OF[ch];
  if (!d) return ch;
  const i = axis === 'x' ? (d.i === 1 ? 3 : d.i === 3 ? 1 : d.i) : (d.i === 0 ? 2 : d.i === 2 ? 0 : d.i);
  return DIRS[d.kind][i];
}
