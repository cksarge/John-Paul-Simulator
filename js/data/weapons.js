// Weapon stats. Distances in metres, times in seconds, spread in radians.
// rangeMod: damage multiplier applied per 12.5 m travelled.
export const WEAPONS = {
  knife: {
    id: 'knife', name: 'Field Knife', slot: 'melee', type: 'knife',
    damage: 40, altDamage: 65, backstab: 2.5, fireRate: 0.42, altRate: 1.0, range: 2.0,
    moveSpeed: 1.0, price: 0, killReward: 1500,
  },
  p9: {
    id: 'p9', name: 'P9 Sidearm', slot: 'secondary', type: 'pistol',
    damage: 28, hsMult: 4, legMult: 0.75, armorPen: 0.5, rangeMod: 0.86,
    fireRate: 0.15, auto: false, mag: 12, reserve: 48, reload: 2.1, draw: 0.6,
    spread: 0.004, moveSpread: 0.03, airSpread: 0.12, spreadPerShot: 0.012, spreadRecover: 0.25,
    recoil: 0.018, recoilYaw: 0.006, moveSpeed: 0.98, price: 200, killReward: 300,
  },
  magnum: {
    id: 'magnum', name: 'Magnum .50', slot: 'secondary', type: 'pistol',
    damage: 56, hsMult: 3.8, legMult: 0.75, armorPen: 0.9, rangeMod: 0.82,
    fireRate: 0.32, auto: false, mag: 7, reserve: 35, reload: 2.2, draw: 0.75,
    spread: 0.004, moveSpread: 0.06, airSpread: 0.16, spreadPerShot: 0.035, spreadRecover: 0.45,
    recoil: 0.05, recoilYaw: 0.012, moveSpeed: 0.96, price: 700, killReward: 300,
  },
  vex: {
    id: 'vex', name: 'Vex SMG', slot: 'primary', type: 'smg',
    damage: 27, hsMult: 3, legMult: 0.75, armorPen: 0.6, rangeMod: 0.82,
    fireRate: 0.075, auto: true, mag: 30, reserve: 120, reload: 2.2, draw: 0.6,
    spread: 0.008, moveSpread: 0.015, airSpread: 0.1, spreadPerShot: 0.004, spreadRecover: 0.3,
    recoil: 0.009, recoilYaw: 0.005, moveSpeed: 0.95, price: 1250, killReward: 600,
  },
  breacher: {
    id: 'breacher', name: 'Breacher 12', slot: 'primary', type: 'shotgun',
    damage: 21, pellets: 9, hsMult: 2, legMult: 0.75, armorPen: 0.75, rangeMod: 0.6,
    fireRate: 0.85, auto: false, mag: 7, reserve: 32, reload: 2.9, draw: 0.8,
    spread: 0.055, moveSpread: 0.01, airSpread: 0.05, spreadPerShot: 0, spreadRecover: 0.3,
    recoil: 0.06, recoilYaw: 0.01, moveSpeed: 0.93, price: 1100, killReward: 900,
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
  longshot: {
    id: 'longshot', name: 'Longshot AWR', slot: 'primary', type: 'sniper',
    damage: 115, hsMult: 4, legMult: 0.75, armorPen: 0.97, rangeMod: 0.99,
    fireRate: 1.45, auto: false, mag: 5, reserve: 30, reload: 3.6, draw: 1.1,
    spread: 0.09, scopedSpread: 0.0004, moveSpread: 0.12, airSpread: 0.3, spreadPerShot: 0, spreadRecover: 0.5,
    recoil: 0.08, recoilYaw: 0.01, moveSpeed: 0.8, scope: [40, 15], price: 4750, killReward: 100,
  },
  viper: {
    id: 'viper', name: 'Viper Machine Pistol', slot: 'secondary', type: 'pistol',
    damage: 22, hsMult: 3.6, legMult: 0.75, armorPen: 0.45, rangeMod: 0.8,
    fireRate: 0.065, auto: true, mag: 18, reserve: 72, reload: 2.0, draw: 0.55,
    spread: 0.009, moveSpread: 0.02, airSpread: 0.1, spreadPerShot: 0.006, spreadRecover: 0.3,
    recoil: 0.011, recoilYaw: 0.008, moveSpeed: 0.98, price: 500, killReward: 300,
  },
  tac45: {
    id: 'tac45', name: 'Tac-45', slot: 'secondary', type: 'pistol',
    damage: 34, hsMult: 3.8, legMult: 0.75, armorPen: 0.6, rangeMod: 0.84,
    fireRate: 0.2, auto: false, mag: 10, reserve: 40, reload: 2.0, draw: 0.6,
    spread: 0.0035, moveSpread: 0.035, airSpread: 0.13, spreadPerShot: 0.018, spreadRecover: 0.3,
    recoil: 0.026, recoilYaw: 0.008, moveSpeed: 0.97, price: 400, killReward: 300,
  },
  kestrel: {
    id: 'kestrel', name: 'Kestrel PDW', slot: 'primary', type: 'smg',
    damage: 24, hsMult: 3, legMult: 0.75, armorPen: 0.65, rangeMod: 0.84,
    fireRate: 0.06, auto: true, mag: 40, reserve: 120, reload: 2.4, draw: 0.6,
    spread: 0.007, moveSpread: 0.012, airSpread: 0.09, spreadPerShot: 0.0035, spreadRecover: 0.28,
    recoil: 0.008, recoilYaw: 0.006, moveSpeed: 0.96, price: 1500, killReward: 600,
  },
  reaper: {
    id: 'reaper', name: 'Reaper Auto-12', slot: 'primary', type: 'shotgun',
    damage: 17, pellets: 8, hsMult: 2, legMult: 0.75, armorPen: 0.7, rangeMod: 0.55,
    fireRate: 0.26, auto: true, mag: 8, reserve: 32, reload: 3.2, draw: 0.85,
    spread: 0.065, moveSpread: 0.01, airSpread: 0.05, spreadPerShot: 0.004, spreadRecover: 0.3,
    recoil: 0.04, recoilYaw: 0.012, moveSpeed: 0.9, price: 2000, killReward: 900,
  },
  bulldog: {
    id: 'bulldog', name: 'Bulldog LMG', slot: 'primary', type: 'lmg',
    damage: 33, hsMult: 3.5, legMult: 0.75, armorPen: 0.75, rangeMod: 0.97,
    fireRate: 0.085, auto: true, mag: 100, reserve: 100, reload: 5.0, draw: 1.1,
    spread: 0.006, moveSpread: 0.09, airSpread: 0.2, spreadPerShot: 0.0035, spreadRecover: 0.45,
    recoil: 0.012, recoilYaw: 0.011, moveSpeed: 0.8, price: 5000, killReward: 300,
  },
  trident: {
    id: 'trident', name: 'Trident Burst', slot: 'primary', type: 'rifle',
    damage: 34, hsMult: 4, legMult: 0.75, armorPen: 0.72, rangeMod: 0.97,
    fireRate: 0.07, burst: 3, burstDelay: 0.32, auto: false, mag: 30, reserve: 90, reload: 2.7, draw: 0.9,
    spread: 0.0022, moveSpread: 0.065, airSpread: 0.15, spreadPerShot: 0.003, spreadRecover: 0.32,
    recoil: 0.013, recoilYaw: 0.005, moveSpeed: 0.88, price: 2500, killReward: 300,
  },
  falcon: {
    id: 'falcon', name: 'Falcon DMR', slot: 'primary', type: 'rifle',
    damage: 62, hsMult: 3.3, legMult: 0.75, armorPen: 0.82, rangeMod: 0.99,
    fireRate: 0.3, auto: false, mag: 15, reserve: 45, reload: 2.9, draw: 1.0,
    spread: 0.0015, moveSpread: 0.09, airSpread: 0.2, spreadPerShot: 0.012, spreadRecover: 0.4,
    recoil: 0.035, recoilYaw: 0.006, moveSpeed: 0.86, scope: [55], scopedSpread: 0.0008, price: 3800, killReward: 300,
  },
  sparrow: {
    id: 'sparrow', name: 'Sparrow Scout', slot: 'primary', type: 'sniper',
    damage: 78, hsMult: 3.4, legMult: 0.75, armorPen: 0.85, rangeMod: 0.99,
    fireRate: 1.2, auto: false, mag: 10, reserve: 30, reload: 2.8, draw: 0.9,
    spread: 0.05, scopedSpread: 0.0004, moveSpread: 0.05, airSpread: 0.02, spreadPerShot: 0, spreadRecover: 0.4,
    recoil: 0.05, recoilYaw: 0.008, moveSpeed: 0.95, scope: [40, 15], price: 1700, killReward: 300,
  },
};

export const GRENADES = {
  he: { id: 'he', name: 'Frag Grenade', price: 300, damage: 98, radius: 6.5, fuse: 1.6 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, radius: 4.2, duration: 16, fuse: 1.6 },
};

export const GEAR = {
  kevlar: { id: 'kevlar', name: 'Kevlar Vest', price: 650 },
  helmet: { id: 'helmet', name: 'Kevlar + Helmet', price: 1000 },
};

export const BUY_MENU = [
  { title: 'Pistols', items: ['p9', 'tac45', 'viper', 'magnum'] },
  { title: 'SMG & Heavy', items: ['vex', 'kestrel', 'breacher', 'reaper', 'bulldog'] },
  { title: 'Rifles', items: ['trident', 'ar7', 'm5', 'falcon', 'sparrow', 'longshot'] },
  { title: 'Gear', items: ['kevlar', 'helmet'] },
  { title: 'Grenades', items: ['he', 'smoke'] },
];

export const ECON = {
  start: 800, max: 16000,
  winElim: 3250, winBomb: 3500, winDefuse: 3500,
  lossBase: 1400, lossStep: 500, lossMax: 3400,
  plant: 300,
};

// Weapon order for Gun Game: every kill advances you one step; a knife kill on the last step wins.
export const GUN_GAME_ORDER = ['bulldog', 'ar7', 'm5', 'trident', 'falcon', 'kestrel', 'vex', 'reaper', 'breacher', 'sparrow', 'longshot', 'magnum', 'tac45', 'viper', 'p9', 'knife'];

export function itemInfo(id) {
  return WEAPONS[id] || GRENADES[id] || GEAR[id] || null;
}
