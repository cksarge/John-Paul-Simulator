// Maps are grids of 2 m cells. Every cell starts as wall ('#'); ops carve floor and place props.
// Op: [char, x0, y0, x1, y1] fills the inclusive rectangle.
// Chars: '.' floor · '#' wall · 'X' alt wall · 'h' half wall · 'c' crate (1 m) · 'C' tall crate (2 m)
//        'M' shipping container · '1'..'4' raised platform (0.5 m per step)
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
    ],
    spawns: [[1, 5, 2, 8], [19, 5, 20, 8]],
    theme: {
      wall: 'concrete', wall2: 'metal', half: 'concrete', floor: 'tile', platform: 'metal',
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
    ],
    spawns: [[1, 7, 3, 12], [24, 7, 26, 12]],
    theme: {
      wall: 'brick', wall2: 'plaster', half: 'stone', floor: 'cobble', platform: 'stone',
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
    ],
    spawns: [[17, 37, 28, 39], [19, 2, 26, 4]],
    sites: { A: [34, 3, 43, 11], B: [2, 3, 11, 11] },
    theme: {
      wall: 'sandstone', wall2: 'plaster', half: 'sandstone', floor: 'sand', platform: 'wood',
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
    ],
    spawns: [[2, 18, 6, 25], [41, 18, 45, 25]],
    sites: { A: [20, 2, 30, 9], B: [20, 34, 30, 41] },
    theme: {
      wall: 'concrete', wall2: 'brick', half: 'concrete', floor: 'asphalt', platform: 'metal', water: true,
      sky: { elevation: 7, azimuth: 250, turbidity: 10, rayleigh: 3 },
      fog: 0x8c7c78, fogDensity: 0.004, sun: 0xffb27a, sunIntensity: 3.2, hemi: [0x9fb6d8, 0x3a3430, 0.75], exposure: 0.6,
    },
  },
};
