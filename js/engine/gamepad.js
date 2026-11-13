// Controller support shared by the whole app: reading the pad, remembering which device was used last,
// rumble, button labels for hints, and focus navigation for every menu and overlay.
// Buttons use the browser's "standard" layout (Xbox naming; PlayStation pads map to the same slots).
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

// Sony pads report vendor 054c; "Wireless Controller" alone is the DualShock 4's name (Xbox pads add "Xbox").
export const isPS = (id) => !/xbox|xinput|045e/i.test(id || '') && /054c|playstation|dualsense|dualshock|wireless controller/i.test(id || '');

// Labels for hints: [keyboard, Xbox, PlayStation].
const LABELS = {
  use: ['E', 'RB', 'R1'],
  buy: ['B', 'D-pad ←', 'D-pad ←'],
  rebuy: ['F', 'D-pad →', 'D-pad →'],
  keep: ['K', 'Y', '△'],
  play: ['Click', 'Press A', 'Press ✕'],
  next: ['Click', 'A', '✕'],
};

export const pad = {
  active: false, // true while the controller is the device in use
  deadzone: 0.15,
  vibration: true,
  listeners: new Set(),
  id: '',

  // Snapshot of the first connected pad, or null. Chrome hands out copies, so this is re-read every frame.
  read() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const g of list) if (g && g.connected && (!gp || g.timestamp > gp.timestamp)) gp = g;
    if (!gp) return null;
    this.id = gp.id;
    const b = (i) => { const x = gp.buttons[i]; return x ? x.pressed || x.value > 0.5 : false; };
    const v = (i) => gp.buttons[i]?.value ?? 0;
    const stick = (ix, iy) => {
      const x = gp.axes[ix] || 0, y = gp.axes[iy] || 0, m = Math.hypot(x, y);
      if (m < this.deadzone) return { x: 0, y: 0, m: 0 };
      const k = Math.min(1, (m - this.deadzone) / (1 - this.deadzone)) / m;
      return { x: x * k, y: y * k, m: Math.min(1, m * k) };
    };
    return { gp, buttons: Array.from({ length: 17 }, (_, i) => b(i)), lt: v(BTN.LT), rt: v(BTN.RT), ls: stick(0, 1), rs: stick(2, 3) };
  },

  connected() { return !!this.read(); },

  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    document.documentElement.classList.toggle('pad-mode', on);
    for (const fn of this.listeners) fn(on);
  },

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },

  rumble(weak, strong, ms) {
    if (!this.active || !this.vibration) return;
    const gp = this.read()?.gp, act = gp?.vibrationActuator;
    act?.playEffect?.('dual-rumble', { duration: ms, weakMagnitude: weak, strongMagnitude: strong }).catch(() => {});
  },

  // Hint label for an action, matching the device in use.
  label(action) {
    const l = LABELS[action];
    if (!l) return action;
    return this.active ? l[isPS(this.id) ? 2 : 1] : l[0];
  },
};

// Any keyboard or mouse use hands control back to keyboard and mouse.
{
  let moved = 0, movedAt = 0;
  const kbm = () => pad.setActive(false);
  addEventListener('keydown', kbm, true);
  // Pointer events, so taps on a touch screen (which also fire mouse events) don't count as a mouse.
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') kbm(); }, true);
  addEventListener('wheel', kbm, { capture: true, passive: true });
  addEventListener('pointermove', (e) => {
    if (!pad.active || e.pointerType !== 'mouse') return;
    const now = performance.now();
    if (now - movedAt > 300) moved = 0;
    movedAt = now;
    moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (moved > 60) kbm();
  }, true);
}

// ───────────────────────── mobile ─────────────────────────
// Phones and tablets have no mouse or keyboard to play with, so they need a controller.
export const isTouchOnly = () => navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;

// ───────────────────────── menu navigation ─────────────────────────
const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"]), .buy-item, .swatch, .item-card, .op-row, .chip, .map-tile, .mrow, .rp-p, tr.clickable';
const BACK = '[data-a=close], [data-a=resume], [data-done], [data-a=exit], [data-x], [data-back], [data-cancel]';
const DEFAULT = '[data-a=resume], [data-a=go], [data-gate-go], .deploy-btn:not([disabled]), .btn.primary:not([disabled]), button.sel, button.on';
const DIRS = { [BTN.UP]: [0, -1], [BTN.DOWN]: [0, 1], [BTN.LEFT]: [-1, 0], [BTN.RIGHT]: [1, 0] };

