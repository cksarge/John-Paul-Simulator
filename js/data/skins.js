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
  ruby: { name: 'Ruby Lacquer', rarity: 'uncommon', pattern: 'solid', palette: ['#6e1420'], metal: '#1a0c0e', roughness: 0.2 },
  paintball: { name: 'Paintball', rarity: 'uncommon', pattern: 'splatter', palette: ['#e8e4da', '#ff4d6d', '#3ddc97', '#4ea3ff', '#ffd23f'] },
  hex: { name: 'Hex Plate', rarity: 'rare', pattern: 'hex', palette: ['#2a3038', '#4a5562'], metal: '#1d2228' },
  sunset: { name: 'Sunset Fade', rarity: 'rare', pattern: 'fade', palette: ['#ff7a3d', '#ff3d7f', '#6a3dff'] },
  frost: { name: 'Frost Fade', rarity: 'rare', pattern: 'fade', palette: ['#e8f6ff', '#7cc7ff', '#2a5aa8'] },
  marble: { name: 'White Marble', rarity: 'rare', pattern: 'marble', palette: ['#e9e6e0', '#6b6862'], roughness: 0.25 },
  damascus: { name: 'Damascus', rarity: 'epic', pattern: 'damascus', palette: ['#3a3d42', '#9aa1a8'], metal: '#2a2c30', metalness: 0.9, roughness: 0.3 },
  circuit: { name: 'Circuit', rarity: 'epic', pattern: 'circuit', palette: ['#071218', '#27e0ff'], emissive: '#27e0ff', metal: '#0b1418' },
  toxic: { name: 'Toxic', rarity: 'epic', pattern: 'cracks', palette: ['#0f140a', '#9dff2e'], emissive: '#7aff10' },
  obsidian: { name: 'Obsidian', rarity: 'legendary', pattern: 'metal', palette: ['#121214'], metal: '#050506', metalness: 1, roughness: 0.12 },
  // Milestone unlocks: earned by playing, never dropped.
  veteran: { name: 'Veteran Steel', rarity: 'epic', pattern: 'damascus', palette: ['#2b2f24', '#c9b46a'], metal: '#1d1f18', metalness: 0.85, roughness: 0.3, milestone: { stat: 'matches', n: 100, label: 'Play 100 online matches' } },
  // Season reward-track exclusives (slot: which reward tier they sit on; see js/data/seasons.js).
  s1_signal: { name: 'Signal Flare', rarity: 'epic', pattern: 'fade', palette: ['#f2a33a', '#ff5a1f', '#1b2028'], season: 's1', slot: 'finish' },
  s1_frontier: { name: 'Frontier', rarity: 'legendary', pattern: 'metal', palette: ['#c96f1d'], metal: '#3a2414', metalness: 0.9, roughness: 0.3, season: 's1', slot: 'legend' },
  s2_glacier: { name: 'Glacier', rarity: 'epic', pattern: 'cracks', palette: ['#0c1824', '#7cc7ff'], emissive: '#5ab8ff', season: 's2', slot: 'finish' },
  s2_permafrost: { name: 'Permafrost', rarity: 'legendary', pattern: 'marble', palette: ['#e9f4ff', '#4a7aa8'], roughness: 0.2, season: 's2', slot: 'legend' },
  s3_moss: { name: 'Mossback', rarity: 'epic', pattern: 'camo', palette: ['#3d5a2a', '#6b8a3a', '#22331a', '#9ab85a'], season: 's3', slot: 'finish' },
  s3_verdant: { name: 'Verdant', rarity: 'legendary', pattern: 'grid', palette: ['#06120a', '#6dff5a'], emissive: '#6dff5a', metal: '#0a140c', season: 's3', slot: 'legend' },
  s4_scorch: { name: 'Scorched', rarity: 'epic', pattern: 'cracks', palette: ['#1a0c08', '#ffb03a'], emissive: '#ff9a1f', season: 's4', slot: 'finish' },
  s4_solar: { name: 'Solar Flare', rarity: 'legendary', pattern: 'fade', palette: ['#ffd23f', '#ff5a1f', '#8a1020'], emissive: '#ff7a3d', season: 's4', slot: 'legend' },
  s5_dusk: { name: 'Duskfall', rarity: 'epic', pattern: 'digital', palette: ['#1a1030', '#3a2060', '#6a3dff', '#0a0614'], season: 's5', slot: 'finish' },
  s5_void: { name: 'Voidwalker', rarity: 'legendary', pattern: 'circuit', palette: ['#05030a', '#c06cff'], emissive: '#c06cff', metal: '#0a0612', season: 's5', slot: 'legend' },
  apex: { name: 'Apex', rarity: 'legendary', pattern: 'fade', palette: ['#ffd23f', '#ff5a5a', '#c06cff'], emissive: '#ff7a3d', milestone: { stat: 'peak_elo', n: 1400, label: 'Reach Diamond (1400 ELO)' } },
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
  olivedrab: { name: 'Olive Drab', rarity: 'common', colors: { top: '#4c5238', pants: '#3a3f2c', vestColor: '#59614d', gloves: '#2f3524', boots: '#2a221b' } },
  greyman: { name: 'Grey Man', rarity: 'uncommon', colors: { top: '#6b6f75', pants: '#4a4f55', vestColor: '#3a3f45', gloves: '#2b2f33', boots: '#1a1a1a' } },
  hazmat: { name: 'Hazmat', rarity: 'rare', colors: { top: '#d9b32a', pants: '#d9b32a', vestColor: '#2b2f33', gloves: '#1d1d1f', boots: '#1d1d1f' } },
  mercenary: { name: 'Mercenary', rarity: 'rare', colors: { top: '#5a4632', pants: '#3b3328', vestColor: '#8a3a2a', gloves: '#3b3328', boots: '#2a221b' } },
  iceguard: { name: 'Ice Guard', rarity: 'epic', colors: { top: '#e8f6ff', pants: '#a8c8e0', vestColor: '#2a5aa8', gloves: '#2a5aa8', boots: '#1b2533' }, glow: '#7cc7ff' },
  ember: { name: 'Ember', rarity: 'legendary', colors: { top: '#1a0f0a', pants: '#1a0f0a', vestColor: '#2a140a', gloves: '#ff6a1f', boots: '#1a0f0a' }, glow: '#ff6a1f' },
  s1_vanguard: { name: 'Vanguard', rarity: 'epic', colors: { top: '#3a3f45', pants: '#2b2f33', vestColor: '#f2a33a', gloves: '#1d1d1f', boots: '#1a1a1a' }, season: 's1', slot: 'outfit' },
  s2_polar: { name: 'Polar Recon', rarity: 'epic', colors: { top: '#eef6fb', pants: '#c9d8e4', vestColor: '#5a8ab8', gloves: '#2a3a4a', boots: '#2a3a4a' }, glow: '#9ad8ff', season: 's2', slot: 'outfit' },
  s3_ranger: { name: 'Ranger', rarity: 'epic', colors: { top: '#3d5a2a', pants: '#2f3b22', vestColor: '#6b8a3a', gloves: '#22331a', boots: '#2a221b' }, season: 's3', slot: 'outfit' },
  s4_dunes: { name: 'Dune Raider', rarity: 'epic', colors: { top: '#c8a374', pants: '#8a6a45', vestColor: '#b8401f', gloves: '#5a3a22', boots: '#3b2a1a' }, season: 's4', slot: 'outfit' },
  s5_shade: { name: 'Shade', rarity: 'epic', colors: { top: '#120a1e', pants: '#0a0612', vestColor: '#2a1a40', gloves: '#c06cff', boots: '#0a0612' }, glow: '#c06cff', season: 's5', slot: 'outfit' },
  commander: { name: 'Commander', rarity: 'legendary', colors: { top: '#1d1d1f', pants: '#1d1d1f', vestColor: '#5b1a1a', gloves: '#d4a73a', boots: '#141414' }, milestone: { stat: 'wins', n: 50, label: 'Win 50 online matches' } },
};

