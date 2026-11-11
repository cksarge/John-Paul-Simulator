// Collectible cosmetics. Weapon finishes work on every gun; outfits work on every operator.
export const RARITIES = {
  common: { name: 'Common', color: '#9aa4ad', weight: 50 },
  uncommon: { name: 'Uncommon', color: '#59d38a', weight: 28 },
  rare: { name: 'Rare', color: '#4ea3ff', weight: 14 },
  epic: { name: 'Epic', color: '#c06cff', weight: 6 },
  legendary: { name: 'Legendary', color: '#f2a33a', weight: 2 },
};

// pattern: how the finish is drawn on the gun body. palette: colours used by the pattern.
// metal: colour for the barrel/receiver parts. emissive: glow colour for neon-style finishes.
export const WEAPON_SKINS = {
  factory: { name: 'Factory', rarity: 'common', pattern: 'solid', palette: [], starter: true },
  sandstorm: { name: 'Sandstorm', rarity: 'common', pattern: 'solid', palette: ['#8a7656'], metal: '#4a4338', starter: true },
  gunmetal: { name: 'Gunmetal', rarity: 'common', pattern: 'solid', palette: ['#4b5057'], metal: '#2e3236' },
  olive: { name: 'Olive Drab', rarity: 'common', pattern: 'solid', palette: ['#4c5238'], metal: '#2c2f22' },
  woodland: { name: 'Woodland', rarity: 'uncommon', pattern: 'camo', palette: ['#4c5238', '#2f3524', '#6b6040', '#1e221a'] },
  arctic: { name: 'Arctic', rarity: 'uncommon', pattern: 'camo', palette: ['#d0d6db', '#9aa4ad', '#6b7680', '#b7bfc6'], metal: '#5d666e' },
  desertcamo: { name: 'Dune', rarity: 'uncommon', pattern: 'camo', palette: ['#c8a374', '#8a6a45', '#a8855a', '#6b5136'] },
  urban: { name: 'Urban Digital', rarity: 'rare', pattern: 'digital', palette: ['#3a3f45', '#5d646c', '#8b939b', '#24282c'] },
  jungle: { name: 'Jungle Digital', rarity: 'rare', pattern: 'digital', palette: ['#2f4a2a', '#4f6b36', '#1d2a1a', '#6d7f45'] },
  tiger: { name: 'Tiger Stripe', rarity: 'rare', pattern: 'stripes', palette: ['#d9822b', '#141414'] },
  crimson: { name: 'Crimson', rarity: 'rare', pattern: 'solid', palette: ['#8f1d1d'], metal: '#1a1212' },
  cobalt: { name: 'Cobalt', rarity: 'rare', pattern: 'solid', palette: ['#1f4fa3'], metal: '#141c2a' },
  carbon: { name: 'Carbon Fiber', rarity: 'epic', pattern: 'carbon', palette: ['#1a1b1d', '#2c2e31'], metal: '#111' },
  ocean: { name: 'Deep Ocean', rarity: 'epic', pattern: 'waves', palette: ['#0c2a4a', '#1a5b8a', '#3fa7d6'] },
  magma: { name: 'Magma', rarity: 'epic', pattern: 'cracks', palette: ['#1b1210', '#ff5a1f'], emissive: '#ff4a10' },
  neon: { name: 'Neon Grid', rarity: 'legendary', pattern: 'grid', palette: ['#06100b', '#00ff9c'], emissive: '#00ff9c', metal: '#0a0f0c' },
  gold: { name: 'Gilded', rarity: 'legendary', pattern: 'metal', palette: ['#d4a73a'], metal: '#b8892a', metalness: 1, roughness: 0.25 },
  prism: { name: 'Prism', rarity: 'legendary', pattern: 'prism', palette: ['#ff4d6d', '#ffd23f', '#3ddc97', '#4ea3ff', '#c06cff'] },
};

// Outfits recolour clothing on any operator. Keys override the character's own colours.
export const OUTFITS = {
  standard: { name: 'Standard Issue', rarity: 'common', colors: {}, starter: true },
  desert: { name: 'Desert Patrol', rarity: 'common', colors: { top: '#8a7a5a', pants: '#6f6448', vestColor: '#a8855a', gloves: '#5a4632', boots: '#5a4632' }, starter: true },
  urbanops: { name: 'Urban Ops', rarity: 'common', colors: { top: '#4a4f55', pants: '#2b2f33', vestColor: '#1d1d1f', gloves: '#1d1d1f', boots: '#1a1a1a' } },
  woodland: { name: 'Woodland', rarity: 'uncommon', colors: { top: '#40513b', pants: '#4c5238', vestColor: '#2f3524', gloves: '#2b3a2b', boots: '#2a221b' } },
  arctic: { name: 'Arctic Warfare', rarity: 'uncommon', colors: { top: '#d0d6db', pants: '#b9b4a6', vestColor: '#9aa4ad', gloves: '#6b6f75', boots: '#5a5f66' } },
  nightops: { name: 'Night Ops', rarity: 'rare', colors: { top: '#14161a', pants: '#14161a', vestColor: '#0b0c0e', gloves: '#0b0c0e', boots: '#0b0c0e' } },
  navy: { name: 'Naval Strike', rarity: 'rare', colors: { top: '#273548', pants: '#1b2533', vestColor: '#3a4658', gloves: '#141c2a', boots: '#141414' } },
  crimson: { name: 'Crimson Guard', rarity: 'epic', colors: { top: '#5b1a1a', pants: '#1d1d1f', vestColor: '#8f1d1d', gloves: '#1d1d1f', boots: '#1a1a1a' } },
  royal: { name: 'Royal Detail', rarity: 'epic', colors: { top: '#1f2f5a', pants: '#141c33', vestColor: '#c79a2e', gloves: '#141414', boots: '#141414' } },
  phantom: { name: 'Phantom', rarity: 'legendary', colors: { top: '#06100b', pants: '#06100b', vestColor: '#0e1a14', gloves: '#00ff9c', boots: '#06100b' }, glow: '#00ff9c' },
  gilded: { name: 'Gilded Elite', rarity: 'legendary', colors: { top: '#1a1a1a', pants: '#1a1a1a', vestColor: '#d4a73a', gloves: '#d4a73a', boots: '#2a221b' } },
};

