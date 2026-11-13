// Shared helpers for map grid characters.
// '1'..'8' are raised platforms, 0.5 m per step (so '8' is a 4 m catwalk).
export const isPlatform = (ch) => ch >= '1' && ch <= '8';
export const platformH = (ch) => (isPlatform(ch) ? (ch.charCodeAt(0) - 48) * 0.5 : 0);
// Cells you can stand on (ladders 'L' are floor with a ladder against the neighbouring platform).
export const isWalkable = (ch) => ch === '.' || ch === 'L' || ch === '=' || isPlatform(ch);