// Calling cards: a banner shown on your profile, in party line-ups and on the kill cam.
// motif selects the artwork drawn by js/ui/cards.js.
export const CALLING_CARDS = {
  standard: { name: 'Standard Issue', rarity: 'common', colors: ['#1b2028', '#f2a33a'], motif: 'chevrons', starter: true },
  dusk: { name: 'Dusk Patrol', rarity: 'common', colors: ['#2a1f3d', '#ff8a4d'], motif: 'mountains', starter: true },
  grid: { name: 'Night Grid', rarity: 'uncommon', colors: ['#06100b', '#00ff9c'], motif: 'grid' },
  waves: { name: 'Riptide', rarity: 'uncommon', colors: ['#0c2a4a', '#3fa7d6'], motif: 'waves' },
  radar: { name: 'Radar Lock', rarity: 'rare', colors: ['#0b1a12', '#3dff8f'], motif: 'radar' },
  sunburst: { name: 'Sunburst', rarity: 'rare', colors: ['#3a1208', '#ffb03a'], motif: 'sunburst' },
  crosshair: { name: 'In The Sights', rarity: 'rare', colors: ['#14161a', '#ff4d4d'], motif: 'crosshair' },
  hazard: { name: 'Hazard Zone', rarity: 'epic', colors: ['#141414', '#e0b030'], motif: 'stripes' },
  skyline: { name: 'Skyline', rarity: 'epic', colors: ['#10162a', '#c06cff'], motif: 'skyline' },
  aurora: { name: 'Aurora', rarity: 'legendary', colors: ['#050a18', '#3ddc97', '#c06cff'], motif: 'aurora' },
  s1_contact: { name: 'First Contact', rarity: 'rare', colors: ['#11161d', '#f2a33a'], motif: 'radar', season: 's1', slot: 'card' },
  s2_whiteout: { name: 'Whiteout', rarity: 'rare', colors: ['#0d1a2a', '#bfe6ff'], motif: 'mountains', season: 's2', slot: 'card' },
  s3_canopy: { name: 'Canopy', rarity: 'rare', colors: ['#0b1a10', '#6ddc5a'], motif: 'waves', season: 's3', slot: 'card' },
  s4_mirage: { name: 'Mirage', rarity: 'rare', colors: ['#2a0a06', '#ff7a3d'], motif: 'sunburst', season: 's4', slot: 'card' },
  s5_eclipse: { name: 'Eclipse', rarity: 'rare', colors: ['#0a0614', '#c06cff'], motif: 'skyline', season: 's5', slot: 'card' },
  // Ranked rewards: win enough ranked matches in a season to earn its card.
  s1_ranked: { name: 'S1 Competitor', rarity: 'epic', colors: ['#1b2028', '#f2a33a', '#ffd48a'], motif: 'chevrons', season: 's1', rankedReward: true },
  s2_ranked: { name: 'S2 Competitor', rarity: 'epic', colors: ['#0d1a2a', '#7cc7ff', '#e8f6ff'], motif: 'chevrons', season: 's2', rankedReward: true },
  s3_ranked: { name: 'S3 Competitor', rarity: 'epic', colors: ['#0b1a10', '#6ddc5a', '#d6ffcc'], motif: 'chevrons', season: 's3', rankedReward: true },
  s4_ranked: { name: 'S4 Competitor', rarity: 'epic', colors: ['#2a0a06', '#ff7a3d', '#ffd23f'], motif: 'chevrons', season: 's4', rankedReward: true },
  s5_ranked: { name: 'S5 Competitor', rarity: 'epic', colors: ['#0a0614', '#c06cff', '#ffd6ff'], motif: 'chevrons', season: 's5', rankedReward: true },
  veteran: { name: 'Veteran', rarity: 'epic', colors: ['#1d1f18', '#c9b46a'], motif: 'chevrons', milestone: { stat: 'matches', n: 50, label: 'Play 50 online matches' } },
  headhunter: { name: 'Headhunter', rarity: 'legendary', colors: ['#1a0606', '#ff3030'], motif: 'crosshair', milestone: { stat: 'headshots', n: 250, label: 'Land 250 headshot kills' } },
};

