// Map editor: a full-screen grid painter. Maps are grids of 2 m cells (see js/data/maps.js); the
// editor paints cells, places the two spawn zones and (on large maps) bomb sites A and B, checks the
// map with validateMap, and can test it against bots or upload it (js/ui/workshop.js lists them).
import { MAP_LIMITS, MAX_UPLOADS, THEMES, cleanData, toDef, validateMap } from '../data/custommaps.js';
import { isPlatform, platformH } from '../engine/grid.js';
import { censor } from '../data/profanity.js';
import { esc } from './social.js';

export const PALETTE = [
  ['.', 'Floor'], ['#', 'Wall'], ['X', 'Wall, second texture'], ['h', 'Half wall (cover)'],
  ['c', 'Crate, 1 m'], ['C', 'Tall crate, 2 m'], ['M', 'Shipping container'],
  ['1', 'Platform 0.5 m'], ['2', 'Platform 1 m'], ['3', 'Platform 1.5 m'], ['4', 'Platform 2 m'],
  ['5', 'Catwalk 2.5 m'], ['6', 'Catwalk 3 m'], ['7', 'Catwalk 3.5 m'], ['8', 'Catwalk 4 m'],
  ['L', 'Ladder (floor next to a catwalk)'], ['D', 'Sliding door'], ['G', 'Glass pane'], ['B', 'Explosive barrels'],
  ['A', 'Ammo crate'], ['W', 'Wooden barricade'], ['k', 'Wooden crate'],
];
const ZONES = [['spawn0', 'Attackers spawn'], ['spawn1', 'Defenders spawn'], ['siteA', 'Bomb site A'], ['siteB', 'Bomb site B']];

// Same colours as the radar, so the editor looks like the in-game minimap.
export function cellColor(ch) {
  if (ch === '#' || ch === 'X') return ch === 'X' ? '#2a2f37' : '#1b1f25';
  if ('hcCMBA'.includes(ch)) return { h: '#5b636e', c: '#7a6a4f', C: '#8c7656', M: '#a8432f', B: '#c0392b', A: '#41502e' }[ch];
  if (ch === 'W' || ch === 'k') return '#7a5a36';
  if (ch === 'D') return '#8a6a3a';
  if (ch === 'G') return '#5f8fb0';
  if (ch === 'L') return '#9aa3ad';
  if (isPlatform(ch)) { const h = platformH(ch); return `rgb(${140 + h * 18},${150 + h * 16},${165 + h * 14})`; }
  return '#7c8591';
}

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
  return def;
}

export class MapEditor {
  constructor(ui, draft, { onSave, onTest, onUpload, onClose }) {
    this.ui = ui;
    this.d = draft;
    this.d.data = cleanData(draft.data, draft.size);
    this.grid = this.d.data.rows.map((r) => [...r]);
    this.brush = '#';
    this.tool = 'paint';
    this.undoStack = []; this.redoStack = [];
    this.cb = { onSave, onTest, onUpload, onClose };
  }

