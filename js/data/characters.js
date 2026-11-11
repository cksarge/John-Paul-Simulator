// Operator presets and the option lists the character creator uses.
export const CHAR_OPTIONS = {
  hair: ['none', 'buzz', 'short', 'swept', 'long', 'mohawk', 'ponytail'],
  headgear: ['none', 'helmet', 'cap', 'beanie', 'headset', 'boonie'],
  face: ['none', 'beard', 'stubble', 'glasses', 'balaclava', 'gasmask', 'mask'],
  build: ['slim', 'normal', 'heavy'],
  vest: ['none', 'plate', 'rig'],
  skin: ['#f3d2b5', '#e8b98e', '#d19a6b', '#b07447', '#8a5533', '#5e3a22', '#3f2716'],
  hairColor: ['#121010', '#3b2416', '#6b4423', '#a8743e', '#d8b46a', '#9a9a9a', '#e9e4d8', '#7a1f1f'],
  cloth: ['#2b2f33', '#4a4f4a', '#59614d', '#6f6448', '#8a7a5a', '#3a4658', '#273548', '#5b3030', '#1d1d1f', '#b9b4a6', '#40513b', '#6b6f75'],
};

export const DEFAULT_CHAR = {
  name: 'John-Paul', skin: '#d19a6b', hair: 'short', hairColor: '#3b2416', headgear: 'none', face: 'stubble',
  build: 'normal', height: 1.0, top: '#3a4658', pants: '#2b2f33', vest: 'plate', vestColor: '#59614d',
  gloves: '#1d1d1f', boots: '#2a221b', accent: '#f2a33a',
};

export const OPERATORS = [
  { id: 'vance', name: 'J.P. Vance', role: 'Rifleman', bio: 'Former border-patrol marksman. Methodical, never rushes a corner.',
    char: { ...DEFAULT_CHAR, name: 'Vance', skin: '#d19a6b', hair: 'short', headgear: 'helmet', face: 'none', top: '#59614d', pants: '#4a4f4a', vest: 'plate', vestColor: '#40513b' } },
  { id: 'okafor', name: 'J.P. Okafor', role: 'Entry', bio: 'First through the door. Breaching specialist with a short temper.',
    char: { ...DEFAULT_CHAR, name: 'Okafor', skin: '#5e3a22', hair: 'buzz', hairColor: '#121010', headgear: 'headset', face: 'beard', top: '#1d1d1f', pants: '#2b2f33', vest: 'rig', vestColor: '#2b2f33', build: 'heavy' } },
  { id: 'reyes', name: 'J.P. Reyes', role: 'Recon', bio: 'Reads a map like a novel. Talks little, sees everything.',
    char: { ...DEFAULT_CHAR, name: 'Reyes', skin: '#b07447', hair: 'ponytail', hairColor: '#121010', headgear: 'cap', face: 'glasses', top: '#6f6448', pants: '#8a7a5a', vest: 'none', build: 'slim' } },
  { id: 'lindqvist', name: 'J.P. Lindqvist', role: 'Marksman', bio: 'Arctic sniper school graduate. Patience measured in hours.',
    char: { ...DEFAULT_CHAR, name: 'Lindqvist', skin: '#f3d2b5', hair: 'swept', hairColor: '#d8b46a', headgear: 'beanie', face: 'none', top: '#b9b4a6', pants: '#6b6f75', vest: 'rig', vestColor: '#6b6f75', build: 'slim', height: 1.04 } },
  { id: 'kowalski', name: 'J.P. Kowalski', role: 'Anchor', bio: 'Holds a site alone. Built like the doors he refuses to leave.',
    char: { ...DEFAULT_CHAR, name: 'Kowalski', skin: '#e8b98e', hair: 'none', headgear: 'helmet', face: 'balaclava', top: '#273548', pants: '#273548', vest: 'plate', vestColor: '#1d1d1f', build: 'heavy', height: 1.05 } },
  { id: 'tanaka', name: 'J.P. Tanaka', role: 'Support', bio: 'Utility expert. Every smoke lands exactly where it should.',
    char: { ...DEFAULT_CHAR, name: 'Tanaka', skin: '#e8b98e', hair: 'mohawk', hairColor: '#121010', headgear: 'none', face: 'mask', top: '#5b3030', pants: '#1d1d1f', vest: 'rig', vestColor: '#2b2f33', height: 0.97 } },
  { id: 'haddad', name: 'J.P. Haddad', role: 'Demolitions', bio: 'Can plant a charge in his sleep. Has, allegedly.',
    char: { ...DEFAULT_CHAR, name: 'Haddad', skin: '#b07447', hair: 'short', hairColor: '#121010', headgear: 'boonie', face: 'beard', top: '#8a7a5a', pants: '#6f6448', vest: 'plate', vestColor: '#6f6448' } },
  { id: 'mercer', name: 'J.P. Mercer', role: 'Specialist', bio: 'Chemical-warfare veteran. Nobody has seen his face.',
    char: { ...DEFAULT_CHAR, name: 'Mercer', skin: '#d19a6b', hair: 'none', headgear: 'helmet', face: 'gasmask', top: '#2b2f33', pants: '#2b2f33', vest: 'plate', vestColor: '#4a4f4a', build: 'normal' } },
];

export function randomChar(rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const base = pick(OPERATORS).char;
  return { ...base, top: pick(CHAR_OPTIONS.cloth), pants: pick(CHAR_OPTIONS.cloth), skin: pick(CHAR_OPTIONS.skin) };
}

export function sanitizeChar(c) {
  const out = { ...DEFAULT_CHAR };
  if (!c || typeof c !== 'object') return out;
  const color = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
  const oneOf = (v, list, d) => (list.includes(v) ? v : d);
  out.name = typeof c.name === 'string' ? c.name.slice(0, 18) : out.name;
  out.skin = color(c.skin, out.skin);
  out.hairColor = color(c.hairColor, out.hairColor);
  out.top = color(c.top, out.top);
  out.pants = color(c.pants, out.pants);
  out.vestColor = color(c.vestColor, out.vestColor);
  out.gloves = color(c.gloves, out.gloves);
  out.boots = color(c.boots, out.boots);
  out.accent = color(c.accent, out.accent);
  out.hair = oneOf(c.hair, CHAR_OPTIONS.hair, out.hair);
  out.headgear = oneOf(c.headgear, CHAR_OPTIONS.headgear, out.headgear);
  out.face = oneOf(c.face, CHAR_OPTIONS.face, out.face);
  out.build = oneOf(c.build, CHAR_OPTIONS.build, out.build);
  out.vest = oneOf(c.vest, CHAR_OPTIONS.vest, out.vest);
  out.height = Math.min(1.08, Math.max(0.92, Number(c.height) || 1));
  return out;
}
