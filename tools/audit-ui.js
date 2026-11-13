// Dev tool: checks that every button and input on every menu screen can be scrolled into view and
// clicked (nothing pushed off-screen, nothing hidden under a sticky footer or overlay).
// Usage (browser console on the game page): const m = await import('/tools/audit-ui.js'); await m.auditMenus();
// Run it at several window sizes. It returns a list of problems; an empty list means everything is reachable.

export function audit(label, root = document) {
  const modal = document.querySelector('.modal-backdrop');
  const scope = modal || root;
  const sel = 'button, input, select, textarea, a[href]';
  const bad = [];
  for (const el of scope.querySelectorAll(sel)) {
    if (!modal && !el.closest('#ui, #hud')) continue;
    const cs = getComputedStyle(el);
    if (el.offsetParent === null || cs.visibility === 'hidden' || el.closest('.hidden') || el.disabled || el.closest('.cf-ts')) continue;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const inView = r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
    const hit = document.elementFromPoint(cx, cy);
    if (inView && hit && (hit === el || el.contains(hit) || hit.contains(el))) continue;
    bad.push(`${label}: <${el.tagName.toLowerCase()} class="${el.className}"> "${(el.textContent || el.placeholder || '').trim().slice(0, 30)}" ${inView ? 'covered by ' + (hit?.className || hit?.tagName) : 'off-screen'}`);
  }
  // Content cut off sideways with no way to scroll to it (ellipsis text is deliberate and allowed).
  for (const el of scope.querySelectorAll('*')) {
    if (!modal && !el.closest('#ui, #hud')) continue;
    if (el.offsetParent === null || el.closest('.hidden')) continue;
    const cs = getComputedStyle(el);
    if (!/hidden|clip/.test(cs.overflowX) || cs.textOverflow === 'ellipsis' || el.clientWidth < 20) continue;
    if (el.scrollWidth > el.clientWidth + 2) bad.push(`${label}: <${el.tagName.toLowerCase()} class="${el.className}"> clips ${el.scrollWidth - el.clientWidth}px sideways with no scroll`);
  }
  return bad;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function auditMenus() {
  const app = window.jps, ui = app.ui, out = [];
  for (const m of ['login', 'signup', 'reset']) { ui.showAuth(m); await sleep(300); out.push(...audit('auth-' + m)); }
  app.loginGuest(); await sleep(400);
  for (const src of ['online', 'offline']) { ui.source = src; ui.showMenu('play'); await sleep(300); out.push(...audit('play-' + src)); }
  ui.source = 'online'; ui.allModes = true; ui.showMenu('play'); await sleep(300); out.push(...audit('play-all-modes')); ui.allModes = false;
  ui.showMenu('season'); await sleep(800); out.push(...audit('season'));
  // The admin screen only exists for the admin account; audit it when signed in as admin.
  if (app.isAdmin) for (const sec of ['overview', 'reports', 'players', 'moderated', 'live', 'announce', 'settings', 'audit']) {
    ui.showMenu('admin'); ui.adminPanel.section = sec; ui.adminPanel.refresh(); await sleep(700); out.push(...audit('admin-' + sec));
  }
  ui.showMenu('operators'); await sleep(300); out.push(...audit('operators'));
  for (const k of ['finish', 'outfit', 'card', 'effect', 'emote']) { ui.armoryKind = k; ui.showMenu('armory'); await sleep(300); out.push(...audit('armory-' + k)); }
  for (const t of ['stats', 'replays', 'leaderboard', 'settings']) { ui.showMenu(t); await sleep(t === 'leaderboard' ? 1500 : 700); out.push(...audit(t)); }
  const m = ui.modal('<h2 class="m-h2">Tall modal</h2>' + '<p class="m-sub">line</p>'.repeat(60) + '<button class="btn">Bottom</button>');
  await sleep(200); out.push(...audit('tall-modal')); m.remove();
  return out;
}

// In-game overlays: buy menu, scoreboard, pause, settings and the results screen.
export async function auditGame() {
  const app = window.jps, out = [];
  app.startOffline({ mode: 'bomb', map: 'dustline', botLevel: 'easy' });
  await sleep(3500);
  const g = app.game, hud = g.hud;
  g.input.locked = true; hud.closeOverlay(false);
  while (g.state.phase !== 'buy') await sleep(200);
  hud.openBuy(); await sleep(200); out.push(...audit('buy-menu')); hud.closeOverlay(false);
  hud.overlay = null; hud.setScoreboard(true); await sleep(200); out.push(...audit('scoreboard')); hud.setScoreboard(false);
  hud.showPause(); await sleep(200); out.push(...audit('pause'));
  hud.el.ovl.querySelector('[data-a=settings]').click(); await sleep(300); out.push(...audit('game-settings'));
  hud.closeOverlay(false);
  g.rules.finish(0, 'score'); await sleep(2500);
  if (hud.overlay === 'highlight') { out.push(...audit('highlight')); hud.el.ovl.querySelector('[data-a=close]').click(); await sleep(300); }
  out.push(...audit('results'));
  g.leave(); await sleep(1500);
  // Training range buy menu with the drill picker.
  app.startOffline({ mode: 'training', map: 'range', botLevel: 'easy' });
  await sleep(3000);
  const t = app.game;
  t.input.locked = true; t.hud.closeOverlay(false);
  t.hud.openBuy(); await sleep(200); out.push(...audit('training-buy'));
  t.leave(); await sleep(1500);
  return out;
}
