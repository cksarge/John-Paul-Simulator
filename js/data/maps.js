// Maps are grids of 2 m cells. Every cell starts as wall ('#'); ops carve floor and place props.
// Op: [char, x0, y0, x1, y1] fills the inclusive rectangle.
// Chars: '.' floor · '#' wall · 'X' alt wall · 'h' half wall · 'c' crate (1 m) · 'C' tall crate (2 m)
//        'M' shipping container · '1'..'4' raised platform (0.5 m per step)
//        '5'..'8' tall platforms / catwalks (2.5–4 m), reached by ladder 'L' (a floor cell beside the platform)
//        '^' '>' 'v' '<' ramps and 'n' 'e' 's' 'w' stairs, rising north / east / south / west onto the
//        platform or bridge they lead to · 'E' lift up to the platform beside it
//        'D' sliding door · 'G' breakable glass pane · 'B' explosive barrels · 'A' ammo crate
//        'W' wooden barricade · 'k' wooden crate (both can be shot through and destroyed)
//        'Q' cracked wall (explosives knock it down) · 'P' gate + 'J' switch · 'Y' spawn barrier (buy time only)
// upper: [char, x0, y0, x1, y1] ops for the overhead layer (see UPPER in engine/grid.js): '=' bridge 4 m,
//        '-' low bridge 2 m, 'R' / 'r' with railings, 'g' breakable grate catwalk, 'T' tunnel roof.
//        ('=' in the ground ops is the older way to write a 4 m bridge.)
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
      // new pieces: a lift to the catwalk, a cracked wall shortcut, spawn barriers
      ['E', 4, 1, 4, 1], ['Q', 6, 1, 7, 2], ['Y', 1, 4, 3, 4], ['Y', 1, 9, 3, 9],
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
      // new pieces: stairs up to the catwalks, spawn barriers
      ['n', 25, 3, 26, 4], ['Y', 1, 6, 4, 6], ['Y', 2, 13, 4, 13],
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
      // new pieces: stairs to A short, cracked long doors, spawn barriers (the B tunnels get a roof below)
      ['w', 28, 14, 29, 15], ['Q', 40, 23, 41, 24], ['Y', 15, 35, 30, 35], ['Y', 16, 2, 16, 6], ['Y', 29, 2, 29, 6], ['Y', 20, 7, 25, 7],
    ],
    upper: [
      ['T', 2, 15, 6, 29], // the B tunnels are roofed
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
      // new pieces: stairs up to both site cranes, spawn barriers (the mid connectors get roofs below)
      ['w', 20, 1, 22, 1], ['e', 28, 41, 30, 41], ['Y', 4, 15, 8, 15], ['Y', 4, 28, 8, 28], ['Y', 8, 19, 8, 24], ['Y', 39, 15, 44, 15], ['Y', 39, 28, 44, 28], ['Y', 39, 19, 39, 24],
    ],
    upper: [
      ['T', 23, 13, 26, 18], ['T', 23, 25, 26, 30], // covered loading tunnels between mid and the sites
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
      // new pieces: stairs at the other end of each catwalk, a cracked pillar, spawn barriers
      ['w', 14, 4, 15, 4], ['Q', 5, 3, 6, 4], ['Y', 1, 5, 3, 5], ['Y', 1, 10, 3, 10],
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
      // new pieces: stairs to the catwalks, a gate (and its switch) through the side walls, spawn barriers
      ['n', 10, 2, 10, 3], ['P', 18, 5, 19, 5], ['J', 17, 6, 17, 6], ['Y', 1, 6, 4, 6], ['Y', 1, 11, 4, 11],
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
      // new pieces: stairs to both site perches, cracked ruin pillars, spawn barriers (the temple passages get roofs below)
      ['w', 3, 2, 5, 2], ['e', 42, 2, 44, 2], ['Q', 6, 22, 8, 23], ['Q', 38, 20, 40, 21], ['Y', 17, 37, 18, 37], ['Y', 29, 37, 30, 37], ['Y', 18, 3, 18, 4], ['Y', 29, 3, 29, 4],
    ],
    upper: [
      ['T', 21, 17, 21, 23], ['T', 26, 17, 26, 23], // roofed passages either side of the temple
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
    desc: 'Arctic research depot. Spawns in opposite corners, a split lab in mid and an ice bridge over the B underpass.',
    ops: [
      ['.', 1, 32, 10, 40],         // attacker spawn (south-west)
      ['.', 35, 1, 44, 7],          // defender spawn (north-east)
      ['.', 1, 1, 13, 12],          // A site (north-west)
      ['.', 32, 29, 44, 40],        // B site (south-east)
      ['.', 2, 13, 6, 31],          // west road: attackers → A
      ['.', 11, 36, 31, 40],        // south yard: attackers → B
      ['.', 14, 2, 34, 5],          // north pass: defenders → A
      ['.', 39, 8, 44, 28],         // east road: defenders → B
      ['.', 17, 15, 28, 26],        // the lab (mid)
      ['#', 17, 20, 28, 20],        // lab divider: north hall / south hall
      ['D', 22, 20, 23, 20], ['G', 18, 20, 19, 20], ['G', 26, 20, 27, 20],
      ['.', 7, 17, 16, 18],         // west road → north hall
      ['.', 12, 13, 16, 16],        // north hall → A short
      ['.', 24, 6, 25, 14],         // north pass → north hall
      ['.', 20, 27, 21, 35],        // south yard → south hall
      ['.', 29, 23, 38, 24],        // south hall → east road
      ['.', 22, 28, 31, 33],        // B underpass
      ['D', 16, 17, 16, 18], ['D', 29, 23, 29, 24],
      // ice bridge over the underpass, between two towers
      ['8', 22, 30, 23, 31], ['L', 21, 30, 21, 30], ['8', 32, 30, 33, 31], ['E', 34, 30, 34, 30],
      // A site
      ['C', 5, 5, 6, 6], ['c', 9, 8, 9, 8], ['M', 2, 9, 4, 10], ['h', 7, 11, 9, 11], ['c', 11, 3, 11, 3], ['A', 4, 3, 4, 3],
      ['6', 1, 1, 2, 2], ['L', 3, 2, 3, 2], ['k', 9, 8, 9, 8],
      // B site
      ['M', 38, 34, 40, 35], ['C', 42, 31, 42, 32], ['c', 36, 38, 36, 38], ['h', 35, 36, 36, 36], ['k', 41, 38, 41, 38], ['B', 43, 39, 43, 39],
      // lab
      ['c', 18, 16, 18, 16], ['C', 27, 17, 27, 17], ['c', 19, 25, 19, 25], ['C', 26, 24, 26, 24], ['B', 28, 15, 28, 15], ['h', 21, 23, 22, 23],
      // lanes
      ['X', 2, 22, 3, 23], ['c', 6, 27, 6, 27], ['W', 5, 14, 6, 14], ['A', 2, 30, 2, 30],
      ['M', 15, 38, 17, 39], ['c', 25, 37, 25, 37], ['h', 28, 40, 29, 40], ['W', 20, 33, 21, 33],
      ['M', 41, 14, 42, 15], ['c', 39, 20, 39, 20], ['X', 43, 24, 44, 25], ['A', 44, 9, 44, 9],
      ['C', 19, 3, 19, 3], ['c', 29, 4, 29, 4], ['M', 31, 2, 32, 3], ['B', 14, 5, 14, 5],
      // spawn screens
      ['#', 5, 32, 8, 32], ['#', 37, 7, 40, 7],
      // new pieces: cracked sections in the lab divider, spawn barriers
      ['Q', 20, 20, 21, 20], ['Q', 24, 20, 25, 20], ['Y', 2, 31, 6, 31], ['Y', 11, 36, 11, 40], ['Y', 34, 2, 34, 5], ['Y', 39, 8, 44, 8],
    ],
    upper: [
      ['R', 24, 30, 26, 31], ['g', 27, 30, 28, 31], ['R', 29, 30, 31, 31], // railed ice bridge with a grate middle you can shoot out
    ],
    spawns: [[2, 34, 9, 39], [36, 2, 43, 5]],
    sites: { A: [2, 2, 12, 11], B: [33, 30, 43, 39] },
    theme: {
      wall: 'concrete', wall2: 'panel', half: 'concrete', floor: 'snow', platform: 'grate', crate: 'crate_mil', crate2: 'crate_metal', trim: 'trim', door: 'panel',
      decor: { skyline: 'mountains', particles: 'snow', decals: ['snow', 'oil', 'paint', 'crack'], wall: ['lamp', 'pipe', 'window', 'vent'], lights: 5, lampColor: 0xe4eeff, groundColor: 0xdfe6ee, signs: 10 },
      sky: { elevation: 18, azimuth: 210, turbidity: 3, rayleigh: 1 },
      fog: 0xc8d4e0, fogDensity: 0.006, sun: 0xfff6ee, sunIntensity: 3.0, hemi: [0xdde8ff, 0x8a96a8, 0.8], exposure: 0.5,
    },
  },
  // Training range: shooting lanes facing away from the firing line, crates and a platform for grenade line-ups.
  // Not in any mode's rotation; only the Training Range mode uses it.
  range: {
    id: 'range', name: 'Range', size: 'small', w: 34, h: 27, training: true,
    desc: 'Indoor firing range with lanes out to 35 m and a grenade yard.',
    ops: [
      ['.', 1, 1, 32, 25],
      // firing line: a waist-high counter with gaps to walk through
      ['h', 2, 18, 7, 18], ['h', 9, 18, 15, 18], ['h', 17, 18, 23, 18],
      // lane markers between the near and far targets
      ['h', 11, 11, 11, 13], ['h', 18, 11, 18, 13],
      // grenade yard on the right: cover to throw over and around
      ['#', 25, 1, 25, 9], ['C', 28, 4, 29, 5], ['c', 30, 9, 30, 9], ['k', 27, 12, 27, 12], ['W', 29, 14, 30, 14],
      ['2', 31, 1, 32, 3], ['h', 26, 16, 26, 18],
      // spray wall: open back wall in the left lane
      ['X', 1, 1, 9, 1],
      // supplies by the firing line
      ['A', 1, 24, 1, 24], ['A', 24, 24, 24, 24],
    ],
    spawns: [[12, 21, 15, 24], [3, 3, 22, 14]],
    theme: {
      wall: 'concrete', wall2: 'panel', half: 'concrete', floor: 'epoxy', platform: 'grate', crate: 'crate_metal', crate2: 'crate_mil', trim: 'hazard', door: 'panel',
      decor: { trim: 'hazard', skyline: 'industrial', particles: 'dust', decals: ['dirt', 'paint'], wall: ['lamp', 'vent', 'lamp', 'pipe'], lights: 8, lampColor: 0xe8f2ff, groundColor: 0x55534e, signs: 4, signColor: '#d9a531' },
      sky: { elevation: 48, azimuth: 120, turbidity: 5, rayleigh: 1.1 },
      fog: 0x7b8794, fogDensity: 0.004, sun: 0xfff1dc, sunIntensity: 3.0, hemi: [0xbcd3ff, 0x4a4036, 0.75], exposure: 0.62,
    },
  },
  // Tutorial course: one route through rooms, one room per skill (js/game/tutorial.js runs the steps).
  // Top row runs east (movement, climbing, doors), the middle row west (shooting, grenades, buying, the
  // site), the bottom row is the team room and the 1v1 arena. Not in any rotation.
  course: {
    id: 'course', name: 'Course', size: 'small', w: 48, h: 32, training: true,
    desc: 'The tutorial course.',
    ops: [
      ['.', 1, 1, 46, 8],
      ['c', 15, 1, 15, 8], // a row of crates to jump
      ['#', 18, 1, 19, 3], ['#', 18, 6, 19, 8], // crawlway under a low bridge (see upper)
      ['4', 22, 1, 24, 8], // 2 m ledge to mantle
      ['7', 28, 1, 34, 2], ['L', 28, 3, 28, 3], ['E', 35, 1, 35, 1], // catwalk: ladder up, lift down
      ['#', 38, 1, 38, 8], ['D', 38, 4, 38, 5], // sliding door
      ['#', 43, 1, 43, 8], ['P', 43, 4, 43, 5], ['J', 41, 2, 41, 2], // gate and its switch
      ['.', 44, 9, 46, 11],
      ['.', 1, 12, 46, 19],
      ['h', 40, 12, 40, 14], ['h', 40, 17, 40, 19], // firing line
      ['#', 20, 12, 27, 14], ['.', 21, 12, 26, 13], ['Q', 22, 14, 25, 14], ['A', 23, 12, 23, 12], // cracked wall to blow open
      ['#', 9, 12, 9, 19], ['.', 9, 15, 9, 16],
      ['.', 2, 20, 4, 22],
      ['.', 1, 23, 46, 30],
      ['#', 9, 23, 9, 30], ['.', 9, 26, 9, 27],
      // arena cover
      ['C', 18, 24, 19, 25], ['C', 18, 28, 19, 29], ['h', 24, 26, 24, 27], ['C', 29, 23, 30, 24], ['C', 29, 29, 30, 30], ['h', 34, 25, 34, 28], ['C', 38, 26, 39, 27],
    ],
    upper: [['-', 18, 4, 19, 5]],
    sites: { A: [2, 13, 7, 18] },
    spawns: [[2, 3, 4, 6], [43, 25, 45, 28]],
    theme: {
      wall: 'concrete', wall2: 'panel', half: 'concrete', floor: 'epoxy', platform: 'grate', crate: 'crate_metal', crate2: 'crate_mil', trim: 'hazard', door: 'panel',
      decor: { trim: 'hazard', skyline: 'industrial', particles: 'dust', decals: ['dirt', 'paint'], wall: ['lamp', 'vent', 'lamp', 'pipe'], lights: 10, lampColor: 0xffe2b8, groundColor: 0x55534e, signs: 4, signColor: '#d9a531' },
      sky: { elevation: 48, azimuth: 120, turbidity: 5, rayleigh: 1.1 },
      fog: 0x7b8794, fogDensity: 0.004, sun: 0xfff1dc, sunIntensity: 3.0, hemi: [0xbcd3ff, 0x4a4036, 0.75], exposure: 0.62,
    },
  },
};

