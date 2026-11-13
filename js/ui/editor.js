// Map editor: a full-screen grid painter. Maps are grids of 2 m cells (see js/data/maps.js) on two
// layers: the ground, and an upper layer for bridges, grate catwalks and tunnel roofs that you can
// walk under. The editor paints cells, places the two spawn zones and (on large maps) bomb sites A and
// B (any shape), copies/rotates/flips areas, checks the map with validateMap and mapReport, and can
// test it against bots, walk it alone, or upload it (js/ui/workshop.js lists them).
import { MAP_LIMITS, MAX_UPLOADS, THEMES, cleanData, toDef, validateMap, mapReport } from '../data/custommaps.js';
import { isPlatform, platformH, UPPER, DIR_OF, turnChar, flipChar } from '../engine/grid.js';
import { censor } from '../data/profanity.js';
import { esc } from './social.js';

const ARROWS = ['↑', '→', '↓', '←'];
// Ground cells, grouped for the palette. Ramps and stairs are picked with a direction (R turns them).
export const PALETTE = [
  ['Floor and walls', [['.', 'Floor'], ['#', 'Wall'], ['X', 'Wall, second texture'], ['Q', 'Cracked wall (explosives break it)'], ['Y', 'Spawn barrier (gone when the round starts)']]],
  ['Cover', [['h', 'Half wall'], ['c', 'Crate, 1 m'], ['C', 'Tall crate, 2 m'], ['M', 'Shipping container'], ['k', 'Wooden crate (breakable)'], ['W', 'Wooden barricade (breakable)'], ['B', 'Explosive barrels'], ['A', 'Ammo crate']]],
  ['Heights', [['1', 'Platform 0.5 m'], ['2', 'Platform 1 m'], ['3', 'Platform 1.5 m'], ['4', 'Platform 2 m'], ['5', 'Catwalk 2.5 m'], ['6', 'Catwalk 3 m'], ['7', 'Catwalk 3.5 m'], ['8', 'Catwalk 4 m']]],
  ['Ramps and stairs', [['ramp', 'Ramp (rises the way the arrow points)'], ['stairs', 'Stairs (rise the way the arrow points)'], ['L', 'Ladder (floor next to a catwalk)'], ['E', 'Lift (rides up to the platform beside it)']]],
  ['Doors and props', [['D', 'Sliding door'], ['P', 'Gate (opened by the nearest switch)'], ['J', 'Gate switch'], ['G', 'Glass pane']]],
];
// The upper layer.
export const UPPER_PALETTE = [
  ['.', 'Nothing overhead'], ['=', 'Bridge 4 m (walk under it)'], ['R', 'Bridge 4 m with railings'], ['-', 'Low bridge 2 m (crouch under it)'],
  ['r', 'Low bridge 2 m with railings'], ['g', 'Grate catwalk 4 m (can be shot out)'], ['T', 'Tunnel roof (walk on it too)'],
];
const NAMES = Object.fromEntries(PALETTE.flatMap(([, items]) => items));
const UP_NAMES = Object.fromEntries(UPPER_PALETTE);
const ZONES = [['spawn0', 'Attackers spawn'], ['spawn1', 'Defenders spawn'], ['siteA', 'Bomb site A'], ['siteB', 'Bomb site B']];
const cellName = (ch) => (DIR_OF[ch] ? `${DIR_OF[ch].kind === 'ramp' ? 'Ramp' : 'Stairs'} ${ARROWS[DIR_OF[ch].i]}` : NAMES[ch] || '');

// Same colours as the radar, so the editor looks like the in-game minimap.
export function cellColor(ch) {
  if (ch === '#' || ch === 'X') return ch === 'X' ? '#2a2f37' : '#1b1f25';
  if ('hcCMBA'.includes(ch)) return { h: '#5b636e', c: '#7a6a4f', C: '#8c7656', M: '#a8432f', B: '#c0392b', A: '#41502e' }[ch];
  if (ch === 'W' || ch === 'k') return '#7a5a36';
  if (ch === 'D' || ch === 'P') return ch === 'P' ? '#6f5a2a' : '#8a6a3a';
  if (ch === 'G') return '#5f8fb0';
  if (ch === 'L') return '#9aa3ad';
  if (ch === 'Q') return '#3d434c';
  if (ch === 'Y') return '#3f6f9e';
  if (ch === 'J') return '#c9a227';
  if (ch === 'E') return '#b5bcc6';
  if (DIR_OF[ch]) return DIR_OF[ch].kind === 'ramp' ? '#8f99a5' : '#a1a9b3';
  if (isPlatform(ch)) { const h = platformH(ch); return `rgb(${140 + h * 18},${150 + h * 16},${165 + h * 14})`; }
  return '#7c8591';
}
const upperColor = (ch) => ({ '=': 'rgba(214,222,232,.72)', 'R': 'rgba(232,206,120,.72)', '-': 'rgba(170,190,210,.72)', 'r': 'rgba(210,190,120,.72)', 'g': 'rgba(150,160,172,.72)', 'T': 'rgba(60,66,76,.82)' }[ch]);
const cellLabel = (ch) => (DIR_OF[ch] ? ARROWS[DIR_OF[ch].i] : isPlatform(ch) || 'LDGBAWkQPJEY'.includes(ch) ? (ch === 'L' ? '☰' : ch) : '');

