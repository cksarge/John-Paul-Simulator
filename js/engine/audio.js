// Synthesised sound effects (no audio files). Positional sounds use HRTF panning.
let ctx = null, master = null, noiseBuf = null;
let volume = 0.7;
const listener = { x: 0, y: 0, z: 0 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 6;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setVolume(v) { volume = v; if (master) master.gain.value = v; }

export function setListener(pos, forward) {
  if (!ctx) return;
  const L = ctx.listener;
  listener.x = pos.x; listener.y = pos.y; listener.z = pos.z;
  if (L.positionX) {
    L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
    L.forwardX.value = forward.x; L.forwardY.value = forward.y; L.forwardZ.value = forward.z;
    L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
  } else {
    L.setPosition(pos.x, pos.y, pos.z);
    L.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
  }
}

function out(pos, gain = 1, maxDist = 80) {
  const g = ctx.createGain();
  g.gain.value = gain;
  if (!pos) { g.connect(master); return g; }
  const dx = pos.x - listener.x, dy = pos.y - listener.y, dz = pos.z - listener.z;
  if (dx * dx + dy * dy + dz * dz > maxDist * maxDist * 4) return null;
  const p = ctx.createPanner();
  p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
  p.refDistance = 3; p.maxDistance = maxDist * 2; p.rolloffFactor = 1.1;
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
  else p.setPosition(pos.x, pos.y, pos.z);
  g.connect(p).connect(master);
  return g;
}

function noise(dst, t, dur, { type = 'lowpass', freq = 2000, q = 0.7, gain = 1, attack = 0.001, freqEnd } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dst);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}

function tone(dst, t, dur, { type = 'sine', freq = 440, freqEnd, gain = 0.5, attack = 0.003 } = {}) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dst);
  o.start(t); o.stop(t + dur + 0.05);
}

const GUN = {
  p9: { body: 1400, len: 0.18, thump: 150, gain: 0.7 },
  magnum: { body: 900, len: 0.35, thump: 90, gain: 1 },
  vex: { body: 1800, len: 0.14, thump: 160, gain: 0.6 },
  breacher: { body: 700, len: 0.45, thump: 70, gain: 1 },
  ar7: { body: 1100, len: 0.26, thump: 110, gain: 0.85 },
  m5: { body: 1500, len: 0.22, thump: 130, gain: 0.75 },
  longshot: { body: 700, len: 0.7, thump: 60, gain: 1.1 },
  viper: { body: 1900, len: 0.12, thump: 170, gain: 0.55 },
  tac45: { body: 1100, len: 0.22, thump: 120, gain: 0.8 },
  kestrel: { body: 2000, len: 0.13, thump: 180, gain: 0.55 },
  reaper: { body: 800, len: 0.38, thump: 80, gain: 0.95 },
  bulldog: { body: 950, len: 0.3, thump: 95, gain: 0.9 },
  trident: { body: 1300, len: 0.2, thump: 125, gain: 0.75 },
  falcon: { body: 850, len: 0.45, thump: 85, gain: 1 },
  sparrow: { body: 1000, len: 0.5, thump: 90, gain: 0.95 },
  hornet: { body: 2100, len: 0.11, thump: 190, gain: 0.5 },
  mako: { body: 1250, len: 0.18, thump: 120, gain: 0.7 },
  coach: { body: 600, len: 0.55, thump: 60, gain: 1.15 },
  striker: { body: 750, len: 0.4, thump: 75, gain: 0.95 },
  mauler: { body: 1050, len: 0.26, thump: 100, gain: 0.85 },
  hailstorm: { body: 1600, len: 0.16, thump: 140, gain: 0.7 },
  anvil: { body: 800, len: 0.36, thump: 80, gain: 1.05 },
  kodiak: { body: 750, len: 0.6, thump: 70, gain: 1.05 },
  warden: { body: 900, len: 0.42, thump: 85, gain: 0.95 },
  nailer: { body: 2600, len: 0.08, thump: 260, gain: 0.45, metal: true },
  crossbow: { body: 3000, len: 0.1, thump: 220, gain: 0.3, twang: true },
  thumper: { body: 300, len: 0.3, thump: 70, gain: 0.8 },
  rail: { body: 2400, len: 0.5, thump: 160, gain: 0.9, zap: true },
};