// Tutorial course zones (cell rects [x0, y0, x1, y1]): where each step's marker goes and where you
// respawn if you die during it.
export const COURSE_ZONES = {
  start: [2, 3, 4, 6], walk: [11, 2, 13, 7], jump: [15, 3, 15, 6], crouch: [18, 4, 19, 5], mantle: [22, 3, 24, 6],
  ladderTop: [30, 1, 32, 2], liftBottom: [35, 1, 36, 2], door: [38, 4, 38, 5], gate: [41, 2, 41, 2],
  range: [42, 15, 45, 16], nades: [22, 16, 25, 18], buy: [12, 15, 15, 18], site: [3, 14, 6, 17], team: [3, 25, 6, 28], arena: [11, 25, 13, 28],
};

// ───────────────────────── conditions (night and weather) ─────────────────────────
// Every map can be played in any condition. The layout never changes, only the look: sky, light,
// fog and particles. The condition travels in the match payload so every player sees the same one.
export const VARIANTS = {
  day: { name: 'Standard' },
  night: { name: 'Night' },
  rain: { name: 'Rain' },
  fog: { name: 'Fog' },
};
const SNOWY = (def) => def.theme.decor?.particles === 'snow';
export const variantName = (def, v) => (v === 'rain' && def && SNOWY(def) ? 'Blizzard' : VARIANTS[v]?.name || 'Standard');

