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
  { title: 'Pistols', items: ['p9', 'magnum'] },
  { title: 'SMG & Heavy', items: ['vex', 'breacher'] },
  { title: 'Rifles', items: ['ar7', 'm5', 'longshot'] },
  { title: 'Gear', items: ['kevlar', 'helmet'] },
  { title: 'Grenades', items: ['he', 'smoke'] },
];

export const ECON = {
  start: 800, max: 16000,
  winElim: 3250, winBomb: 3500, winDefuse: 3500,
  lossBase: 1400, lossStep: 500, lossMax: 3400,
  plant: 300,
};

export function itemInfo(id) {
  return WEAPONS[id] || GRENADES[id] || GEAR[id] || null;
}