export function starterInventory() {
  return {
    finishes: Object.keys(WEAPON_SKINS).filter((k) => WEAPON_SKINS[k].starter),
    outfits: Object.keys(OUTFITS).filter((k) => OUTFITS[k].starter),
  };
}

export function normalizeInventory(inv) {
  const base = starterInventory();
  const finishes = new Set([...base.finishes, ...((inv && inv.finishes) || []).filter((k) => WEAPON_SKINS[k])]);
  const outfits = new Set([...base.outfits, ...((inv && inv.outfits) || []).filter((k) => OUTFITS[k])]);
  return { finishes: [...finishes], outfits: [...outfits] };
}

// Rolls one random item. Already-owned items are skipped where possible so drops feel fresh.
export function rollDrop(inv, rng = Math.random) {
  const pool = [];
  for (const [id, s] of Object.entries(WEAPON_SKINS)) if (!s.starter) pool.push({ kind: 'finish', id, rarity: s.rarity, name: s.name });
  for (const [id, o] of Object.entries(OUTFITS)) if (!o.starter) pool.push({ kind: 'outfit', id, rarity: o.rarity, name: o.name });
  const owned = (it) => (it.kind === 'finish' ? inv.finishes : inv.outfits).includes(it.id);
  const fresh = pool.filter((it) => !owned(it));
  const candidates = fresh.length ? fresh : pool;
  const total = candidates.reduce((a, it) => a + RARITIES[it.rarity].weight, 0);
  let r = rng() * total;
  for (const it of candidates) { r -= RARITIES[it.rarity].weight; if (r <= 0) return { ...it, duplicate: !fresh.length }; }
  return { ...candidates[0], duplicate: !fresh.length };
}

export function addToInventory(inv, item) {
  const key = item.kind === 'finish' ? 'finishes' : 'outfits';
  if (!inv[key].includes(item.id)) inv[key].push(item.id);
  return inv;
}

// CSS background that previews a finish on the collection cards.
export function finishSwatch(id) {
  const s = WEAPON_SKINS[id];
  if (!s) return '#333';
  const p = s.palette;
  switch (s.pattern) {
    case 'solid': return p[0] || '#2a2c30';
    case 'metal': return `linear-gradient(135deg, ${p[0]}, #fff3c4 45%, ${s.metal} 70%, ${p[0]})`;
    case 'camo': return `radial-gradient(circle at 25% 30%, ${p[1]} 18%, transparent 19%), radial-gradient(circle at 70% 65%, ${p[2]} 22%, transparent 23%), radial-gradient(circle at 60% 20%, ${p[3]} 12%, transparent 13%), ${p[0]}`;
    case 'digital': return `repeating-conic-gradient(${p[0]} 0 25%, ${p[1]} 0 50%) 0 0/12px 12px, ${p[2]}`;
    case 'stripes': return `repeating-linear-gradient(60deg, ${p[0]} 0 10px, ${p[1]} 10px 15px)`;
    case 'carbon': return `repeating-linear-gradient(45deg, ${p[0]} 0 4px, ${p[1]} 4px 8px)`;
    case 'waves': return `linear-gradient(160deg, ${p[0]}, ${p[1]} 55%, ${p[2]})`;
    case 'cracks': return `radial-gradient(circle at 40% 50%, ${p[1]}, transparent 35%), ${p[0]}`;
    case 'grid': return `linear-gradient(${p[1]} 1px, transparent 1px) 0 0/10px 10px, linear-gradient(90deg, ${p[1]} 1px, transparent 1px) 0 0/10px 10px, ${p[0]}`;
    case 'prism': return `linear-gradient(120deg, ${p.join(', ')})`;
    default: return p[0] || '#333';
  }
}

export function outfitSwatch(id) {
  const c = OUTFITS[id]?.colors || {};
  if (!c.top) return 'linear-gradient(135deg, #3a4658, #2b2f33)';
  return `linear-gradient(135deg, ${c.top} 0 40%, ${c.vestColor} 40% 70%, ${c.pants} 70%)`;
}
