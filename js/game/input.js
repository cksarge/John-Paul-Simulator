import { pad, BTN } from '../engine/gamepad.js';

// Controller buttons that act like keys, so the game reads them exactly like the keyboard.
const PAD_KEYS = {
  [BTN.A]: 'Space', [BTN.B]: 'ControlLeft', [BTN.X]: 'KeyR', [BTN.Y]: 'KeyQ', [BTN.LB]: 'Digit4', [BTN.RB]: 'KeyE',
  [BTN.BACK]: 'Tab', [BTN.UP]: 'KeyG', [BTN.LEFT]: 'KeyB', [BTN.RIGHT]: 'KeyF', [BTN.L3]: 'Digit5', [BTN.R3]: 'Digit3',
};

// Keyboard/mouse state with pointer lock, plus a controller. Edge-triggered presses are read with `pressed()`.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.edges = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, wheel: 0 };
    this.mouseEdges = new Set();
    this.enabled = true;
    this.typing = false;
    this.onUnlock = null;
    this._h = {
      kd: (e) => {
        if (this.typing) return;
        if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        if (!this.keys.has(e.code)) this.edges.add(e.code);
        this.keys.add(e.code);
      },
      ku: (e) => { this.keys.delete(e.code); },
      mm: (e) => { if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; } },
      md: (e) => {
        if (!this.locked) return;
        if (e.button === 0) { this.mouse.left = true; this.mouseEdges.add('left'); }
        if (e.button === 2) { this.mouse.right = true; this.mouseEdges.add('right'); }
      },
      mu: (e) => { if (e.button === 0) this.mouse.left = false; if (e.button === 2) this.mouse.right = false; },
      wh: (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); },
      plc: () => {
        const was = this.locked;
        this.locked = document.pointerLockElement === this.canvas;
        if (was && !this.locked) { this.keys.clear(); this.mouse.left = this.mouse.right = false; this.onUnlock?.(); }
      },
      cm: (e) => e.preventDefault(),
      // Clicking the game view always recaptures the mouse (e.g. after alt-tabbing away).
      click: () => { if (!this.locked && this.onCanvasClick) this.onCanvasClick(); },
      blur: () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; },
    };
    addEventListener('keydown', this._h.kd);
    addEventListener('keyup', this._h.ku);
    addEventListener('mousemove', this._h.mm);
    addEventListener('mousedown', this._h.md);
    addEventListener('mouseup', this._h.mu);
    addEventListener('wheel', this._h.wh, { passive: true });
    addEventListener('blur', this._h.blur);
    document.addEventListener('pointerlockchange', this._h.plc);
    document.addEventListener('contextmenu', this._h.cm);
    canvas.addEventListener('click', this._h.click);
    this.locked = false;
    this.lockRequestedAt = 0;
    this.padPrev = [];
    this.padHeld = new Set();
    this.padEdges = new Set();
    this.padState = null;
    this.padFire = false;
    this.padSuppressUntil = 0;
    this.onPadStart = null;
  }

  // True when the game has the controls: the mouse is captured, or a controller is in use.
  get captured() { return this.locked || (pad.active && !!this.padState); }

  // Reads the controller once per frame and folds its buttons into the key and mouse state.
  pollPad() {
    const s = pad.read();
    this.padState = s;
    if (!s) {
      for (const c of this.padHeld) this.keys.delete(c);
      this.padHeld.clear();
      this.padFire = false;
      this.padPrev = [];
      return;
    }
    const quiet = performance.now() < this.padSuppressUntil;
    const prev = this.padPrev;
    s.buttons.forEach((on, i) => {
      if (on && !prev[i] && !quiet) this.padEdges.add(i);
      const code = PAD_KEYS[i];
      if (!code) return;
      if (on && !prev[i] && !quiet) { if (!this.keys.has(code)) this.edges.add(code); this.keys.add(code); this.padHeld.add(code); }
      else if (!on && this.padHeld.has(code)) { this.keys.delete(code); this.padHeld.delete(code); }
    });
    if (!quiet) {
      if (s.buttons[BTN.DOWN] && !prev[BTN.DOWN]) this.mouse.wheel += 1;
      if (s.lt > 0.5 && !(this.padLt > 0.5)) this.mouseEdges.add('right');
      if (s.rt > 0.3 && !this.padFire) this.mouseEdges.add('left');
      if (s.buttons[BTN.START] && !prev[BTN.START]) this.onPadStart?.();
    }
    this.padFire = s.rt > 0.3 && (!quiet || this.padFire);
    this.padLt = s.lt;
    this.padPrev = s.buttons;
  }

  padPressed(b) { return this.padEdges.has(b); }

  // Analog move from the left stick: {f, r, m}, or null when the stick is centred.
  padMove() {
    const ls = this.padState?.ls;
    return pad.active && ls && ls.m > 0 ? { f: -ls.y, r: ls.x, m: ls.m } : null;
  }

  // Right stick with a response curve for fine aim near the centre.
  padLook() {
    const rs = this.padState?.rs;
    if (!pad.active || !rs || !rs.m) return { x: 0, y: 0 };
    const k = Math.pow(rs.m, 1.8) / rs.m;
    return { x: rs.x * k, y: rs.y * k };
  }

  fireDown() { return this.mouse.left || (pad.active && this.padFire); }

  // Resolves once the pointer is captured; rejects if the browser refuses
  // (it blocks re-locking for about a second after Esc or a tab switch).
  lock() {
    // A controller (or a touch screen with no pointer lock at all) needs no mouse capture.
    if (this.locked || pad.active || !this.canvas.requestPointerLock) return Promise.resolve();
    this.lockRequestedAt = performance.now();
    return new Promise((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error('pointer lock refused')); };
      const cleanup = () => {
        document.removeEventListener('pointerlockchange', done);
        document.removeEventListener('pointerlockerror', fail);
      };
      document.addEventListener('pointerlockchange', done, { once: true });
      document.addEventListener('pointerlockerror', fail, { once: true });
      try {
        const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
        // Some platforms reject unadjustedMovement; retry plain lock in the same gesture.
        if (p?.catch) p.catch(() => { try { this.canvas.requestPointerLock()?.catch?.(fail); } catch { fail(); } });
      } catch {
        try { this.canvas.requestPointerLock(); } catch { fail(); }
      }
      setTimeout(() => { if (!this.locked) fail(); }, 1500);
    });
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return !this.typing && this.keys.has(code); }
  pressed(code) { return !this.typing && this.edges.has(code); }
  clicked(btn) { return this.mouseEdges.has(btn); }

  endFrame() {
    this.edges.clear();
    this.mouseEdges.clear();
    this.padEdges.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.wheel = 0;
  }

  dispose() {
    removeEventListener('keydown', this._h.kd);
    removeEventListener('keyup', this._h.ku);
    removeEventListener('mousemove', this._h.mm);
    removeEventListener('mousedown', this._h.md);
    removeEventListener('mouseup', this._h.mu);
    removeEventListener('wheel', this._h.wh);
    removeEventListener('blur', this._h.blur);
    document.removeEventListener('pointerlockchange', this._h.plc);
    document.removeEventListener('contextmenu', this._h.cm);
    this.canvas.removeEventListener('click', this._h.click);
    this.unlock();
  }
}