// How far bots can spot someone in each condition (metres).
export const SIGHT = { day: 75, night: 38, rain: 55, fog: 30 };

// Quick play rolls a condition for casual modes; ranked always plays the standard look.
export function rollVariant(ranked) {
  if (ranked) return 'day';
  const r = Math.random();
  return r < 0.55 ? 'day' : r < 0.7 ? 'night' : r < 0.85 ? 'rain' : 'fog';
}

// The map definition with its theme changed for a condition (the original is left untouched).
export function withVariant(def, v) {
  if (!def || !v || v === 'day' || !VARIANTS[v]) return def;
  const t = def.theme, d = t.decor || {};
  let theme;
  if (v === 'night') {
    theme = {
      ...t,
      sky: { elevation: -8, azimuth: t.sky.azimuth, turbidity: 2, rayleigh: 0.4 },
      light: { elevation: 42, azimuth: t.sky.azimuth + 60 }, stars: true, flashlight: true,
      fog: 0x070a10, fogDensity: Math.max(0.008, t.fogDensity * 1.6), sun: 0x8ea6ff, sunIntensity: 0.45, hemi: [0x34426a, 0x0c0d10, 0.35], exposure: 0.62,
      decor: { ...d, night: true, lights: Math.min(12, (d.lights || 4) + 4), lampIntensity: 22, particles: d.particles === 'dust' ? 'fireflies' : d.particles },
    };
  } else if (v === 'rain') {
    const snow = SNOWY(def);
    theme = {
      ...t,
      sky: { ...t.sky, turbidity: 20, rayleigh: 0.12, elevation: Math.max(8, t.sky.elevation * 0.6) },
      fog: snow ? 0xd8e0ea : 0x6b737c, fogDensity: Math.max(t.fogDensity * 2.2, snow ? 0.018 : 0.012), sun: snow ? 0xe8eef8 : 0xc8d0dc,
      sunIntensity: t.sunIntensity * 0.4, hemi: [snow ? 0xdde6f2 : 0x9aa6b6, 0x3a3e44, 0.9], exposure: t.exposure * 0.85,
      decor: { ...d, particles: snow ? 'blizzard' : 'rain', puddles: !snow || d.puddles },
    };
  } else {
    theme = {
      ...t,
      sky: { ...t.sky, turbidity: 14, rayleigh: 0.8 },
      hideSky: true, fog: 0xa9b0b6, fogDensity: Math.max(0.045, t.fogDensity * 7), sun: 0xe6e8ea, sunIntensity: t.sunIntensity * 0.55,
      hemi: [0xc8cdd2, 0x55585c, 1.0], exposure: t.exposure,
      decor: { ...d, particles: d.particles === 'snow' ? 'snow' : 'dust' },
    };
  }
  return { ...def, variant: v, theme };
}
