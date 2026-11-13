// Weapon stats. Distances in metres, times in seconds, spread in radians.
// rangeMod: damage multiplier applied per 12.5 m travelled.
// type is the weapon class shown in the buy menu: pistol · smg · shotgun · rifle · lmg · sniper · knife · other.
const knife = (id, name, o) => ({ id, name, slot: 'melee', type: 'knife', backstab: 2.5, moveSpeed: 1.0, price: 0, killReward: 1500, ...o });

export const WEAPONS = {
  // ───────── knives ─────────
  knife: knife('knife', 'Field Knife', { damage: 40, altDamage: 65, fireRate: 0.42, altRate: 1.0, range: 2.0 }),
  karambit: knife('karambit', 'Karambit', { damage: 34, altDamage: 58, fireRate: 0.3, altRate: 0.8, range: 1.8, moveSpeed: 1.03 }),
  machete: knife('machete', 'Machete', { damage: 50, altDamage: 82, fireRate: 0.56, altRate: 1.15, range: 2.6, moveSpeed: 0.98 }),
  hatchet: knife('hatchet', 'Breaching Hatchet', { damage: 55, altDamage: 101, fireRate: 0.7, altRate: 1.4, range: 2.1, backstab: 2, moveSpeed: 0.97 }),

  // ───────── pistols ─────────
  p9: {
    id: 'p9', name: 'P9 Sidearm', slot: 'secondary', type: 'pistol',
    damage: 28, hsMult: 4, legMult: 0.75, armorPen: 0.5, rangeMod: 0.86,
    fireRate: 0.15, auto: false, mag: 12, reserve: 48, reload: 2.1, draw: 0.6,
    spread: 0.004, moveSpread: 0.03, airSpread: 0.12, spreadPerShot: 0.012, spreadRecover: 0.25,
    recoil: 0.018, recoilYaw: 0.006, moveSpeed: 0.98, price: 200, killReward: 300,
  },
  tac45: {
    id: 'tac45', name: 'Tac-45', slot: 'secondary', type: 'pistol',
    damage: 34, hsMult: 3.8, legMult: 0.75, armorPen: 0.6, rangeMod: 0.84,
    fireRate: 0.2, auto: false, mag: 10, reserve: 40, reload: 2.0, draw: 0.6,
    spread: 0.0035, moveSpread: 0.035, airSpread: 0.13, spreadPerShot: 0.018, spreadRecover: 0.3,
    recoil: 0.026, recoilYaw: 0.008, moveSpeed: 0.97, price: 400, killReward: 300,
  },
  viper: {
    id: 'viper', name: 'Viper Machine Pistol', slot: 'secondary', type: 'pistol',
    damage: 22, hsMult: 3.6, legMult: 0.75, armorPen: 0.45, rangeMod: 0.8,
    fireRate: 0.065, auto: true, mag: 18, reserve: 72, reload: 2.0, draw: 0.55,
    spread: 0.009, moveSpread: 0.02, airSpread: 0.1, spreadPerShot: 0.006, spreadRecover: 0.3,
    recoil: 0.011, recoilYaw: 0.008, moveSpeed: 0.98, price: 500, killReward: 300,
  },
  magnum: {
    id: 'magnum', name: 'Magnum .50', slot: 'secondary', type: 'pistol',
    damage: 56, hsMult: 3.8, legMult: 0.75, armorPen: 0.9, rangeMod: 0.82,
    fireRate: 0.32, auto: false, mag: 7, reserve: 35, reload: 2.2, draw: 0.75,
    spread: 0.004, moveSpread: 0.06, airSpread: 0.16, spreadPerShot: 0.035, spreadRecover: 0.45,
    recoil: 0.05, recoilYaw: 0.012, moveSpeed: 0.96, price: 700, killReward: 300,
  },

  // ───────── SMGs ─────────
  hornet: {
    id: 'hornet', name: 'Hornet SMG', slot: 'primary', type: 'smg',
    damage: 22, hsMult: 3, legMult: 0.75, armorPen: 0.55, rangeMod: 0.8,
    fireRate: 0.055, auto: true, mag: 32, reserve: 128, reload: 2.0, draw: 0.5,
    spread: 0.009, moveSpread: 0.012, airSpread: 0.09, spreadPerShot: 0.004, spreadRecover: 0.28,
    recoil: 0.008, recoilYaw: 0.007, moveSpeed: 0.97, price: 1050, killReward: 600,
  },
  vex: {
    id: 'vex', name: 'Vex SMG', slot: 'primary', type: 'smg',
    damage: 27, hsMult: 3, legMult: 0.75, armorPen: 0.6, rangeMod: 0.82,
    fireRate: 0.075, auto: true, mag: 30, reserve: 120, reload: 2.2, draw: 0.6,
    spread: 0.008, moveSpread: 0.015, airSpread: 0.1, spreadPerShot: 0.004, spreadRecover: 0.3,
    recoil: 0.009, recoilYaw: 0.005, moveSpeed: 0.95, price: 1250, killReward: 600,
  },
  mako: {
    id: 'mako', name: 'Mako .45', slot: 'primary', type: 'smg',
    damage: 32, hsMult: 3.2, legMult: 0.75, armorPen: 0.62, rangeMod: 0.84,
    fireRate: 0.1, auto: true, mag: 25, reserve: 100, reload: 2.3, draw: 0.6,
    spread: 0.006, moveSpread: 0.016, airSpread: 0.1, spreadPerShot: 0.0045, spreadRecover: 0.3,
    recoil: 0.012, recoilYaw: 0.006, moveSpeed: 0.95, price: 1400, killReward: 600,
  },
  kestrel: {
    id: 'kestrel', name: 'Kestrel PDW', slot: 'primary', type: 'smg',
    damage: 24, hsMult: 3, legMult: 0.75, armorPen: 0.65, rangeMod: 0.84,
    fireRate: 0.06, auto: true, mag: 40, reserve: 120, reload: 2.4, draw: 0.6,
    spread: 0.007, moveSpread: 0.012, airSpread: 0.09, spreadPerShot: 0.0035, spreadRecover: 0.28,
    recoil: 0.008, recoilYaw: 0.006, moveSpeed: 0.96, price: 1500, killReward: 600,
  },

  // ───────── shotguns ─────────
  coach: {
    id: 'coach', name: 'Coach Double-Barrel', slot: 'primary', type: 'shotgun',
    damage: 22, pellets: 11, hsMult: 2, legMult: 0.75, armorPen: 0.75, rangeMod: 0.55,
    fireRate: 0.22, auto: false, mag: 2, reserve: 30, reload: 2.4, draw: 0.7,
    spread: 0.07, moveSpread: 0.01, airSpread: 0.05, spreadPerShot: 0, spreadRecover: 0.3,
    recoil: 0.08, recoilYaw: 0.014, moveSpeed: 0.95, price: 1000, killReward: 900,
  },
  breacher: {
    id: 'breacher', name: 'Breacher 12', slot: 'primary', type: 'shotgun',
    damage: 21, pellets: 9, hsMult: 2, legMult: 0.75, armorPen: 0.75, rangeMod: 0.6,
    fireRate: 0.85, auto: false, mag: 7, reserve: 32, reload: 2.9, draw: 0.8,
    spread: 0.055, moveSpread: 0.01, airSpread: 0.05, spreadPerShot: 0, spreadRecover: 0.3,
    recoil: 0.06, recoilYaw: 0.01, moveSpeed: 0.93, price: 1100, killReward: 900,
  },
  striker: {
    id: 'striker', name: 'Striker Drum', slot: 'primary', type: 'shotgun',
    damage: 16, pellets: 8, hsMult: 2, legMult: 0.75, armorPen: 0.7, rangeMod: 0.58,
    fireRate: 0.3, auto: false, mag: 12, reserve: 36, reload: 3.6, draw: 0.85,
    spread: 0.06, moveSpread: 0.01, airSpread: 0.05, spreadPerShot: 0.003, spreadRecover: 0.3,
    recoil: 0.045, recoilYaw: 0.012, moveSpeed: 0.92, price: 1700, killReward: 900,
  },
  reaper: {
    id: 'reaper', name: 'Reaper Auto-12', slot: 'primary', type: 'shotgun',
    damage: 17, pellets: 8, hsMult: 2, legMult: 0.75, armorPen: 0.7, rangeMod: 0.55,
    fireRate: 0.26, auto: true, mag: 8, reserve: 32, reload: 3.2, draw: 0.85,
    spread: 0.065, moveSpread: 0.01, airSpread: 0.05, spreadPerShot: 0.004, spreadRecover: 0.3,
    recoil: 0.04, recoilYaw: 0.012, moveSpeed: 0.9, price: 2000, killReward: 900,
  },

  // ───────── rifles ─────────
  trident: {
    id: 'trident', name: 'Trident Burst', slot: 'primary', type: 'rifle',
    damage: 34, hsMult: 4, legMult: 0.75, armorPen: 0.72, rangeMod: 0.97,
    fireRate: 0.07, burst: 3, burstDelay: 0.32, auto: false, mag: 30, reserve: 90, reload: 2.7, draw: 0.9,
    spread: 0.0022, moveSpread: 0.065, airSpread: 0.15, spreadPerShot: 0.003, spreadRecover: 0.32,
    recoil: 0.013, recoilYaw: 0.005, moveSpeed: 0.88, price: 2500, killReward: 300,
  },
  ar7: {
    id: 'ar7', name: 'AR-7 Vanguard', slot: 'primary', type: 'rifle',
    damage: 36, hsMult: 4, legMult: 0.75, armorPen: 0.78, rangeMod: 0.98,
    fireRate: 0.1, auto: true, mag: 30, reserve: 90, reload: 2.5, draw: 0.9,
    spread: 0.0025, moveSpread: 0.07, airSpread: 0.16, spreadPerShot: 0.0045, spreadRecover: 0.38,
    recoil: 0.016, recoilYaw: 0.009, moveSpeed: 0.86, price: 2700, killReward: 300,
  },
  m5: {
    id: 'm5', name: 'M5 Carbine', slot: 'primary', type: 'rifle',
    damage: 32, hsMult: 4, legMult: 0.75, armorPen: 0.7, rangeMod: 0.97,
    fireRate: 0.09, auto: true, mag: 30, reserve: 90, reload: 3.0, draw: 0.9,
    spread: 0.002, moveSpread: 0.06, airSpread: 0.15, spreadPerShot: 0.0035, spreadRecover: 0.35,
    recoil: 0.012, recoilYaw: 0.007, moveSpeed: 0.9, price: 2900, killReward: 300,
  },
  falcon: {
    id: 'falcon', name: 'Falcon DMR', slot: 'primary', type: 'rifle',
    damage: 62, hsMult: 3.3, legMult: 0.75, armorPen: 0.82, rangeMod: 0.99,
    fireRate: 0.3, auto: false, mag: 15, reserve: 45, reload: 2.9, draw: 1.0,
    spread: 0.0015, moveSpread: 0.09, airSpread: 0.2, spreadPerShot: 0.012, spreadRecover: 0.4,
    recoil: 0.035, recoilYaw: 0.006, moveSpeed: 0.86, scope: [55], scopedSpread: 0.0008, price: 3800, killReward: 300,
  },

  // ───────── LMGs ─────────
  mauler: {
    id: 'mauler', name: 'Mauler Bullpup LMG', slot: 'primary', type: 'lmg',
    damage: 31, hsMult: 3.5, legMult: 0.75, armorPen: 0.74, rangeMod: 0.96,
    fireRate: 0.08, auto: true, mag: 80, reserve: 80, reload: 4.2, draw: 1.0,
    spread: 0.005, moveSpread: 0.08, airSpread: 0.2, spreadPerShot: 0.003, spreadRecover: 0.42,
    recoil: 0.011, recoilYaw: 0.01, moveSpeed: 0.84, price: 3900, killReward: 300,
  },
  hailstorm: {
    id: 'hailstorm', name: 'Hailstorm Minigun-Lite', slot: 'primary', type: 'lmg',
    damage: 27, hsMult: 3.2, legMult: 0.75, armorPen: 0.7, rangeMod: 0.94,
    fireRate: 0.06, auto: true, mag: 150, reserve: 150, reload: 5.6, draw: 1.3,
    spread: 0.008, moveSpread: 0.1, airSpread: 0.22, spreadPerShot: 0.0025, spreadRecover: 0.5,
    recoil: 0.009, recoilYaw: 0.012, moveSpeed: 0.78, price: 4600, killReward: 300,
  },
  bulldog: {
    id: 'bulldog', name: 'Bulldog LMG', slot: 'primary', type: 'lmg',
    damage: 33, hsMult: 3.5, legMult: 0.75, armorPen: 0.75, rangeMod: 0.97,
    fireRate: 0.085, auto: true, mag: 100, reserve: 100, reload: 5.0, draw: 1.1,
    spread: 0.006, moveSpread: 0.09, airSpread: 0.2, spreadPerShot: 0.0035, spreadRecover: 0.45,
    recoil: 0.012, recoilYaw: 0.011, moveSpeed: 0.8, price: 5000, killReward: 300,
  },
  anvil: {
    id: 'anvil', name: 'Anvil Heavy MG', slot: 'primary', type: 'lmg',
    damage: 42, hsMult: 3.4, legMult: 0.75, armorPen: 0.85, rangeMod: 0.98,
    fireRate: 0.115, auto: true, mag: 75, reserve: 75, reload: 5.4, draw: 1.3,
    spread: 0.006, moveSpread: 0.11, airSpread: 0.22, spreadPerShot: 0.004, spreadRecover: 0.5,
    recoil: 0.018, recoilYaw: 0.012, moveSpeed: 0.76, price: 5400, killReward: 300,
  },

  // ───────── snipers ─────────
  sparrow: {
    id: 'sparrow', name: 'Sparrow Scout', slot: 'primary', type: 'sniper',
    damage: 78, hsMult: 3.4, legMult: 0.75, armorPen: 0.85, rangeMod: 0.99,
    fireRate: 1.2, auto: false, mag: 10, reserve: 30, reload: 2.8, draw: 0.9,
    spread: 0.05, scopedSpread: 0.0004, moveSpread: 0.05, airSpread: 0.02, spreadPerShot: 0, spreadRecover: 0.4,
    recoil: 0.05, recoilYaw: 0.008, moveSpeed: 0.95, scope: [40, 15], price: 1700, killReward: 300,
  },
  kodiak: {
    id: 'kodiak', name: 'Kodiak .338', slot: 'primary', type: 'sniper',
    damage: 92, hsMult: 4, legMult: 0.75, armorPen: 0.88, rangeMod: 0.99,
    fireRate: 1.3, auto: false, mag: 6, reserve: 24, reload: 3.1, draw: 1.0,
    spread: 0.07, scopedSpread: 0.0005, moveSpread: 0.09, airSpread: 0.25, spreadPerShot: 0, spreadRecover: 0.45,
    recoil: 0.065, recoilYaw: 0.01, moveSpeed: 0.86, scope: [40, 15], price: 3300, killReward: 300,
  },
  warden: {
    id: 'warden', name: 'Warden Auto-Sniper', slot: 'primary', type: 'sniper',
    damage: 80, hsMult: 3.6, legMult: 0.75, armorPen: 0.85, rangeMod: 0.99,
    fireRate: 0.26, auto: false, mag: 20, reserve: 60, reload: 3.4, draw: 1.1,
    spread: 0.08, scopedSpread: 0.0012, moveSpread: 0.12, airSpread: 0.3, spreadPerShot: 0.004, spreadRecover: 0.4,
    recoil: 0.04, recoilYaw: 0.009, moveSpeed: 0.8, scope: [40, 15], keepScope: true, price: 5000, killReward: 300,
  },
  // The AWP: one shot to the head or body at any range, through armour. (Id kept as 'longshot' so
  // saved skins and loadouts still apply.) 115 × armorPen 0.97 ≥ 100 and rangeMod 1 means no falloff.
  longshot: {
    id: 'longshot', name: 'AWP', slot: 'primary', type: 'sniper',
    damage: 115, hsMult: 4, legMult: 0.75, armorPen: 0.97, rangeMod: 1,
    fireRate: 1.45, auto: false, mag: 5, reserve: 30, reload: 3.6, draw: 1.1,
    spread: 0.09, scopedSpread: 0.0004, moveSpread: 0.12, airSpread: 0.3, spreadPerShot: 0, spreadRecover: 0.5,
    recoil: 0.08, recoilYaw: 0.01, moveSpeed: 0.8, scope: [40, 15], price: 4750, killReward: 100,
  },

  // ───────── other ─────────
  nailer: {
    id: 'nailer', name: 'Nail Driver', slot: 'primary', type: 'other',
    damage: 21, hsMult: 3, legMult: 0.75, armorPen: 0.5, rangeMod: 0.72,
    fireRate: 0.07, auto: true, mag: 50, reserve: 150, reload: 3.0, draw: 0.7,
    spread: 0.012, moveSpread: 0.015, airSpread: 0.1, spreadPerShot: 0.003, spreadRecover: 0.3,
    recoil: 0.007, recoilYaw: 0.006, moveSpeed: 0.95, price: 1600, killReward: 600,
  },
  crossbow: {
    id: 'crossbow', name: 'Ranger Crossbow', slot: 'primary', type: 'other',
    damage: 95, hsMult: 3, legMult: 0.75, armorPen: 0.9, rangeMod: 0.99,
    fireRate: 0.3, auto: false, mag: 1, reserve: 12, reload: 1.7, draw: 0.8,
    spread: 0.0012, moveSpread: 0.04, airSpread: 0.12, spreadPerShot: 0, spreadRecover: 0.3,
    recoil: 0.03, recoilYaw: 0.004, moveSpeed: 0.93, scope: [50], price: 2300, killReward: 600, silent: true,
  },
  thumper: {
    id: 'thumper', name: 'Thumper Launcher', slot: 'primary', type: 'other',
    projectile: 'gl', fireRate: 0.4, auto: false, mag: 1, reserve: 5, reload: 2.6, draw: 1.0,
    recoil: 0.07, recoilYaw: 0.01, moveSpeed: 0.85, price: 3500, killReward: 300,
  },
  rail: {
    id: 'rail', name: 'Arc Rail', slot: 'primary', type: 'other',
    damage: 88, hsMult: 2.5, legMult: 0.8, armorPen: 1, rangeMod: 1, pierce: true,
    fireRate: 1.15, auto: false, mag: 4, reserve: 16, reload: 3.2, draw: 1.1,
    spread: 0.0008, moveSpread: 0.06, airSpread: 0.2, spreadPerShot: 0, spreadRecover: 0.4,
    recoil: 0.06, recoilYaw: 0.006, moveSpeed: 0.84, price: 4200, killReward: 300,
  },
};

