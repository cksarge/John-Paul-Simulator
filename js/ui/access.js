import { TEAM_COLORS } from '../data/modes.js';

// Accessibility: colour-blind palettes and the HUD size. Team colours, enemy markers and the
// good/bad colours all come from one palette, so a single setting changes every screen.
// The colour-blind palettes use the Okabe–Ito colours, and enemies on the radar also change shape.
export const PALETTES = {
  off: { label: 'Off', t: '#e8833a', ct: '#4ea3ff', enemy: '#ff4040', good: '#59d38a', bad: '#ff5a5a' },
  redgreen: { label: 'Red-green', t: '#e69f00', ct: '#56b4e9', enemy: '#ffffff', good: '#56b4e9', bad: '#e69f00' },
  blueyellow: { label: 'Blue-yellow', t: '#ff4d6d', ct: '#2ec4b6', enemy: '#ffffff', good: '#2ec4b6', bad: '#ff4d6d' },
};

export const palette = (s) => PALETTES[s?.colorblind] || PALETTES.off;

// Applies the palette and HUD size to the page, and the team colours used for operator models
// (models pick these up the next time they're built, i.e. the next match).
export function applyAccess(s) {
  const p = palette(s), root = document.documentElement.style;
  for (const k of ['t', 'ct', 'good', 'bad']) root.setProperty('--' + k, p[k]);
  root.setProperty('--hud-scale', String(s.hudScale || 1));
  TEAM_COLORS[0] = parseInt(p.t.slice(1), 16);
  TEAM_COLORS[1] = parseInt(p.ct.slice(1), 16);
  document.documentElement.classList.toggle('reduce-flash', !!s.reduceFlash);
}