export const sfx = {
  shot(weapon, pos) {
    if (!ctx) return;
    const s = GUN[weapon]; if (!s) return;
    const dst = out(pos, s.gain, 140); if (!dst) return;
    const t = ctx.currentTime;
    if (s.twang) {
      tone(dst, t, 0.25, { type: 'triangle', freq: 220, freqEnd: 150, gain: 0.8 });
      noise(dst, t, 0.08, { type: 'bandpass', freq: 3000, q: 2, gain: 0.6 });
      return;
    }
    if (s.zap) tone(dst, t, 0.45, { type: 'sawtooth', freq: 1800, freqEnd: 120, gain: 0.5 });
    if (s.metal) tone(dst, t, 0.05, { type: 'square', freq: 3200, freqEnd: 1800, gain: 0.25 });
    noise(dst, t, 0.03, { type: 'highpass', freq: 3000, gain: 0.9 });
    noise(dst, t, s.len, { freq: s.body * 2, freqEnd: s.body / 3, gain: 1, q: 0.5 });
    tone(dst, t, s.len * 0.6, { type: 'triangle', freq: s.thump * 2, freqEnd: s.thump / 2, gain: 0.9 });
    noise(dst, t + 0.02, s.len * 2.2, { type: 'bandpass', freq: 500, gain: 0.12, attack: 0.02 });
  },
  knife(pos) {
    if (!ctx) return; const dst = out(pos, 0.5, 20); if (!dst) return;
    noise(dst, ctx.currentTime, 0.15, { type: 'bandpass', freq: 3500, freqEnd: 1200, gain: 0.6, q: 2 });
  },
  dryFire() { if (!ctx) return; const d = out(null, 0.4); tone(d, ctx.currentTime, 0.04, { type: 'square', freq: 1800, gain: 0.3 }); },
  reload(pos) {
    if (!ctx) return; const dst = out(pos, 0.5, 20); if (!dst) return;
    const t = ctx.currentTime;
    noise(dst, t + 0.1, 0.06, { type: 'bandpass', freq: 2500, q: 3, gain: 0.7 });
    noise(dst, t + 0.55, 0.05, { type: 'bandpass', freq: 1800, q: 3, gain: 0.7 });
    noise(dst, t + 0.75, 0.07, { type: 'bandpass', freq: 3000, q: 4, gain: 0.8 });
  },
  step(pos, loud = 1) {
    if (!ctx) return; const dst = out(pos, 0.35 * loud, 30); if (!dst) return;
    noise(dst, ctx.currentTime, 0.09, { type: 'lowpass', freq: 600 + Math.random() * 300, gain: 0.8 });
  },
  land(pos) { if (!ctx) return; const dst = out(pos, 0.5, 30); if (!dst) return; noise(dst, ctx.currentTime, 0.14, { freq: 400, gain: 0.9 }); },
  hit(head) {
    if (!ctx) return; const d = out(null, 0.35); const t = ctx.currentTime;
    if (head) { tone(d, t, 0.18, { type: 'sine', freq: 2400, gain: 0.5 }); tone(d, t, 0.12, { type: 'triangle', freq: 1200, gain: 0.3 }); }
    else tone(d, t, 0.06, { type: 'square', freq: 900, freqEnd: 600, gain: 0.25 });
  },
  hurt() { if (!ctx) return; const d = out(null, 0.5); noise(d, ctx.currentTime, 0.18, { freq: 300, gain: 0.8 }); },
  impact(pos) { if (!ctx) return; const dst = out(pos, 0.25, 25); if (!dst) return; noise(dst, ctx.currentTime, 0.05, { type: 'bandpass', freq: 2200 + Math.random() * 1500, q: 2, gain: 0.7 }); },
  explosion(pos) {
    if (!ctx) return; const dst = out(pos, 1.4, 200); if (!dst) return; const t = ctx.currentTime;
    noise(dst, t, 1.4, { freq: 1200, freqEnd: 60, gain: 1 });
    tone(dst, t, 0.8, { type: 'sine', freq: 90, freqEnd: 30, gain: 1 });
  },
  flash(pos) {
    if (!ctx) return; const dst = out(pos, 1.1, 150); if (!dst) return; const t = ctx.currentTime;
    noise(dst, t, 0.35, { type: 'highpass', freq: 2500, freqEnd: 900, gain: 1 });
    tone(dst, t, 0.3, { type: 'sine', freq: 140, freqEnd: 50, gain: 0.8 });
  },
  ringing() { if (!ctx) return; const d = out(null, 0.18); tone(d, ctx.currentTime, 2.5, { type: 'sine', freq: 3800, gain: 0.25, attack: 0.05 }); },
  fire(pos) {
    if (!ctx) return; const dst = out(pos, 0.8, 60); if (!dst) return; const t = ctx.currentTime;
    noise(dst, t, 0.4, { type: 'bandpass', freq: 900, freqEnd: 300, gain: 0.9 });
    noise(dst, t + 0.1, 2.5, { type: 'lowpass', freq: 500, gain: 0.35, attack: 0.3 });
  },
  door(pos) {
    if (!ctx) return; const dst = out(pos, 0.5, 30); if (!dst) return; const t = ctx.currentTime;
    noise(dst, t, 0.45, { type: 'bandpass', freq: 380, freqEnd: 260, q: 1.5, gain: 0.7 });
    tone(dst, t + 0.4, 0.08, { type: 'triangle', freq: 160, gain: 0.5 });
  },
  wood(pos, small) {
    if (!ctx) return; const dst = out(pos, small ? 0.5 : 1, 60); if (!dst) return; const t = ctx.currentTime;
    noise(dst, t, small ? 0.12 : 0.5, { type: 'bandpass', freq: small ? 900 : 600, freqEnd: 250, q: 1.2, gain: 0.9 });
    if (!small) for (let i = 0; i < 4; i++) noise(dst, t + 0.05 + i * 0.06, 0.08, { type: 'bandpass', freq: 1600 + Math.random() * 1200, q: 3, gain: 0.5 });
  },
  glass(pos) {
    if (!ctx) return; const dst = out(pos, 0.8, 60); if (!dst) return; const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) tone(dst, t + i * 0.025 + Math.random() * 0.02, 0.15, { type: 'sine', freq: 2500 + Math.random() * 3500, gain: 0.25 });
    noise(dst, t, 0.3, { type: 'highpass', freq: 4000, gain: 0.6 });
  },
  pickup() { if (!ctx) return; const d = out(null, 0.3); const t = ctx.currentTime; noise(d, t, 0.06, { type: 'bandpass', freq: 2000, q: 3, gain: 0.6 }); noise(d, t + 0.12, 0.06, { type: 'bandpass', freq: 2600, q: 3, gain: 0.6 }); },
  smoke(pos) { if (!ctx) return; const dst = out(pos, 0.6, 50); if (!dst) return; noise(dst, ctx.currentTime, 2.0, { type: 'highpass', freq: 1500, freqEnd: 600, gain: 0.5, attack: 0.1 }); },
  bounce(pos) { if (!ctx) return; const dst = out(pos, 0.3, 30); if (!dst) return; tone(dst, ctx.currentTime, 0.05, { type: 'triangle', freq: 700, gain: 0.5 }); },
  beep(pos) { if (!ctx) return; const dst = out(pos, 0.5, 120); if (!dst) return; tone(dst, ctx.currentTime, 0.12, { type: 'square', freq: 1950, gain: 0.35 }); },
  plantDone(pos) { if (!ctx) return; const dst = out(pos, 0.6, 120); if (!dst) return; const t = ctx.currentTime; for (let i = 0; i < 3; i++) tone(dst, t + i * 0.09, 0.07, { type: 'square', freq: 1500, gain: 0.3 }); },
  click() { if (!ctx) return; tone(out(null, 0.2), ctx.currentTime, 0.03, { type: 'square', freq: 2400, gain: 0.3 }); },
  buy() { if (!ctx) return; const d = out(null, 0.3); const t = ctx.currentTime; tone(d, t, 0.06, { freq: 900, gain: 0.4 }); tone(d, t + 0.06, 0.08, { freq: 1350, gain: 0.4 }); },
  roundStart() { if (!ctx) return; const d = out(null, 0.35); const t = ctx.currentTime; [523, 659, 784].forEach((f, i) => tone(d, t + i * 0.09, 0.25, { type: 'triangle', freq: f, gain: 0.5 })); },
  win() { if (!ctx) return; const d = out(null, 0.4); const t = ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => tone(d, t + i * 0.12, 0.5, { type: 'triangle', freq: f, gain: 0.5 })); },
  lose() { if (!ctx) return; const d = out(null, 0.4); const t = ctx.currentTime; [392, 330, 262].forEach((f, i) => tone(d, t + i * 0.16, 0.5, { type: 'triangle', freq: f, gain: 0.5 })); },
  ui() { if (!ctx) return; tone(out(null, 0.15), ctx.currentTime, 0.04, { type: 'sine', freq: 1200, gain: 0.4 }); },
  ping(urgent) { if (!ctx) return; const d = out(null, 0.25); const t = ctx.currentTime; tone(d, t, 0.07, { type: 'sine', freq: urgent ? 1560 : 1180, gain: 0.5 }); tone(d, t + 0.08, 0.1, { type: 'sine', freq: urgent ? 2080 : 1480, gain: 0.45 }); },
};