  open() {
    const d = this.d, L = MAP_LIMITS[d.size];
    const el = document.createElement('div');
    el.className = 'ed';
    el.innerHTML = `
      <header class="ed-top">
        <b class="ed-title">Map editor</b><span class="m-tagline">${d.size === 'large' ? 'Large map · bomb sites' : 'Small map'}</span>
        <input type="text" id="ed-name" maxlength="24" placeholder="Map name" value="${esc(d.name)}" aria-label="Map name">
        <span class="spacer"></span>
        <button class="btn small ghost" data-a="undo" title="Undo (Ctrl+Z)">Undo</button><button class="btn small ghost" data-a="redo" title="Redo (Ctrl+Y)">Redo</button>
        <button class="btn small" data-a="check">Check map</button><button class="btn small" data-a="test">Test vs bots</button>
        <button class="btn small primary" data-a="upload">${d.id ? 'Update upload' : 'Upload'}</button><button class="btn small ghost" data-a="close">Close</button>
      </header>
      <aside class="ed-side">
        <div class="m-label">Tool</div>
        <div class="seg ed-tools">${[['paint', 'Paint'], ['rect', 'Rectangle'], ['fill', 'Fill']].map(([k, l]) => `<button data-tool="${k}">${l}</button>`).join('')}</div>
        <div class="m-label">Cells</div>
        <div class="ed-pal">${PALETTE.map(([ch, label]) => `<button data-ch="${esc(ch)}" title="${esc(label)}"><i style="background:${cellColor(ch)}">${isPlatform(ch) ? ch : ch === 'L' ? '☰' : ''}</i><span>${esc(label)}</span></button>`).join('')}</div>
        <div class="m-label">Zones (drag a rectangle)</div>
        <div class="ed-zones">${ZONES.filter(([k]) => d.size === 'large' || !k.startsWith('site')).map(([k, l]) => `<button class="btn small" data-zone="${k}">${l}</button>`).join('')}</div>
        <p class="m-sub small">Left mouse paints, right mouse paints floor. The outer border is always wall.</p>
      </aside>
      <main class="ed-main"><canvas id="ed-c"></canvas><div class="ed-hover" id="ed-hover"></div></main>
      <aside class="ed-props">
        <label class="field"><span>Description</span><textarea id="ed-desc" maxlength="120" rows="3">${esc(d.description)}</textarea></label>
        <label class="field"><span>Look (textures, sky and lighting)</span><select id="ed-theme">${THEMES.map(([id, n]) => `<option value="${id}" ${id === d.data.theme ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <div class="row"><label class="field"><span>Width</span><input type="number" id="ed-w" min="${L.minW}" max="${L.maxW}" value="${d.data.w}"></label>
          <label class="field"><span>Height</span><input type="number" id="ed-h" min="${L.minH}" max="${L.maxH}" value="${d.data.h}"></label></div>
        <label class="m-check"><input type="checkbox" id="ed-mirror" ${d.mirror ? 'checked' : ''}><span>Mirror painting (point-symmetric, fair for both sides)</span></label>
        <div class="ed-check" id="ed-check"><p class="m-sub">Check the map to see if it's ready to play.</p></div>
        <p class="m-sub small">Your work saves on this device as you go. Upload to share it: each account can upload ${MAX_UPLOADS} maps.</p>
      </aside>`;
    document.body.appendChild(el);
    this.el = el;
    this.canvas = el.querySelector('#ed-c');
    this.bind();
    this.setTool('paint'); this.setBrush('#');
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
    this.d.name = this.el.querySelector('#ed-name').value.trim();
    this.d.description = this.el.querySelector('#ed-desc').value.trim();
    this.d.updated = Date.now();
    this.cb.onSave?.(this.d);
  }

  snapshot() { return JSON.stringify({ grid: this.grid, spawns: this.d.data.spawns, sites: this.d.data.sites }); }
  pushUndo() { this.undoStack.push(this.snapshot()); if (this.undoStack.length > 60) this.undoStack.shift(); this.redoStack = []; }
  restore(s) { const o = JSON.parse(s); this.grid = o.grid; this.d.data.spawns = o.spawns; this.d.data.sites = o.sites; this.commit(); this.draw(); }
  undo() { if (!this.undoStack.length) return; this.redoStack.push(this.snapshot()); this.restore(this.undoStack.pop()); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(this.snapshot()); this.restore(this.redoStack.pop()); }

  setTool(t) { this.tool = t; this.zone = null; this.refreshButtons(); }
  setBrush(ch) { this.brush = ch; if (this.zone) this.zone = null; if (this.tool !== 'rect' && this.tool !== 'fill') this.tool = 'paint'; this.refreshButtons(); }
  refreshButtons() {
    this.el.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('sel', !this.zone && b.dataset.tool === this.tool));
    this.el.querySelectorAll('[data-ch]').forEach((b) => b.classList.toggle('sel', !this.zone && b.dataset.ch === this.brush));
    this.el.querySelectorAll('[data-zone]').forEach((b) => b.classList.toggle('primary', this.zone === b.dataset.zone));
  }

  inside(x, y) { const { w, h } = this.d.data; return x > 0 && y > 0 && x < w - 1 && y < h - 1; }

  // Sets one cell (and its mirror image when mirroring is on).
  put(x, y, ch) {
    const { w, h } = this.d.data;
    if (this.inside(x, y)) this.grid[y][x] = ch;
    if (this.el.querySelector('#ed-mirror').checked) { const mx = w - 1 - x, my = h - 1 - y; if (this.inside(mx, my)) this.grid[my][mx] = ch; }
  }

  fill(x, y, ch) {
    const from = this.grid[y]?.[x];
    if (from === undefined || from === ch || !this.inside(x, y)) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (!this.inside(cx, cy) || this.grid[cy][cx] !== from) continue;
      this.put(cx, cy, ch);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  setZone(zone, r) {
    const { w, h } = this.d.data, rr = [Math.max(1, Math.min(r[0], r[2])), Math.max(1, Math.min(r[1], r[3])), Math.min(w - 2, Math.max(r[0], r[2])), Math.min(h - 2, Math.max(r[1], r[3]))];
    const mirrored = [w - 1 - rr[2], h - 1 - rr[3], w - 1 - rr[0], h - 1 - rr[1]];
    const mirror = this.el.querySelector('#ed-mirror').checked;
    if (zone === 'spawn0') { this.d.data.spawns[0] = rr; if (mirror) this.d.data.spawns[1] = mirrored; }
    else if (zone === 'spawn1') { this.d.data.spawns[1] = rr; if (mirror) this.d.data.spawns[0] = mirrored; }
    else this.d.data.sites[zone.slice(4)] = rr;
  }

  resizeGrid(w, h) {
    const L = MAP_LIMITS[this.d.size];
    w = Math.max(L.minW, Math.min(L.maxW, w | 0)); h = Math.max(L.minH, Math.min(L.maxH, h | 0));
    this.pushUndo();
    // Keep what's inside the old border; new space (and the old border, if it's now inside) becomes floor.
    const ow = this.d.data.w, oh = this.d.data.h, rows = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) row += x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : x < ow - 1 && y < oh - 1 ? this.grid[y][x] : '.';
      rows.push(row);
    }
    this.d.data = cleanData({ ...this.d.data, w, h, rows }, this.d.size);
    this.grid = this.d.data.rows.map((r) => [...r]);
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
    const g = this.canvas.getContext('2d'), s = this.cs, { w, h, spawns, sites } = this.d.data;
    g.clearRect(0, 0, w * s, h * s);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = this.grid[y][x];
      g.fillStyle = cellColor(ch);
      g.fillRect(x * s, y * s, s, s);
      if (s >= 12 && (isPlatform(ch) || 'LDGBAWk'.includes(ch))) {
        g.fillStyle = 'rgba(0,0,0,.55)'; g.font = `bold ${Math.floor(s * 0.6)}px Rajdhani, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(ch === 'L' ? '☰' : ch, x * s + s / 2, y * s + s / 2 + 1);
      }
    }
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
    for (let x = 0; x <= w; x++) { g.beginPath(); g.moveTo(x * s + 0.5, 0); g.lineTo(x * s + 0.5, h * s); g.stroke(); }
    for (let y = 0; y <= h; y++) { g.beginPath(); g.moveTo(0, y * s + 0.5); g.lineTo(w * s, y * s + 0.5); g.stroke(); }
    const zone = (r, fill, stroke, label) => {
      if (!r) return;
      const [x0, y0, x1, y1] = r;
      g.fillStyle = fill; g.fillRect(x0 * s, y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
      g.strokeStyle = stroke; g.lineWidth = 2; g.strokeRect(x0 * s + 1, y0 * s + 1, (x1 - x0 + 1) * s - 2, (y1 - y0 + 1) * s - 2);
      g.fillStyle = stroke; g.font = `bold ${Math.max(11, s * 0.8)}px Rajdhani, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, ((x0 + x1 + 1) / 2) * s, ((y0 + y1 + 1) / 2) * s);
    };
    zone(spawns[0], 'rgba(232,131,58,.28)', '#e8833a', 'ATK');
    zone(spawns[1], 'rgba(78,163,255,.28)', '#4ea3ff', 'DEF');
    for (const k of ['A', 'B']) zone(sites?.[k], 'rgba(255,90,90,.22)', '#ff6b6b', k);
    if (this.drag && (this.tool === 'rect' || this.zone)) {
      const [x0, y0, x1, y1] = [Math.min(this.drag.x0, this.drag.x1), Math.min(this.drag.y0, this.drag.y1), Math.max(this.drag.x0, this.drag.x1), Math.max(this.drag.y0, this.drag.y1)];
      g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.setLineDash([5, 4]);
      g.strokeRect(x0 * s + 1, y0 * s + 1, (x1 - x0 + 1) * s - 2, (y1 - y0 + 1) * s - 2);
      g.setLineDash([]);
    }
  }

  // ───── input ─────
  cellAt(e) {
    const r = this.canvas.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * this.d.data.w), Math.floor(((e.clientY - r.top) / r.height) * this.d.data.h)];
  }

  bind() {
    const el = this.el, c = this.canvas;
    el.querySelectorAll('[data-tool]').forEach((b) => { b.onclick = () => this.setTool(b.dataset.tool); });
    el.querySelectorAll('[data-ch]').forEach((b) => { b.onclick = () => this.setBrush(b.dataset.ch); });
    el.querySelectorAll('[data-zone]').forEach((b) => { b.onclick = () => { this.zone = this.zone === b.dataset.zone ? null : b.dataset.zone; this.refreshButtons(); }; });
    c.oncontextmenu = (e) => e.preventDefault();
    c.onpointerdown = (e) => {
      const [x, y] = this.cellAt(e);
      c.setPointerCapture(e.pointerId);
      this.pushUndo();
      const ch = e.button === 2 ? '.' : this.brush;
      if (this.zone || this.tool === 'rect') this.drag = { x0: x, y0: y, x1: x, y1: y, ch };
      else if (this.tool === 'fill') { this.fill(x, y, ch); this.commit(); }
      else { this.painting = ch; this.put(x, y, ch); }
      this.draw();
    };
    c.onpointermove = (e) => {
      const [x, y] = this.cellAt(e);
      const ch = this.grid[y]?.[x];
      el.querySelector('#ed-hover').textContent = ch === undefined ? '' : `${x}, ${y} · ${PALETTE.find(([k]) => k === ch)?.[1] || ''}`;
      if (this.drag) { this.drag.x1 = x; this.drag.y1 = y; this.draw(); }
      else if (this.painting) { this.put(x, y, this.painting); this.draw(); }
    };
    c.onpointerup = () => {
      if (this.drag) {
        const r = [this.drag.x0, this.drag.y0, this.drag.x1, this.drag.y1];
        if (this.zone) this.setZone(this.zone, r);
        else for (let y = Math.min(r[1], r[3]); y <= Math.max(r[1], r[3]); y++) for (let x = Math.min(r[0], r[2]); x <= Math.max(r[0], r[2]); x++) this.put(x, y, this.drag.ch);
        this.drag = null;
      }
      this.painting = null;
      this.commit();
      this.draw();
    };
    this.onKey = (e) => {
      if (e.target.matches?.('input, textarea, select')) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); this.redo(); }
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
      test: () => { if (this.check(true)) { this.commit(); this.cb.onTest?.(this.d, this); } },
      upload: () => { if (this.check()) { this.commit(); this.cb.onUpload?.(this.d, this); } },
    };
    el.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => act[b.dataset.a](); });
  }

  // Runs the checks and shows the result. `forTest` allows testing an unnamed map.
  check(forTest = false) {
    this.commit();
    const problems = [];
    const name = this.d.name;
    if (!forTest) {
      if (!/^[A-Za-z0-9 _'-]{3,24}$/.test(name)) problems.push('Give the map a name: 3-24 letters, numbers, spaces, - or _.');
      else if (censor(name) !== name || censor(this.d.description) !== this.d.description) problems.push('The name or description contains a blocked word.');
    }
    try { problems.push(...validateMap(draftDef(this.d))); } catch (e) { problems.push(e.message); }
    const box = this.el.querySelector('#ed-check');
    box.innerHTML = problems.length ? `<p class="err">Not ready yet:</p><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p class="ok">✓ Ready to play: spawns are hidden from each other and everything is reachable.</p>';
    return problems.length === 0;
  }
}

// Exposed for the workshop list: the cell colours as a small preview image.
export function previewCanvas(data, scale = 4) {
  const c = document.createElement('canvas');
  c.width = data.w * scale; c.height = data.h * scale;
  const g = c.getContext('2d');
  data.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { g.fillStyle = cellColor(row[x]); g.fillRect(x * scale, y * scale, scale, scale); } });
  for (const [i, r] of (data.spawns || []).entries()) if (r) { g.fillStyle = i ? 'rgba(78,163,255,.6)' : 'rgba(232,131,58,.6)'; g.fillRect(r[0] * scale, r[1] * scale, (r[2] - r[0] + 1) * scale, (r[3] - r[1] + 1) * scale); }
  return c;
}

