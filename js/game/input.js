// Keyboard/mouse state with pointer lock. Edge-triggered presses are read with `pressed()`.
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
  }

  // Resolves once the pointer is captured; rejects if the browser refuses
  // (it blocks re-locking for about a second after Esc or a tab switch).
  lock() {
    if (this.locked) return Promise.resolve();
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