export function newDraft(size) {
  const L = MAP_LIMITS[size];
  const rows = [];
  for (let y = 0; y < L.h; y++) rows.push(y === 0 || y === L.h - 1 ? '#'.repeat(L.w) : '#' + '.'.repeat(L.w - 2) + '#');
  return { key: 'd' + Date.now().toString(36), id: null, name: '', description: '', size, mirror: size === 'small', data: { w: L.w, h: L.h, rows, spawns: [null, null], sites: {}, theme: size === 'large' ? 'dustline' : 'vault' } };
}

// The definition used for testing and validation (the same conversion uploads go through).
export function draftDef(d, id = 'draft') {
  const def = toDef({ id: 0, name: d.name || 'Untitled map', description: d.description, size: d.size, data: d.data, author: 'you' });
  def.id = id;
  def.mirror = false;
  return def;
}

export class MapEditor {
  constructor(ui, draft, { onSave, onTest, onWalk, onUpload, onClose }) {
    this.ui = ui;
    this.d = draft;
    this.d.data = cleanData(draft.data, draft.size);
    this.grid = this.d.data.rows.map((r) => [...r]);
    this.ugrid = (this.d.data.up || this.d.data.rows.map((r) => '.'.repeat(r.length))).map((r) => [...r]);
    // The old ground-layer bridge becomes floor plus a bridge overhead.
    this.grid.forEach((row, y) => row.forEach((ch, x) => { if (ch === '=') { row[x] = '.'; this.ugrid[y][x] = '='; } }));
    this.layer = 'ground';
    this.brush = '#'; this.ubrush = '=';
    this.dir = 0;
    this.height = 2;
    this.tool = 'paint';
    this.view = 'both';
    this.undoStack = []; this.redoStack = [];
    this.cb = { onSave, onTest, onWalk, onUpload, onClose };
  }