// Effects that play where your victim falls. Everyone in the match sees them.
export const KILL_FX = {
  none: { name: 'None', rarity: 'common', starter: true },
  sparks: { name: 'Spark Shower', rarity: 'uncommon', color: '#ffd27a' },
  smoke: { name: 'Smoke Ring', rarity: 'uncommon', color: '#9aa4ad' },
  confetti: { name: 'Confetti', rarity: 'rare', color: '#ff4d6d' },
  shock: { name: 'Shockwave', rarity: 'rare', color: '#4ea3ff' },
  embers: { name: 'Ember Burst', rarity: 'epic', color: '#ff6a1f' },
  glitch: { name: 'Glitch', rarity: 'epic', color: '#27e0ff' },
  lightning: { name: 'Lightning', rarity: 'legendary', color: '#c6d8ff' },
  coins: { name: 'Jackpot', rarity: 'legendary', color: '#ffd23f', milestone: { stat: 'kills', n: 1000, label: 'Get 1,000 kills online' } },
};

// Emotes play on your operator; hold G in a match for the emote wheel.
export const EMOTES = {
  wave: { name: 'Wave', rarity: 'common', starter: true, dur: 2.2 },
  salute: { name: 'Salute', rarity: 'common', starter: true, dur: 2.2 },
  point: { name: 'Point', rarity: 'common', starter: true, dur: 1.8 },
  shrug: { name: 'Shrug', rarity: 'common', starter: true, dur: 1.8 },
  thumbs: { name: 'Thumbs Up', rarity: 'uncommon', dur: 1.8 },
  clap: { name: 'Slow Clap', rarity: 'uncommon', dur: 2.6 },
  facepalm: { name: 'Facepalm', rarity: 'rare', dur: 2.2 },
  dance: { name: 'Victory Dance', rarity: 'epic', dur: 3.6 },
  pushups: { name: 'Push-ups', rarity: 'legendary', dur: 3.6 },
  flex: { name: 'Flex', rarity: 'epic', dur: 2.6, milestone: { stat: 'ranked_wins', n: 25, label: 'Win 25 ranked matches' } },
};

