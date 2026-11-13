// Maps are grids of 2 m cells. Every cell starts as wall ('#'); ops carve floor and place props.
// Op: [char, x0, y0, x1, y1] fills the inclusive rectangle.
// Chars: '.' floor · '#' wall · 'X' alt wall · 'h' half wall · 'c' crate (1 m) · 'C' tall crate (2 m)
//        'M' shipping container · '1'..'4' raised platform (0.5 m per step)
//        '5'..'8' tall platforms / catwalks (2.5–4 m), reached by ladder 'L' (a floor cell beside the platform)
//        'D' sliding door · 'G' breakable glass pane · 'B' explosive barrels · 'A' ammo crate
//        'W' wooden barricade · 'k' wooden crate (both can be shot through and destroyed)
// Every map keeps the two spawn zones out of each other's sight (walls in front of each spawn).
// theme.decor drives the generated dressing in engine/decor.js.
// mirror: true adds a 180°-rotated copy of every op (fair symmetric small maps).
export const MAPS = {
  vault: {
    id: 'vault', name: 'Vault', size: 'small', w: 22, h: 14, mirror: true,
    desc: 'Tight concrete bunker built for duels.',
    ops: [
      ['.', 1, 1, 20, 12],
      ['X', 6, 1, 7, 3],
      ['c', 4, 9, 4, 9],
      ['h', 9, 3, 12, 3],
      ['C', 10, 6, 11, 7],
      ['2', 1, 1, 3, 2], ['1', 1, 3, 3, 3],
      ['c', 10, 1, 10, 1],
      ['c', 7, 7, 7, 7],
      // spawn screens (mirrored) so the two spawns can never see each other
      ['X', 4, 4, 4, 9],
      // props
      ['B', 10, 1, 10, 1], ['G', 6, 3, 7, 3], ['A', 1, 10, 1, 10],
      // catwalk + ladder, wooden cover
      ['6', 1, 1, 3, 2], ['L', 4, 2, 4, 2], ['k', 7, 7, 7, 7], ['W', 13, 2, 13, 2],
    ],
    spawns: [[1, 5, 2, 8], [19, 5, 20, 8]],
    theme: {
      wall: 'concrete', wall2: 'panel', half: 'concrete', floor: 'epoxy', platform: 'grate', crate: 'crate_metal', crate2: 'crate_mil', trim: 'hazard', door: 'panel',
      decor: { trim: 'hazard', skyline: 'industrial', particles: 'dust', decals: ['dirt', 'crack', 'oil', 'paint'], wall: ['lamp', 'pipe', 'vent', 'lamp'], lights: 6, lampColor: 0xd8ecff, groundColor: 0x55534e, signs: 4, signColor: '#d9a531' },
      sky: { elevation: 52, azimuth: 140, turbidity: 6, rayleigh: 1.2 },
      fog: 0x7b8794, fogDensity: 0.006, sun: 0xfff1dc, sunIntensity: 3.0, hemi: [0xbcd3ff, 0x4a4036, 0.7], exposure: 0.62,
    },
  },
  courtyard: {
    id: 'courtyard', name: 'Courtyard', size: 'small', w: 28, h: 20, mirror: true,
    desc: 'Sunlit stone plaza with a central fountain.',
    ops: [
      ['.', 1, 1, 26, 18],
      ['#', 6, 1, 9, 4],
      ['#', 6, 14, 8, 18],
      ['h', 12, 8, 15, 8], ['h', 12, 9, 12, 10],
      ['C', 13, 9, 14, 10],
      ['c', 4, 4, 4, 4],
      ['C', 10, 15, 10, 15],
      ['h', 20, 7, 20, 9],
      ['1', 1, 15, 3, 18], ['2', 1, 17, 2, 18],
      ['c', 17, 13, 17, 13],
      ['#', 5, 7, 5, 12],
      ['B', 4, 4, 4, 4], ['G', 20, 7, 20, 9], ['A', 1, 13, 1, 13],
      ['6', 1, 17, 2, 18], ['L', 3, 18, 3, 18], ['k', 17, 13, 17, 13], ['W', 11, 4, 11, 5],
    ],
    spawns: [[1, 7, 3, 12], [24, 7, 26, 12]],
    theme: {
      wall: 'brick', wall2: 'plaster', half: 'stone', floor: 'cobble', platform: 'stone', crate: 'wood', trim: 'stone', door: 'plank',
      decor: { trim: 'stone', fixture: 'stone', skyline: 'city', particles: 'dust', decals: ['dirt', 'crack', 'leaves'], wall: ['lamp', 'window', 'vine', 'awning'], lights: 4, lampColor: 0xffc27a, groundColor: 0x7a6a58, signs: 3, signColor: '#c9b48a', awning: '#2f6a5a' },
      sky: { elevation: 14, azimuth: 230, turbidity: 8, rayleigh: 2.2 },
      fog: 0xd7b48a, fogDensity: 0.0035, sun: 0xffd2a1, sunIntensity: 3.4, hemi: [0xffe2c0, 0x5a4636, 0.6], exposure: 0.55,
    },
  },
  dustline: {
    id: 'dustline', name: 'Dustline', size: 'large', w: 46, h: 42,
    desc: 'Desert town. Long A, tunnels to B, contested mid.',
    ops: [
      ['.', 17, 1, 28, 6],          // defender spawn
      ['.', 29, 2, 33, 6],          // spawn → A
      ['.', 32, 1, 44, 13],         // A site
      ['.', 12, 2, 16, 6],          // spawn → B
      ['.', 1, 1, 13, 13],          // B site
      ['.', 20, 7, 25, 34],         // mid
      ['#', 20, 9, 21, 10], ['#', 24, 9, 25, 10], // mid doors
      ['.', 17, 22, 28, 27],        // mid courtyard
      ['.', 15, 35, 30, 40],        // attacker spawn
      ['.', 40, 14, 44, 34],        // A long
      ['X', 40, 23, 41, 24],        // long doors
      ['.', 26, 32, 44, 34],        // spawn → long
      ['1', 26, 14, 31, 16],        // A short catwalk
      ['.', 30, 11, 33, 13], ['.', 32, 14, 33, 15],
      ['.', 2, 14, 6, 33],          // B tunnels
      ['X', 2, 20, 3, 21],          // tunnel choke
      ['.', 2, 30, 16, 34],         // spawn → tunnels
      ['.', 7, 18, 19, 20],         // mid → tunnels connector
      // A site props
      ['C', 37, 6, 38, 7], ['c', 41, 9, 41, 9], ['c', 35, 10, 35, 10], ['h', 34, 12, 36, 12],
      ['C', 42, 3, 42, 3], ['c', 43, 3, 43, 3], ['2', 43, 1, 44, 2],
      // B site props
      ['C', 5, 5, 6, 6], ['c', 9, 9, 9, 9], ['c', 3, 10, 3, 10], ['h', 8, 12, 10, 12],
      ['2', 1, 1, 4, 2], ['1', 1, 3, 4, 3],
      // mid / lanes
      ['c', 21, 15, 21, 15], ['c', 24, 29, 24, 29], ['C', 18, 24, 18, 24], ['C', 27, 25, 27, 25], ['h', 22, 22, 23, 22],
      ['C', 41, 17, 41, 17], ['c', 43, 28, 43, 28], ['c', 5, 25, 5, 25], ['c', 12, 19, 12, 19],
      ['c', 17, 36, 17, 36], ['c', 28, 36, 28, 36], ['c', 22, 5, 22, 5], ['c', 14, 3, 14, 3],
      // spawn screens: attackers and defenders exit around a wall, never straight down mid
      ['#', 18, 36, 27, 36], ['#', 19, 5, 26, 5],
      // mid doors, barrels, ammo
      ['D', 22, 10, 23, 10], ['B', 21, 15, 21, 15], ['B', 24, 29, 24, 29], ['B', 9, 9, 9, 9], ['A', 12, 19, 12, 19], ['A', 43, 28, 43, 28],
      // sniper nests with ladders, breakable cover
      ['6', 26, 14, 27, 15], ['L', 25, 14, 25, 14], ['6', 43, 1, 44, 1], ['L', 42, 1, 42, 1],
      ['W', 20, 25, 21, 25], ['W', 4, 20, 4, 21], ['k', 5, 25, 5, 25], ['k', 41, 9, 41, 9], ['k', 3, 10, 3, 10],
    ],
    spawns: [[19, 37, 26, 39], [19, 2, 26, 4]],
    sites: { A: [34, 3, 43, 11], B: [2, 3, 11, 11] },
    theme: {
      wall: 'sandstone', wall2: 'plaster', half: 'sandstone', floor: 'sand', platform: 'plank', crate: 'wood', trim: 'sandstone', door: 'plank',
      decor: { trim: 'sandstone', fixture: 'plank', skyline: 'desert', particles: 'dust', decals: ['sand', 'crack', 'debris', 'dirt'], wall: ['window', 'awning', 'lamp', 'vent'], lights: 3, lampColor: 0xffd49a, groundColor: 0xc9a77a, signs: 10, signColor: '#e8dcc0' },
      sky: { elevation: 38, azimuth: 160, turbidity: 9, rayleigh: 1.4 },
      fog: 0xe6cfa6, fogDensity: 0.0028, sun: 0xfff0d6, sunIntensity: 3.6, hemi: [0xcfe3ff, 0x8a6a45, 0.65], exposure: 0.55,
    },
  },
  harbor: {
    id: 'harbor', name: 'Harbor', size: 'large', w: 48, h: 44,
    desc: 'Container docks at dusk. Sites north and south of a long mid.',
    ops: [
      ['.', 1, 16, 8, 27],          // attacker spawn
      ['.', 39, 16, 46, 27],        // defender spawn
      ['.', 18, 1, 32, 11],         // A site
      ['.', 18, 32, 32, 42],        // B site
      ['.', 9, 19, 38, 24],         // mid
      ['.', 4, 3, 8, 15], ['.', 4, 3, 17, 7],     // attackers → A
      ['.', 4, 28, 8, 40], ['.', 4, 36, 17, 40],  // attackers → B
      ['.', 39, 3, 44, 15], ['.', 33, 3, 44, 7],  // defenders → A
      ['.', 39, 28, 44, 40], ['.', 33, 36, 44, 40], // defenders → B
      ['.', 23, 12, 26, 18],        // mid → A
      ['.', 23, 25, 26, 31],        // mid → B
      ['M', 14, 20, 16, 21], ['M', 31, 22, 33, 23], ['M', 22, 4, 24, 5], ['M', 27, 7, 28, 8],
      ['M', 26, 37, 28, 38], ['M', 21, 35, 22, 36], ['M', 6, 10, 7, 11], ['M', 40, 32, 41, 33],
      ['M', 19, 22, 20, 23], ['M', 28, 19, 29, 20],
      ['c', 19, 9, 19, 9], ['c', 30, 2, 30, 2], ['C', 31, 10, 31, 10], ['c', 20, 40, 20, 40],
      ['C', 30, 33, 30, 33], ['c', 12, 22, 12, 22], ['c', 35, 20, 35, 20], ['h', 23, 12, 24, 12],
      ['h', 25, 31, 26, 31], ['c', 10, 5, 10, 5], ['c', 37, 38, 37, 38],
      ['1', 18, 1, 21, 2], ['2', 18, 1, 19, 1], ['1', 29, 41, 32, 42],
      ['#', 7, 19, 7, 24], ['#', 40, 19, 40, 24],
      ['B', 12, 22, 12, 22], ['B', 35, 20, 35, 20], ['B', 19, 9, 19, 9], ['B', 20, 40, 20, 40], ['A', 10, 5, 10, 5], ['A', 37, 38, 37, 38],
      ['G', 23, 12, 24, 12], ['G', 25, 31, 26, 31],
      ['6', 18, 1, 19, 1], ['L', 20, 1, 20, 1], ['6', 31, 41, 32, 42], ['L', 30, 41, 30, 41],
      ['W', 23, 15, 24, 15], ['W', 25, 28, 26, 28], ['k', 30, 2, 30, 2],
    ],
    spawns: [[2, 18, 6, 25], [41, 18, 45, 25]],
    sites: { A: [20, 2, 30, 9], B: [20, 34, 30, 41] },
    theme: {
      wall: 'concrete', wall2: 'brick', half: 'concrete', floor: 'asphalt', platform: 'grate', crate: 'wood', crate2: 'crate_mil', trim: 'trim', door: 'corrugated', water: true,
      decor: { skyline: 'harbor', water: true, night: true, puddles: true, decals: ['oil', 'paint', 'crack', 'debris'], wall: ['lamp', 'window', 'pipe', 'vent', 'lamp'], lights: 8, lampColor: 0xffb36a, signs: 10 },
      sky: { elevation: 7, azimuth: 250, turbidity: 10, rayleigh: 3 },
      fog: 0x8c7c78, fogDensity: 0.004, sun: 0xffb27a, sunIntensity: 3.2, hemi: [0x9fb6d8, 0x3a3430, 0.75], exposure: 0.6,
    },
  },
  foundry: {
    id: 'foundry', name: 'Foundry', size: 'small', w: 24, h: 16, mirror: true,
    desc: 'Smelting floor at night. Tight lanes around a split centre.',
    ops: [
      ['.', 1, 1, 22, 14],
      ['2', 19, 1, 22, 2], ['1', 19, 3, 22, 3],
      ['X', 5, 1, 6, 4],
      ['#', 10, 5, 13, 5],
      ['M', 8, 8, 9, 9],
      ['h', 11, 7, 12, 7],
      ['c', 6, 12, 6, 12],
      ['c', 15, 11, 15, 11],
      ['X', 4, 6, 4, 9],
      ['B', 6, 12, 6, 12], ['G', 11, 7, 12, 7], ['A', 8, 4, 8, 4],
      ['6', 10, 4, 13, 4], ['L', 9, 4, 9, 4], ['W', 17, 9, 17, 10],
    ],
    spawns: [[1, 6, 2, 9], [21, 6, 22, 9]],
    theme: {
      wall: 'rust', wall2: 'brick', half: 'concrete', floor: 'concrete', platform: 'grate', crate: 'crate_metal', trim: 'rust', door: 'rust',
      decor: { trim: 'trim', fixture: 'rust', pipe: 'rust', skyline: 'industrial', particles: 'embers', decals: ['oil', 'crack', 'debris', 'dirt'], wall: ['furnace', 'pipe', 'lamp', 'vent', 'furnace'], lights: 8, lampColor: 0xffa060, flicker: true, night: true, groundColor: 0x3a3430, signs: 3 },
      sky: { elevation: 4, azimuth: 300, turbidity: 12, rayleigh: 3.5 },
      fog: 0x3a3230, fogDensity: 0.01, sun: 0xff9a5a, sunIntensity: 2.6, hemi: [0x8090b0, 0x2a2420, 0.9], exposure: 0.75,
    },
  },
  outpost: {
    id: 'outpost', name: 'Outpost', size: 'small', w: 26, h: 18, mirror: true,
    desc: 'Snowbound listening post. Long sightlines, a crate stack in the middle.',
    ops: [
      ['.', 1, 1, 24, 16],
      ['#', 6, 3, 8, 6],
      ['#', 6, 11, 7, 16],
      ['h', 12, 4, 13, 4],
      ['C', 12, 8, 13, 9],
      ['c', 10, 13, 10, 13],
      ['M', 3, 13, 4, 14],
      ['1', 9, 1, 11, 1],
      ['#', 5, 7, 5, 10],
      ['B', 10, 13, 10, 13], ['G', 12, 4, 13, 4], ['A', 15, 4, 15, 4],
      ['6', 9, 1, 11, 1], ['L', 12, 1, 12, 1], ['W', 15, 7, 15, 8], ['k', 16, 12, 16, 12],
    ],
    spawns: [[1, 7, 3, 10], [22, 7, 24, 10]],
    theme: {
      wall: 'concrete', wall2: 'corrugated', half: 'concrete', floor: 'snow', platform: 'grate', crate: 'crate_mil', trim: 'trim', door: 'panel',
      decor: { skyline: 'mountains', particles: 'snow', decals: ['snow', 'crack', 'dirt'], wall: ['lamp', 'pipe', 'window', 'vent'], lights: 4, lampColor: 0xe4eeff, groundColor: 0xdfe6ee, signs: 4 },
      sky: { elevation: 22, azimuth: 200, turbidity: 3, rayleigh: 0.9 },
      fog: 0xc8d4e0, fogDensity: 0.008, sun: 0xfff6ee, sunIntensity: 2.8, hemi: [0xdde8ff, 0x8a96a8, 0.8], exposure: 0.5,
    },
  },
  canopy: {
    id: 'canopy', name: 'Canopy', size: 'large', w: 48, h: 44,
    desc: 'Overgrown jungle ruins. A temple splits mid; long flanks to each site.',
    ops: [
      ['.', 19, 1, 28, 6],          // defender spawn
      ['.', 33, 2, 46, 14],         // A site
      ['.', 1, 2, 14, 14],          // B site
      ['.', 29, 3, 32, 6], ['.', 15, 3, 18, 6],
      ['.', 17, 37, 30, 42],        // attacker spawn
      ['.', 21, 7, 26, 36],         // mid
      ['#', 22, 18, 25, 22],        // temple block
      ['.', 38, 15, 44, 36],        // A main
      ['.', 29, 33, 44, 36],
      ['.', 3, 15, 8, 36],          // B main
      ['.', 3, 33, 18, 36],
      ['.', 27, 24, 37, 26],        // mid → A
      ['.', 15, 10, 20, 12],        // mid → B
      ['X', 38, 20, 40, 21], ['X', 6, 22, 8, 23],
      ['C', 39, 7, 40, 8], ['c', 36, 11, 36, 11], ['c', 43, 5, 43, 5], ['h', 35, 13, 37, 13], ['2', 44, 2, 46, 3], ['1', 44, 4, 46, 4],
      ['C', 6, 6, 7, 7], ['c', 10, 10, 10, 10], ['c', 3, 11, 3, 11], ['h', 9, 13, 11, 13], ['2', 1, 2, 3, 3], ['1', 1, 4, 3, 4],
      ['c', 23, 10, 23, 10], ['c', 24, 30, 24, 30], ['h', 21, 27, 22, 27],
      ['C', 42, 28, 42, 28], ['c', 4, 28, 4, 28], ['c', 30, 25, 30, 25], ['c', 20, 39, 20, 39], ['c', 27, 39, 27, 39],
      ['#', 19, 37, 28, 37], ['#', 19, 5, 28, 5],
      ['D', 21, 20, 21, 20], ['D', 26, 20, 26, 20], ['B', 23, 10, 23, 10], ['B', 24, 30, 24, 30], ['B', 30, 25, 30, 25],
      ['A', 4, 28, 4, 28], ['A', 36, 11, 36, 11], ['G', 21, 27, 22, 27],
      ['6', 45, 2, 46, 3], ['L', 44, 2, 44, 2], ['6', 1, 2, 2, 3], ['L', 3, 2, 3, 2],
      ['W', 40, 28, 41, 28], ['W', 6, 28, 7, 28], ['k', 10, 10, 10, 10],
    ],
    spawns: [[19, 38, 28, 41], [20, 2, 27, 4]],
    sites: { A: [35, 4, 45, 12], B: [2, 4, 12, 12] },
    theme: {
      wall: 'moss', wall2: 'stone', half: 'moss', floor: 'grass', platform: 'plank', crate: 'wood', crate2: 'crate_mil', trim: 'moss', door: 'plank',
      decor: { trim: 'stone', fixture: 'stone', skyline: 'jungle', particles: 'fireflies', decals: ['leaves', 'dirt', 'debris'], decalDensity: 0.35, wall: ['vine', 'vine', 'lamp', 'window'], wallDensity: 0.35, lights: 4, lampColor: 0xffb060, flicker: true, groundColor: 0x3d5a2c, signs: 8, signColor: '#c9b48a' },
      sky: { elevation: 30, azimuth: 120, turbidity: 12, rayleigh: 1.8 },
      fog: 0x6f8a6a, fogDensity: 0.005, sun: 0xfff0c8, sunIntensity: 3.2, hemi: [0xcfe8c8, 0x3a4a2a, 0.75], exposure: 0.55,
    },
  },
  frostbite: {
    id: 'frostbite', name: 'Frostbite', size: 'large', w: 46, h: 42,
    desc: 'Arctic research depot. Container mazes on both sites, open mid.',
    ops: [
      ['.', 1, 15, 7, 26],          // attacker spawn
      ['.', 38, 15, 44, 26],        // defender spawn
      ['.', 16, 1, 30, 10],         // A site
      ['.', 16, 31, 30, 40],        // B site
      ['.', 8, 18, 37, 23],         // mid
      ['.', 3, 3, 7, 14], ['.', 3, 3, 15, 6],
      ['.', 3, 27, 7, 38], ['.', 3, 35, 15, 38],
      ['.', 38, 3, 42, 14], ['.', 31, 3, 42, 6],
      ['.', 38, 27, 42, 38], ['.', 31, 35, 42, 38],
      ['.', 21, 11, 24, 17], ['.', 21, 24, 24, 30],
      ['M', 12, 19, 14, 20], ['M', 30, 21, 32, 22], ['M', 20, 4, 22, 5], ['M', 25, 6, 26, 7],
      ['M', 24, 35, 26, 36], ['M', 19, 33, 20, 34], ['M', 5, 9, 6, 10], ['M', 39, 31, 40, 32],
      ['c', 17, 8, 17, 8], ['C', 29, 9, 29, 9], ['c', 28, 2, 28, 2], ['c', 17, 38, 17, 38], ['C', 29, 32, 29, 32],
      ['c', 10, 21, 10, 21], ['c', 34, 19, 34, 19], ['h', 21, 11, 22, 11], ['h', 23, 30, 24, 30],
      ['1', 16, 1, 19, 2], ['2', 16, 1, 17, 1], ['1', 27, 39, 30, 40],
      ['#', 6, 17, 6, 24], ['#', 39, 17, 39, 24],
      ['B', 17, 8, 17, 8], ['B', 17, 38, 17, 38], ['B', 10, 21, 10, 21], ['B', 34, 19, 34, 19], ['A', 28, 2, 28, 2],
      ['G', 21, 11, 22, 11], ['G', 23, 30, 24, 30],
      ['6', 16, 1, 17, 1], ['L', 18, 1, 18, 1], ['6', 29, 40, 30, 40], ['L', 28, 40, 28, 40],
      ['W', 21, 14, 22, 14], ['W', 23, 27, 24, 27],
    ],
    spawns: [[2, 17, 5, 24], [40, 17, 43, 24]],
    sites: { A: [18, 2, 28, 8], B: [18, 33, 28, 39] },
    theme: {
      wall: 'concrete', wall2: 'panel', half: 'concrete', floor: 'snow', platform: 'grate', crate: 'crate_mil', crate2: 'crate_metal', trim: 'trim', door: 'panel',
      decor: { skyline: 'mountains', particles: 'snow', decals: ['snow', 'oil', 'paint', 'crack'], wall: ['lamp', 'pipe', 'window', 'vent'], lights: 5, lampColor: 0xe4eeff, groundColor: 0xdfe6ee, signs: 10 },
      sky: { elevation: 18, azimuth: 210, turbidity: 3, rayleigh: 1 },
      fog: 0xc8d4e0, fogDensity: 0.006, sun: 0xfff6ee, sunIntensity: 3.0, hemi: [0xdde8ff, 0x8a96a8, 0.8], exposure: 0.5,
    },
  },
};