  open() {
    const d = this.d, L = MAP_LIMITS[d.size];
    const el = document.createElement('div');
    el.className = 'ed';
    const palBtn = (ch, label) => {
      const shown = ch === 'ramp' ? '^' : ch === 'stairs' ? 'n' : ch;
      return `<button data-ch="${esc(ch)}" title="${esc(label)}"><i style="background:${cellColor(shown)}">${esc(cellLabel(shown))}</i><span>${esc(label)}</span></button>`;
    };
    el.innerHTML = `
      <header class="ed-top">
        <b class="ed-title">Map editor</b><span class="m-tagline">${d.size === 'large' ? 'Large map · bomb sites' : 'Small map'}</span>
        <input type="text" id="ed-name" maxlength="24" placeholder="Map name" value="${esc(d.name)}" aria-label="Map name">
        <span class="spacer"></span>
        <button class="btn small ghost" data-a="undo" title="Undo (Ctrl+Z)">Undo</button><button class="btn small ghost" data-a="redo" title="Redo (Ctrl+Y)">Redo</button>
        <button class="btn small" data-a="check">Check map</button><button class="btn small" data-a="walk" title="Walk around the map on your own, no bots">Walk the map</button><button class="btn small" data-a="test">Test vs bots</button>
        <button class="btn small primary" data-a="upload">${d.id ? 'Update upload' : 'Upload'}</button><button class="btn small ghost" data-a="close">Close</button>
      </header>
      <aside class="ed-side">
        <div class="m-label">Layer</div>
        <div class="seg ed-layers"><button data-layer="ground">Ground</button><button data-layer="upper">Overhead</button></div>
        <div class="seg ed-view" title="What to show"><button data-view="both">Both</button><button data-view="ground">Ground only</button><button data-view="upper">Overhead only</button></div>
        <div class="m-label">Tool</div>
        <div class="seg ed-tools">${[['paint', 'Paint'], ['rect', 'Box'], ['fill', 'Fill'], ['height', 'Height'], ['select', 'Select']].map(([k, l]) => `<button data-tool="${k}">${l}</button>`).join('')}</div>
        <div class="ed-height" hidden><label class="field"><span>Height: <b id="ed-hval"></b></span><input type="range" id="ed-hrange" min="0" max="8" step="1" value="${this.height * 2}"></label></div>
        <div class="ed-sel" hidden>
          <div class="ed-zones"><button class="btn small" data-c="copy">Copy</button><button class="btn small" data-c="cut">Cut</button><button class="btn small" data-c="paste">Paste</button><button class="btn small" data-c="clear">Clear</button>
          <button class="btn small" data-c="rotate">Rotate ↻</button><button class="btn small" data-c="flipx">Flip ↔</button><button class="btn small" data-c="flipy">Flip ↕</button></div>
          <p class="m-sub small">Drag to select. Ctrl+C / X / V, then R rotates, F flips (Shift+F vertically), click to place, Esc cancels.</p>
        </div>
        <div class="ed-dir" hidden><div class="m-label">Direction (R turns it)</div><div class="seg">${ARROWS.map((a, i) => `<button data-dir="${i}">${a}</button>`).join('')}</div></div>
        <div class="ed-pal ed-pal-ground">${PALETTE.map(([group, items]) => `<div class="m-label">${esc(group)}</div>${items.map(([ch, label]) => palBtn(ch, label)).join('')}`).join('')}</div>
        <div class="ed-pal ed-pal-upper" hidden><div class="m-label">Overhead</div>${UPPER_PALETTE.map(([ch, label]) => `<button data-uch="${esc(ch)}" title="${esc(label)}"><i style="background:${ch === '.' ? 'transparent' : upperColor(ch)}">${ch === '.' ? '×' : esc(ch)}</i><span>${esc(label)}</span></button>`).join('')}
          <p class="m-sub small">Overhead pieces sit above the ground, so a bridge can cross a lane with crates or barrels under it. Ramps and stairs can lead up onto them.</p></div>
        <div class="m-label">Zones (drag a rectangle)</div>
        <div class="ed-zones">${ZONES.filter(([k]) => d.size === 'large' || !k.startsWith('site')).map(([k, l]) => `<button class="btn small" data-zone="${k}">${l}</button>`).join('')}</div>
        ${d.size === 'large' ? '<p class="m-sub small">Each drag adds a piece to the bomb site, so sites can be any shape.</p><div class="ed-zones"><button class="btn small ghost" data-clear="A">Clear site A</button><button class="btn small ghost" data-clear="B">Clear site B</button></div>' : ''}
        <p class="m-sub small">Left mouse paints, right mouse erases. The outer border is always wall.</p>
      </aside>
      <main class="ed-main"><canvas id="ed-c"></canvas><div class="ed-hover" id="ed-hover"></div></main>
      <aside class="ed-props">
        <label class="field"><span>Description</span><textarea id="ed-desc" maxlength="120" rows="3">${esc(d.description)}</textarea></label>
        <label class="field"><span>Look (textures, sky and lighting)</span><select id="ed-theme">${THEMES.map(([id, n]) => `<option value="${id}" ${id === d.data.theme ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <div class="row"><label class="field"><span>Width</span><input type="number" id="ed-w" min="${L.minW}" max="${L.maxW}" value="${d.data.w}"></label>
          <label class="field"><span>Height</span><input type="number" id="ed-h" min="${L.minH}" max="${L.maxH}" value="${d.data.h}"></label></div>
        <label class="m-check"><input type="checkbox" id="ed-mirror" ${d.mirror ? 'checked' : ''}><span>Mirror painting (point-symmetric, fair for both sides)</span></label>
        <div class="ed-check" id="ed-check"><p class="m-sub">Check the map to see if it's ready to play, how long each side takes to get places, and anything that might make it one-sided.</p></div>
        <p class="m-sub small">Your work saves on this device as you go. Upload to share it: each account can upload ${MAX_UPLOADS} maps.</p>
      </aside>`;
    document.body.appendChild(el);
    this.el = el;
    this.canvas = el.querySelector('#ed-c');
    this.bind();
    this.setLayer('ground'); this.setTool('paint'); this.setBrush('#');
    this.resize();
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
  }

  close() {
    removeEventListener('resize', this.onResize);
    removeEventListener('keydown', this.onKey);
    this.el?.remove();
    this.cb.onClose?.();
  }

  // ───── state ─────
  commit() {
    this.d.data.rows = this.grid.map((r) => r.join(''));
    const up = this.ugrid.map((r) => r.join(''));
    if (up.some((r) => /[^.]/.test(r))) this.d.data.up = up; else delete this.d.data.up;
    this.d.name = this.el.querySelector('#ed-name').value.trim();
    this.d.description = this.el.querySelector('#ed-desc').value.trim();
    this.d.updated = Date.now();
    this.cb.onSave?.(this.d);
  }

  snapshot() { return JSON.stringify({ grid: this.grid, ugrid: this.ugrid, spawns: this.d.data.spawns, sites: this.d.data.sites }); }
  pushUndo() { this.undoStack.push(this.snapshot()); if (this.undoStack.length > 60) this.undoStack.shift(); this.redoStack = []; }
  restore(s) { const o = JSON.parse(s); this.grid = o.grid; this.ugrid = o.ugrid; this.d.data.spawns = o.spawns; this.d.data.sites = o.sites; this.commit(); this.draw(); }
  undo() { if (!this.undoStack.length) return; this.redoStack.push(this.snapshot()); this.restore(this.undoStack.pop()); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(this.snapshot()); this.restore(this.redoStack.pop()); }

  setLayer(l) {
    this.layer = l;
    this.el.querySelector('.ed-pal-ground').hidden = l !== 'ground';
    this.el.querySelector('.ed-pal-upper').hidden = l !== 'upper';
    if (l === 'upper' && this.tool === 'height') this.tool = 'paint';
    this.refreshButtons(); this.draw();
  }
  setTool(t) { this.tool = t; this.zone = null; this.sel = t === 'select' ? this.sel : null; this.paste = null; this.refreshButtons(); this.draw(); }
  setBrush(ch) {
    this.brush = ch; this.zone = null; this.paste = null;
    if (!['rect', 'fill'].includes(this.tool)) this.tool = 'paint';
    this.refreshButtons();
  }
  // The ground character the brush paints (ramps and stairs carry the chosen direction).
  groundChar() {
    if (this.tool === 'height') return this.height === 0 ? '.' : String(Math.round(this.height * 2));
    if (this.brush === 'ramp') return ['^', '>', 'v', '<'][this.dir];
    if (this.brush === 'stairs') return ['n', 'e', 's', 'w'][this.dir];
    return this.brush;
  }
  refreshButtons() {
    const e = this.el;
    e.querySelectorAll('[data-layer]').forEach((b) => b.classList.toggle('sel', b.dataset.layer === this.layer));
    e.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('sel', b.dataset.view === this.view));
    e.querySelectorAll('[data-tool]').forEach((b) => { b.classList.toggle('sel', !this.zone && b.dataset.tool === this.tool); b.disabled = b.dataset.tool === 'height' && this.layer === 'upper'; });
    e.querySelectorAll('[data-ch]').forEach((b) => b.classList.toggle('sel', !this.zone && this.tool !== 'height' && this.tool !== 'select' && b.dataset.ch === this.brush));
    e.querySelectorAll('[data-uch]').forEach((b) => b.classList.toggle('sel', !this.zone && this.tool !== 'select' && b.dataset.uch === this.ubrush));
    e.querySelectorAll('[data-zone]').forEach((b) => b.classList.toggle('primary', this.zone === b.dataset.zone));
    e.querySelectorAll('[data-dir]').forEach((b) => b.classList.toggle('sel', +b.dataset.dir === this.dir));
    e.querySelector('.ed-dir').hidden = !(this.layer === 'ground' && (this.brush === 'ramp' || this.brush === 'stairs') && this.tool !== 'height' && this.tool !== 'select');
    e.querySelector('.ed-height').hidden = this.tool !== 'height';
    e.querySelector('.ed-sel').hidden = this.tool !== 'select';
    e.querySelector('#ed-hval').textContent = this.height === 0 ? 'floor' : `${this.height} m`;
  }

  inside(x, y) { const { w, h } = this.d.data; return x > 0 && y > 0 && x < w - 1 && y < h - 1; }
  mirrorOn() { return this.el.querySelector('#ed-mirror').checked; }

  // Sets one cell on a layer (and its mirror image when mirroring is on).
  put(x, y, ch, layer = this.layer) {
    const { w, h } = this.d.data, g = layer === 'upper' ? this.ugrid : this.grid;
    if (this.inside(x, y)) g[y][x] = ch;
    if (this.mirrorOn()) { const mx = w - 1 - x, my = h - 1 - y; if (this.inside(mx, my)) g[my][mx] = turnChar(ch, 2); }
  }
  erase(x, y) { this.put(x, y, '.'); }

  fill(x, y, ch) {
    const g = this.layer === 'upper' ? this.ugrid : this.grid, from = g[y]?.[x];
    if (from === undefined || from === ch || !this.inside(x, y)) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (!this.inside(cx, cy) || g[cy][cx] !== from) continue;
      this.put(cx, cy, ch);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  paintChar() { return this.layer === 'upper' ? this.ubrush : this.groundChar(); }

  setZone(zone, r) {
    const { w, h } = this.d.data, rr = [Math.max(1, Math.min(r[0], r[2])), Math.max(1, Math.min(r[1], r[3])), Math.min(w - 2, Math.max(r[0], r[2])), Math.min(h - 2, Math.max(r[1], r[3]))];
    const mirrored = [w - 1 - rr[2], h - 1 - rr[3], w - 1 - rr[0], h - 1 - rr[1]];
    const mirror = this.mirrorOn();
    if (zone === 'spawn0') { this.d.data.spawns[0] = rr; if (mirror) this.d.data.spawns[1] = mirrored; }
    else if (zone === 'spawn1') { this.d.data.spawns[1] = rr; if (mirror) this.d.data.spawns[0] = mirrored; }
    else {
      // Sites are built from pieces: each drag adds one.
      const k = zone.slice(4), cur = this.d.data.sites[k];
      const list = !cur ? [] : Array.isArray(cur[0]) ? cur : [cur];
      this.d.data.sites[k] = [...list, rr].slice(-24);
    }
  }

  // ───── selection, clipboard, rotate and flip ─────
  selRect() { const s = this.sel; return s && [Math.min(s.x0, s.x1), Math.min(s.y0, s.y1), Math.max(s.x0, s.x1), Math.max(s.y0, s.y1)]; }
  copy(cut = false) {
    const r = this.selRect();
    if (!r) { this.ui.toast('Drag a selection first'); return; }
    const [x0, y0, x1, y1] = r, g = [], u = [];
    for (let y = y0; y <= y1; y++) { g.push(this.grid[y].slice(x0, x1 + 1)); u.push(this.ugrid[y].slice(x0, x1 + 1)); }
    this.clip = { w: x1 - x0 + 1, h: y1 - y0 + 1, g, u };
    if (cut) { this.pushUndo(); this.clearSel(false); }
    this.ui.toast(`${cut ? 'Cut' : 'Copied'} ${this.clip.w} × ${this.clip.h}`);
  }
  clearSel(undo = true) {
    const r = this.selRect();
    if (!r) return;
    if (undo) this.pushUndo();
    for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) if (this.inside(x, y)) { this.grid[y][x] = '.'; this.ugrid[y][x] = '.'; }
    this.commit(); this.draw();
  }
  startPaste() {
    if (!this.clip) { this.ui.toast('Copy something first (select, then Ctrl+C)'); return; }
    this.tool = 'select'; this.paste = { x: this.hoverX ?? 1, y: this.hoverY ?? 1 };
    this.refreshButtons(); this.draw();
  }
  // Rotates (clockwise) or flips the clipboard, or the selected area in place when not pasting.
  transform(kind) {
    const src = this.clip && this.paste ? this.clip : null;
    const turn = (c) => {
      const out = { w: c.w, h: c.h, g: [], u: [] };
      if (kind === 'rotate') { out.w = c.h; out.h = c.w; }
      for (let y = 0; y < out.h; y++) { out.g.push([]); out.u.push([]); }
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
        let nx = x, ny = y, ch = c.g[y][x];
        if (kind === 'rotate') { nx = c.h - 1 - y; ny = x; ch = turnChar(ch, 1); }
        else if (kind === 'flipx') { nx = c.w - 1 - x; ch = flipChar(ch, 'x'); }
        else { ny = c.h - 1 - y; ch = flipChar(ch, 'y'); }
        out.g[ny][nx] = ch; out.u[ny][nx] = c.u[y][x];
      }
      return out;
    };
    if (src) { this.clip = turn(src); this.draw(); return; }
    const r = this.selRect();
    if (!r) { this.ui.toast('Select an area or copy one first'); return; }
    // In place: copy the selection, transform it, and stamp it back at the same corner.
    const prevClip = this.clip;
    this.copy(false);
    const t = turn(this.clip);
    this.pushUndo();
    for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) if (this.inside(x, y)) { this.grid[y][x] = '.'; this.ugrid[y][x] = '.'; }
    this.stamp(t, r[0], r[1]);
    this.sel = { x0: r[0], y0: r[1], x1: r[0] + t.w - 1, y1: r[1] + t.h - 1 };
    this.clip = prevClip;
    this.commit(); this.draw();
  }
  stamp(c, x0, y0) {
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
      const tx = x0 + x, ty = y0 + y;
      if (!this.inside(tx, ty)) continue;
      this.grid[ty][tx] = c.g[y][x];
      this.ugrid[ty][tx] = c.u[y][x];
    }
  }

  resizeGrid(w, h) {
    const L = MAP_LIMITS[this.d.size];
    w = Math.max(L.minW, Math.min(L.maxW, w | 0)); h = Math.max(L.minH, Math.min(L.maxH, h | 0));
    this.pushUndo();
    // Keep what's inside the old border; new space (and the old border, if it's now inside) becomes floor.
    const ow = this.d.data.w, oh = this.d.data.h, rows = [], up = [];
    for (let y = 0; y < h; y++) {
      let row = '', urow = '';
      for (let x = 0; x < w; x++) {
        const keep = x < ow - 1 && y < oh - 1;
        row += x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : keep ? this.grid[y][x] : '.';
        urow += keep ? this.ugrid[y][x] : '.';
      }
      rows.push(row); up.push(urow);
    }
    this.d.data = cleanData({ ...this.d.data, w, h, rows, up }, this.d.size);
    this.grid = this.d.data.rows.map((r) => [...r]);
    this.ugrid = (this.d.data.up || rows.map((r) => '.'.repeat(r.length))).map((r) => [...r]);
    this.commit();
    this.resize();
  }

  // ───── drawing ─────
  resize() {
    const main = this.el.querySelector('.ed-main'), { w, h } = this.d.data;
    this.cs = Math.max(8, Math.floor(Math.min((main.clientWidth - 24) / w, (main.clientHeight - 24) / h)));
    this.canvas.width = w * this.cs; this.canvas.height = h * this.cs;
    this.draw();
  }

  draw() {
    if (!this.canvas) return;
    const g = this.canvas.getContext('2d'), s = this.cs, { w, h, spawns, sites } = this.d.data;
    const showGround = this.view !== 'upper', showUpper = this.view !== 'ground';
    const text = (t, x, y, color = 'rgba(0,0,0,.6)') => { g.fillStyle = color; g.font = `bold ${Math.floor(s * 0.6)}px Rajdhani, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x * s + s / 2, y * s + s / 2 + 1); };
    g.clearRect(0, 0, w * s, h * s);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = this.grid[y][x], u = this.ugrid[y][x];
      g.fillStyle = showGround ? cellColor(ch) : '#20242b';
      g.fillRect(x * s, y * s, s, s);
      if (showGround && s >= 12 && cellLabel(ch)) text(cellLabel(ch), x, y);
      if (showUpper && u !== '.') {
        // Overhead pieces: see-through when both layers show, so what's under them stays visible.
        g.fillStyle = upperColor(u);
        g.globalAlpha = this.view === 'both' && this.layer === 'ground' ? 0.55 : 1;
        g.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
        g.globalAlpha = 1;
        if (s >= 12) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.strokeRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3); if (this.layer === 'upper' || this.view === 'upper') text(u, x, y, 'rgba(0,0,0,.7)'); }
      }
    }
    if (this.layer === 'upper' && this.view === 'both') { g.fillStyle = 'rgba(10,12,16,.25)'; g.fillRect(0, 0, w * s, h * s); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = this.ugrid[y][x]; if (u !== '.') { g.fillStyle = upperColor(u); g.fillRect(x * s + 1, y * s + 1, s - 2, s - 2); if (s >= 12) text(u, x, y, 'rgba(0,0,0,.7)'); } } }
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
    for (let x = 0; x <= w; x++) { g.beginPath(); g.moveTo(x * s + 0.5, 0); g.lineTo(x * s + 0.5, h * s); g.stroke(); }
    for (let y = 0; y <= h; y++) { g.beginPath(); g.moveTo(0, y * s + 0.5); g.lineTo(w * s, y * s + 0.5); g.stroke(); }
    const zone = (r, fill, stroke, label) => {
      if (!r) return;
      const [x0, y0, x1, y1] = r;
      g.fillStyle = fill; g.fillRect(x0 * s, y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
      g.strokeStyle = stroke; g.lineWidth = 2; g.strokeRect(x0 * s + 1, y0 * s + 1, (x1 - x0 + 1) * s - 2, (y1 - y0 + 1) * s - 2);
      if (label) { g.fillStyle = stroke; g.font = `bold ${Math.max(11, s * 0.8)}px Rajdhani, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, ((x0 + x1 + 1) / 2) * s, ((y0 + y1 + 1) / 2) * s); }
    };
    zone(spawns[0], 'rgba(232,131,58,.28)', '#e8833a', 'ATK');
    zone(spawns[1], 'rgba(78,163,255,.28)', '#4ea3ff', 'DEF');
    for (const k of ['A', 'B']) {
      const r = sites?.[k];
      if (!r) continue;
      const list = Array.isArray(r[0]) ? r : [r];
      list.forEach((q, i) => zone(q, 'rgba(255,90,90,.22)', '#ff6b6b', i === 0 ? k : ''));
    }
    const dash = (r, color) => {
      const [x0, y0, x1, y1] = r;
      g.strokeStyle = color; g.lineWidth = 2; g.setLineDash([5, 4]);
      g.strokeRect(x0 * s + 1, y0 * s + 1, (x1 - x0 + 1) * s - 2, (y1 - y0 + 1) * s - 2);
      g.setLineDash([]);
    };
    if (this.drag && (this.tool === 'rect' || this.zone || this.tool === 'select')) dash([Math.min(this.drag.x0, this.drag.x1), Math.min(this.drag.y0, this.drag.y1), Math.max(this.drag.x0, this.drag.x1), Math.max(this.drag.y0, this.drag.y1)], '#ffd23f');
    else if (this.sel && this.tool === 'select' && !this.paste) dash(this.selRect(), '#7fd1ff');
    if (this.paste && this.clip) {
      const c = this.clip;
      g.globalAlpha = 0.75;
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
        const tx = this.paste.x + x, ty = this.paste.y + y;
        if (!this.inside(tx, ty)) continue;
        g.fillStyle = cellColor(c.g[y][x]); g.fillRect(tx * s, ty * s, s, s);
        if (c.u[y][x] !== '.') { g.fillStyle = upperColor(c.u[y][x]); g.fillRect(tx * s + 1, ty * s + 1, s - 2, s - 2); }
      }
      g.globalAlpha = 1;
      dash([this.paste.x, this.paste.y, this.paste.x + c.w - 1, this.paste.y + c.h - 1], '#7fd1ff');
    }
  }

  // ───── input ─────
  cellAt(e) {
    const r = this.canvas.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * this.d.data.w), Math.floor(((e.clientY - r.top) / r.height) * this.d.data.h)];
  }

  bind() {
    const el = this.el, c = this.canvas;
    el.querySelectorAll('[data-layer]').forEach((b) => { b.onclick = () => this.setLayer(b.dataset.layer); });
    el.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => { this.view = b.dataset.view; this.refreshButtons(); this.draw(); }; });
    el.querySelectorAll('[data-tool]').forEach((b) => { b.onclick = () => this.setTool(b.dataset.tool); });
    el.querySelectorAll('[data-ch]').forEach((b) => { b.onclick = () => { if (this.tool === 'height' || this.tool === 'select') this.tool = 'paint'; this.setBrush(b.dataset.ch); }; });
    el.querySelectorAll('[data-uch]').forEach((b) => { b.onclick = () => { this.ubrush = b.dataset.uch; this.zone = null; if (!['rect', 'fill'].includes(this.tool)) this.tool = 'paint'; this.refreshButtons(); }; });
    el.querySelectorAll('[data-dir]').forEach((b) => { b.onclick = () => { this.dir = +b.dataset.dir; this.refreshButtons(); }; });
    el.querySelectorAll('[data-zone]').forEach((b) => { b.onclick = () => { this.zone = this.zone === b.dataset.zone ? null : b.dataset.zone; this.paste = null; this.refreshButtons(); }; });
    el.querySelectorAll('[data-clear]').forEach((b) => { b.onclick = () => { this.pushUndo(); this.d.data.sites[b.dataset.clear] = null; this.commit(); this.draw(); }; });
    el.querySelector('#ed-hrange').oninput = (e) => { this.height = +e.target.value / 2; this.refreshButtons(); };
    const clipAct = { copy: () => this.copy(false), cut: () => this.copy(true), paste: () => this.startPaste(), clear: () => this.clearSel(), rotate: () => this.transform('rotate'), flipx: () => this.transform('flipx'), flipy: () => this.transform('flipy') };
    el.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => clipAct[b.dataset.c](); });
    c.oncontextmenu = (e) => e.preventDefault();
    c.onpointerdown = (e) => {
      const [x, y] = this.cellAt(e);
      c.setPointerCapture(e.pointerId);
      if (this.paste && this.clip) {
        if (e.button === 2) { this.paste = null; this.draw(); return; }
        this.pushUndo(); this.stamp(this.clip, this.paste.x, this.paste.y); this.commit(); this.draw();
        return;
      }
      if (this.tool === 'select' && !this.zone) { this.drag = { x0: x, y0: y, x1: x, y1: y }; this.draw(); return; }
      this.pushUndo();
      const ch = e.button === 2 ? '.' : this.paintChar();
      if (this.zone || this.tool === 'rect') this.drag = { x0: x, y0: y, x1: x, y1: y, ch };
      else if (this.tool === 'fill') { this.fill(x, y, ch); this.commit(); }
      else { this.painting = ch; this.put(x, y, ch); }
      this.draw();
    };
    c.onpointermove = (e) => {
      const [x, y] = this.cellAt(e);
      this.hoverX = x; this.hoverY = y;
      const ch = this.grid[y]?.[x], u = this.ugrid[y]?.[x];
      el.querySelector('#ed-hover').textContent = ch === undefined ? '' : `${x}, ${y} · ${cellName(ch)}${u && u !== '.' ? ` · overhead: ${UP_NAMES[u]}` : ''}`;
      if (this.paste) { this.paste.x = x; this.paste.y = y; this.draw(); }
      else if (this.drag) { this.drag.x1 = x; this.drag.y1 = y; this.draw(); }
      else if (this.painting) { this.put(x, y, this.painting); this.draw(); }
    };
    c.onpointerup = () => {
      if (this.drag) {
        const r = [this.drag.x0, this.drag.y0, this.drag.x1, this.drag.y1];
        if (this.tool === 'select' && !this.zone) this.sel = { ...this.drag };
        else if (this.zone) this.setZone(this.zone, r);
        else for (let y = Math.min(r[1], r[3]); y <= Math.max(r[1], r[3]); y++) for (let x = Math.min(r[0], r[2]); x <= Math.max(r[0], r[2]); x++) this.put(x, y, this.drag.ch);
        this.drag = null;
      }
      this.painting = null;
      this.commit();
      this.draw();
    };
    this.onKey = (e) => {
      if (e.target.matches?.('input, textarea, select')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); }
      else if (mod && e.code === 'KeyY') { e.preventDefault(); this.redo(); }
      else if (mod && e.code === 'KeyC') { e.preventDefault(); this.copy(false); }
      else if (mod && e.code === 'KeyX') { e.preventDefault(); this.copy(true); }
      else if (mod && e.code === 'KeyV') { e.preventDefault(); this.startPaste(); }
      else if (e.code === 'Escape') { this.paste = null; this.sel = null; this.drag = null; this.draw(); }
      else if ((e.code === 'Delete' || e.code === 'Backspace') && this.sel && this.tool === 'select') { e.preventDefault(); this.clearSel(); }
      else if (e.code === 'KeyR' && !mod) {
        if (this.paste || (this.tool === 'select' && this.sel)) this.transform('rotate');
        else { this.dir = (this.dir + 1) % 4; this.refreshButtons(); }
      } else if (e.code === 'KeyF' && !mod && (this.paste || (this.tool === 'select' && this.sel))) this.transform(e.shiftKey ? 'flipy' : 'flipx');
    };
    addEventListener('keydown', this.onKey);
    el.querySelector('#ed-name').oninput = () => this.commit();
    el.querySelector('#ed-desc').oninput = () => this.commit();
    el.querySelector('#ed-theme').onchange = (e) => { this.d.data.theme = e.target.value; this.commit(); };
    el.querySelector('#ed-mirror').onchange = (e) => { this.d.mirror = e.target.checked; this.commit(); };
    el.querySelector('#ed-w').onchange = (e) => this.resizeGrid(+e.target.value, this.d.data.h);
    el.querySelector('#ed-h').onchange = (e) => this.resizeGrid(this.d.data.w, +e.target.value);
    const act = {
      undo: () => this.undo(), redo: () => this.redo(), close: () => this.close(),
      check: () => this.check(),
      walk: () => { if (this.check(true)) { this.commit(); this.cb.onWalk?.(this.d, this); } },
      test: () => { if (this.check(true)) { this.commit(); this.cb.onTest?.(this.d, this); } },
      upload: () => { if (this.check()) { this.commit(); this.cb.onUpload?.(this.d, this); } },
    };
    el.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => act[b.dataset.a](); });
  }

  // Runs the checks and shows the result. `forTest` allows testing an unnamed map. Warnings (balance)
  // are shown but never block.
  check(forTest = false) {
    this.commit();
    const problems = [];
    const name = this.d.name;
    if (!forTest) {
      if (!/^[A-Za-z0-9 _'-]{3,24}$/.test(name)) problems.push('Give the map a name: 3-24 letters, numbers, spaces, - or _.');
      else if (censor(name) !== name || censor(this.d.description) !== this.d.description) problems.push('The name or description contains a blocked word.');
    }
    let report = { times: [], warnings: [] };
    try {
      const def = draftDef(this.d);
      problems.push(...validateMap(def));
      if (!problems.length || forTest) report = mapReport(def);
    } catch (e) { problems.push(e.message); }
    const box = this.el.querySelector('#ed-check');
    const list = (items) => `<ul>${items.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
    box.innerHTML = (problems.length ? `<p class="err">Not ready yet:</p>${list(problems)}` : '<p class="ok">✓ Ready to play: spawns are hidden from each other and everything is reachable.</p>')
      + (report.times.length ? `<p class="m-label">Walking times</p>${list(report.times)}` : '')
      + (report.warnings.length ? `<p class="warn">Worth a look (won't stop an upload):</p>${list(report.warnings)}` : report.times.length ? '<p class="ok small">✓ No balance warnings.</p>' : '');
    return problems.length === 0;
  }
}

// Exposed for the workshop list: the cell colours as a small preview image.
export function previewCanvas(data, scale = 4) {
  const c = document.createElement('canvas');
  c.width = data.w * scale; c.height = data.h * scale;
  const g = c.getContext('2d');
  data.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { g.fillStyle = cellColor(row[x]); g.fillRect(x * scale, y * scale, scale, scale); } });
  (data.up || []).forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.' && UPPER[row[x]]) { g.fillStyle = upperColor(row[x]); g.fillRect(x * scale, y * scale, scale, scale); } });
  for (const [i, r] of (data.spawns || []).entries()) if (r) { g.fillStyle = i ? 'rgba(78,163,255,.6)' : 'rgba(232,131,58,.6)'; g.fillRect(r[0] * scale, r[1] * scale, (r[2] - r[0] + 1) * scale, (r[3] - r[1] + 1) * scale); }
  return c;
}