// Inventory buckets by item kind.
export const KINDS = {
  finish: { key: 'finishes', defs: WEAPON_SKINS, label: 'Weapon finish' },
  outfit: { key: 'outfits', defs: OUTFITS, label: 'Outfit' },
  card: { key: 'cards', defs: CALLING_CARDS, label: 'Calling card' },
  effect: { key: 'effects', defs: KILL_FX, label: 'Kill effect' },
  emote: { key: 'emotes', defs: EMOTES, label: 'Emote' },
};

// Milestones are checked against profile stats (online) or local stats for guests.
export function milestoneMet(def, stats) {
  const m = def?.milestone;
  return !!(m && stats && (stats[m.stat] || 0) >= m.n);
}

// Season items can't be owned or worn before their season starts, whatever the inventory says.
// js/data/seasons.js installs the real date check (it imports this file, so it can't be imported here).
let seasonNotStarted = () => false;
export function setSeasonGate(fn) { seasonNotStarted = fn; }
export const seasonLocked = (def) => !!def?.season && seasonNotStarted(def.season);

export function owns(inv, kind, id, stats) {
  const k = KINDS[kind], def = k?.defs[id];
  if (!def || seasonLocked(def)) return false;
  if (def.starter) return true;
  if (def.milestone) return milestoneMet(def, stats);
  return (inv?.[k.key] || []).includes(id);
}

export function starterInventory() {
  const out = {};
  for (const k of Object.values(KINDS)) out[k.key] = Object.keys(k.defs).filter((id) => k.defs[id].starter);
  return out;
}

export function normalizeInventory(inv) {
  const base = starterInventory(), out = {};
  for (const k of Object.values(KINDS)) {
    out[k.key] = [...new Set([...base[k.key], ...((inv && inv[k.key]) || []).filter((id) => k.defs[id] && !k.defs[id].milestone)])];
  }
  return out;
}

// Rolls one random item. Already-owned items are skipped where possible so drops feel fresh.
// Milestone and season items never drop.
export function rollDrop(inv, rng = Math.random) {
  const pool = [];
  for (const [kind, k] of Object.entries(KINDS)) {
    for (const [id, d] of Object.entries(k.defs)) if (!d.starter && !d.milestone && !d.season) pool.push({ kind, id, rarity: d.rarity, name: d.name });
  }
  const owned = (it) => (inv[KINDS[it.kind].key] || []).includes(it.id);
  const fresh = pool.filter((it) => !owned(it));
  const candidates = fresh.length ? fresh : pool;
  const total = candidates.reduce((a, it) => a + RARITIES[it.rarity].weight, 0);
  let r = rng() * total;
  for (const it of candidates) { r -= RARITIES[it.rarity].weight; if (r <= 0) return { ...it, duplicate: !fresh.length }; }
  return { ...candidates[0], duplicate: !fresh.length };
}

export function addToInventory(inv, item) {
  const key = KINDS[item.kind]?.key;
  if (!key) return inv;
  if (!inv[key]) inv[key] = [];
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
    case 'fade': return `linear-gradient(160deg, ${p.join(', ')})`;
    case 'hex': return `radial-gradient(circle, ${p[1]} 30%, transparent 32%) 0 0/12px 12px, ${p[0]}`;
    case 'marble': return `linear-gradient(115deg, ${p[0]} 40%, ${p[1]} 42%, ${p[0]} 44%, ${p[0]} 70%, ${p[1]} 71%, ${p[0]} 73%)`;
    case 'damascus': return `repeating-radial-gradient(ellipse at 30% 40%, ${p[0]} 0 4px, ${p[1]} 5px 6px)`;
    case 'circuit': return `linear-gradient(90deg, transparent 45%, ${p[1]} 46% 48%, transparent 49%) 0 0/16px 16px, linear-gradient(transparent 70%, ${p[1]} 71% 73%, transparent 74%) 0 0/16px 16px, ${p[0]}`;
    case 'splatter': return `radial-gradient(circle at 30% 40%, ${p[1]} 14%, transparent 15%), radial-gradient(circle at 70% 60%, ${p[2]} 12%, transparent 13%), radial-gradient(circle at 55% 25%, ${p[3]} 9%, transparent 10%), radial-gradient(circle at 25% 75%, ${p[4]} 10%, transparent 11%), ${p[0]}`;
    default: return p[0] || '#333';
  }
}

export function outfitSwatch(id) {
  const c = OUTFITS[id]?.colors || {};
  if (!c.top) return 'linear-gradient(135deg, #3a4658, #2b2f33)';
  return `linear-gradient(135deg, ${c.top} 0 40%, ${c.vestColor} 40% 70%, ${c.pants} 70%)`;
}