// Thrown utility. `explosive` marks blast damage (Blast Suit reduces it).
export const GRENADES = {
  he: { id: 'he', name: 'Frag Grenade', short: 'Frag', price: 300, damage: 98, radius: 6.5, fuse: 1.6, explosive: true },
  flash: { id: 'flash', name: 'Flashbang', short: 'Flash', price: 200, radius: 22, fuse: 1.4, blind: 4.5 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', short: 'Smoke', price: 300, radius: 4.2, duration: 16, fuse: 1.6 },
  fire: { id: 'fire', name: 'Incendiary', short: 'Fire', price: 500, radius: 3.3, duration: 7, dps: 34, fuse: 2.2 },
  mine: { id: 'mine', name: 'Proximity Mine', short: 'Mine', price: 400, damage: 125, radius: 4.5, trigger: 2.3, arm: 1.5, explosive: true },
  decoy: { id: 'decoy', name: 'Decoy', short: 'Decoy', price: 100, duration: 12, fuse: 1.5 },
};

// Projectiles fired by weapons. They share grenade physics and detonate on impact.
export const PROJECTILES = {
  gl: { id: 'gl', name: 'Thumper round', damage: 115, radius: 5, fuse: 4, explosive: true, impact: true, speed: 34, weapon: 'thumper' },
};
export const nadeDef = (kind) => GRENADES[kind] || PROJECTILES[kind] || null;

export const GEAR = {
  kevlar: { id: 'kevlar', name: 'Kevlar Vest', price: 650 },
  helmet: { id: 'helmet', name: 'Kevlar + Helmet', price: 1000 },
};

// Buy menu sections, derived from each weapon's class so new weapons can't be left out.
const CLASSES = [['pistol', 'Pistols'], ['smg', 'SMGs'], ['shotgun', 'Shotguns'], ['rifle', 'Rifles'], ['lmg', 'LMGs'], ['sniper', 'Snipers'], ['knife', 'Knives'], ['other', 'Other']];
export const CLASS_NAMES = Object.fromEntries(CLASSES);
export const BUY_MENU = [
  ...CLASSES.map(([type, title]) => ({ title, items: Object.values(WEAPONS).filter((w) => w.type === type).map((w) => w.id) })),
  { title: 'Gear', items: ['kevlar', 'helmet'] },
  { title: 'Grenades', items: Object.keys(GRENADES) },
];

// Bomb defusal economy.
export const ECON = {
  start: 800, max: 16000,
  winElim: 3250, winBomb: 3500, winDefuse: 3500,
  lossBase: 1400, lossStep: 500, lossMax: 3400,
  plant: 300,
};
// Smaller economy for 1v1s: a round win buys a rifle, a loss usually means an SMG or a save.
export const DUEL_ECON = {
  start: 900, max: 10000,
  winElim: 2900, winBomb: 2900, winDefuse: 2900,
  lossBase: 1500, lossStep: 400, lossMax: 2700,
  plant: 0,
};

// Weapon order for Gun Game: every kill advances you one step; a knife kill on the last step wins.
export const GUN_GAME_ORDER = [
  'anvil', 'ar7', 'm5', 'rail', 'trident', 'falcon', 'mauler', 'kestrel', 'mako', 'nailer', 'reaper', 'coach',
  'breacher', 'warden', 'longshot', 'sparrow', 'crossbow', 'magnum', 'tac45', 'p9', 'knife',
];

export function itemInfo(id) {
  return WEAPONS[id] || GRENADES[id] || GEAR[id] || PROJECTILES[id] || null;
}
export const isKnife = (id) => WEAPONS[id]?.type === 'knife';
