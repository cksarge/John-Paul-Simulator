// The crosshair, shared by the HUD and the live preview in Settings so they always look the same.
// el is a `.crosshair` element. Returns the four arms for layoutCrosshair.
export function buildCrosshair(el, s) {
  el.style.setProperty('--ch', s.crosshairColor);
  el.innerHTML = `<i class="l"></i><i class="r"></i><i class="u"></i><i class="d"></i>${s.crosshairDot ? '<i class="dot"></i>' : ''}`;
  return [...el.querySelectorAll('i:not(.dot)')];
}

// gap is the distance from the centre to each arm (the setting plus any spread from moving or firing).
export function layoutCrosshair(parts, s, gap) {
  const L = s.crosshairSize, T = s.crosshairThick;
  const [l, r, u, d] = parts;
  const set = (e, x, y, w, h) => { e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.width = w + 'px'; e.style.height = h + 'px'; };
  set(l, -gap - L, -T / 2, L, T); set(r, gap, -T / 2, L, T);
  set(u, -T / 2, -gap - L, T, L); set(d, -T / 2, gap, T, L);
}