const visible = (el) => {
  if (el.disabled || el.closest('.hidden, [inert]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.pointerEvents !== 'none';
};

// A stable description of an element so focus can find its replacement after a panel re-renders.
const keyOf = (el) => {
  const data = [...el.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'id').map((a) => a.name + '=' + a.value).join('&');
  return el.tagName + '|' + data + '|' + (el.textContent || '').trim().slice(0, 40);
};

export class PadNav {
  // app gives access to the current game and replay; the nav only acts when no game is taking input.
  constructor(app) {
    this.app = app;
    this.prev = [];
    this.repeat = { dir: null, t: 0 };
    this.last = performance.now();
    this.focusKey = null;
    this.extra = new Set(); // per-screen hooks: fn(snapshot, pressed) → true if handled
    const loop = (now) => { requestAnimationFrame(loop); this.tick(now); };
    requestAnimationFrame(loop);
  }

  // Where the controller should be working right now, or null while a match has the controls.
  scope() {
    const gate = document.querySelector('.pad-gate');
    if (gate) return gate;
    const modal = [...document.querySelectorAll('.modal-backdrop')].pop();
    if (modal) return modal;
    const app = this.app, g = app.game;
    if (app.replay) return document.getElementById('hud');
    if (g && !g.ended) {
      const o = g.hud?.overlay;
      return o && o !== 'score' ? g.hud.el.ovl : null;
    }
    if (g?.ended) return g.hud.el.ovl;
    return document.getElementById('ui');
  }

  candidates(scope) {
    return [...scope.querySelectorAll(FOCUSABLE)].filter(visible);
  }

  current(scope) {
    const a = document.activeElement;
    return a && a !== document.body && scope.contains(a) && visible(a) ? a : null;
  }

  focus(el) {
    if (!el) return;
    document.querySelectorAll('.pad-focus').forEach((x) => x.classList.remove('pad-focus'));
    if (!el.matches('button, input, select, textarea, a[href], [tabindex]')) el.tabIndex = -1;
    el.focus({ preventScroll: true });
    el.classList.add('pad-focus');
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.focusKey = keyOf(el);
  }

  // Focus the element whose centre lies closest in the pressed direction.
  move(scope, [dx, dy]) {
    const cur = this.current(scope);
    const list = this.candidates(scope);
    if (!cur) return this.focus(this.restore(scope) || list.find((e) => e.matches(DEFAULT)) || list[0]);
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === cur || cur.contains(el) || el.contains(cur)) continue;
      const r = el.getBoundingClientRect();
      // Distance along the pressed direction, measured edge to edge so wide neighbours aren't skipped.
      const along = dx ? (dx > 0 ? r.left - a.right : a.left - r.right) : (dy > 0 ? r.top - a.bottom : a.top - r.bottom);
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const centre = dx ? (cx - ax) * dx : (cy - ay) * dy;
      if (along < -4 && centre <= 4) continue;
      const overlap = dx ? Math.max(0, Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top)) : Math.max(0, Math.min(a.right, r.right) - Math.max(a.left, r.left));
      const side = dx ? Math.abs(cy - ay) : Math.abs(cx - ax);
      const score = Math.max(0, along) + (overlap > 0 ? 0 : side * 2.2) + side * 0.2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) this.focus(best);
    else this.scrollBy(cur, dy * 120);
  }

  restore(scope) {
    if (!this.focusKey) return null;
    return this.candidates(scope).find((e) => keyOf(e) === this.focusKey) || null;
  }

  scrollBy(el, dy) {
    let s = el?.parentElement;
    while (s && s !== document.body) {
      const cs = getComputedStyle(s);
      if (/(auto|scroll)/.test(cs.overflowY) && s.scrollHeight > s.clientHeight) { s.scrollTop += dy; return; }
      s = s.parentElement;
    }
  }

  back(scope) {
    const b = [...scope.querySelectorAll(BACK)].filter(visible).pop();
    if (b) { b.click(); return; }
    if (scope.classList.contains('modal-backdrop')) { if (!scope.dataset.locked) scope.remove(); return; }
    // Main menu: B returns to the section list.
    const nav = scope.querySelector('.m-nav button.on');
    if (nav) this.focus(nav);
  }

  // Left/right on a slider or dropdown changes its value instead of moving focus.
  adjust(el, dir) {
    if (el.matches('input[type=range]')) {
      const step = +el.step || 1;
      const v = Math.min(+el.max, Math.max(+el.min, +el.value + dir * step));
      el.value = String(Math.round(v / step) * step);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (el.matches('select')) {
      el.selectedIndex = Math.min(el.options.length - 1, Math.max(0, el.selectedIndex + dir));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  tick(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const s = pad.read();
    if (!s) { this.prev = []; return; }
    const prev = this.prev, pressed = (i) => s.buttons[i] && !prev[i];
    if (s.buttons.some(Boolean) || s.ls.m > 0.3 || s.rs.m > 0.3 || s.lt > 0.3 || s.rt > 0.3) pad.setActive(true);
    this.prev = s.buttons;
    if (!pad.active) return;
    for (const fn of this.extra) if (fn(s, pressed, dt)) return;
    const scope = this.scope();
    if (!scope) return;

    // Keep focus on the same control when a panel re-renders underneath it.
    // With nothing focused (a new screen or overlay), land on its main button so A works straight away.
    let cur = this.current(scope);
    if (!cur) {
      const list = this.candidates(scope);
      const r = this.restore(scope) || list.find((e) => e.matches(DEFAULT)) || list[0];
      if (r) { this.focus(r); cur = r; }
    }

    // Direction from the D-pad or left stick, repeating while held.
    let dir = null;
    for (const b of [BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT]) if (s.buttons[b]) dir = b;
    if (dir === null && s.ls.m > 0.5) dir = Math.abs(s.ls.x) > Math.abs(s.ls.y) ? (s.ls.x > 0 ? BTN.RIGHT : BTN.LEFT) : (s.ls.y > 0 ? BTN.DOWN : BTN.UP);
    if (dir === null) this.repeat.dir = null;
    else if (dir !== this.repeat.dir) { this.repeat = { dir, t: 0.38 }; this.step(scope, cur, dir); }
    else if ((this.repeat.t -= dt) <= 0) { this.repeat.t = 0.09; this.step(scope, cur, dir); }

    if (pressed(BTN.A) && cur) {
      this.suppressGame();
      cur.click();
      if (cur.matches('input[type=text], input[type=email], input[type=password], input:not([type]), textarea')) cur.focus();
    }
    if (pressed(BTN.B)) { this.suppressGame(); this.back(scope); }
    // Bumpers switch menu sections.
    const ui = document.getElementById('ui');
    if (scope === ui && (pressed(BTN.LB) || pressed(BTN.RB))) {
      const tabs = [...ui.querySelectorAll('.m-nav button')];
      const i = tabs.findIndex((t) => t.classList.contains('on'));
      if (tabs.length) { const t = tabs[(i + (pressed(BTN.RB) ? 1 : -1) + tabs.length) % tabs.length]; t.click(); this.focusKey = keyOf(t); }
    }
    // Right stick: up/down scrolls, left/right turns your operator on the menu stage.
    if (s.rs.m > 0) {
      if (Math.abs(s.rs.y) > 0.2) this.scrollBy(cur || scope.querySelector('.m-panel *, .overlay *, .modal *') || scope.firstElementChild, s.rs.y * 900 * dt);
      if (scope === ui && Math.abs(s.rs.x) > 0.2) this.app.menuScene?.rotate(s.rs.x * 700 * dt);
    }
  }

  step(scope, cur, dir) {
    if (cur && (dir === BTN.LEFT || dir === BTN.RIGHT) && this.adjust(cur, dir === BTN.RIGHT ? 1 : -1)) return;
    this.move(scope, DIRS[dir]);
  }

  // A button press that closes a game overlay shouldn't also jump or shoot in the same frame.
  suppressGame() { const inp = this.app.game?.input; if (inp) inp.padSuppressUntil = performance.now() + 250; }
}

export function applyPadSettings(s) {
  pad.deadzone = s.padDeadzone ?? 0.15;
  pad.vibration = s.padVibration !== false;
}

// The full button layout, shown in settings and on the controller screen.
export function padHelp() {
  return 'Left stick move (light push walks) · Right stick look · RT fire · LT aim/scope · A jump · B crouch · X reload · Y last weapon · '
    + 'LB grenade · RB use/plant/defuse/pick up · D-pad ↓ next weapon · ↑ hold for emotes · ← buy · → rebuy · R3 ping (hold for the ping wheel) · L3 inspect · View scores · Menu pause. '
    + 'In menus: D-pad or left stick moves, A selects, B goes back, LB/RB switch sections, right stick scrolls.';
}
