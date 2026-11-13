// Commends, reports, the ban screen, admin warnings and the announcement banner.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const COMMENDS = [
  ['friendly', 'Friendly', '🤝'],
  ['leader', 'Leader', '⭐'],
  ['teacher', 'Teacher', '📘'],
  ['clutch', 'Clutch', '🔥'],
];

export const REPORT_REASONS = [
  ['cheating', 'Cheating (aimbot, wallhack, speed)'],
  ['griefing', 'Griefing or team killing'],
  ['abuse', 'Abusive chat or harassment'],
  ['name', 'Offensive name'],
  ['afk', 'AFK or not playing'],
  ['other', 'Something else'],
];

// How long a ban or mute lasts, worded the same on the ban screen and in the admin panel.
// Returns '' when there's no end date given and 'expired' once it's over.
export function banUntil(iso) {
  if (!iso) return '';
  if (iso === 'infinity') return 'permanently';
  return new Date(iso) > new Date() ? 'until ' + new Date(iso).toLocaleString() : 'expired';
}
export const isActive = (iso) => !!iso && banUntil(iso) !== 'expired';

export function commendDialog(ui, player, matchId, onDone) {
  if (!player) return;
  const m = ui.modal(`<h2 class="m-h2">Commend ${esc(player.name)}</h2>
    <p class="m-sub">Commends show on their profile. One per player per match.</p>
    <div class="commend-grid">${COMMENDS.map(([k, label, icon]) => `<button class="btn" data-k="${k}"><span class="ci">${icon}</span>${label}</button>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn small ghost" data-x>Cancel</button></div>`);
  m.querySelector('[data-x]').onclick = () => m.remove();
  m.querySelectorAll('[data-k]').forEach((b) => { b.onclick = async () => {
    try { await ui.app.api.commend(player.id, matchId, b.dataset.k); ui.toast(`You commended ${player.name}`, 'good'); onDone?.(); }
    catch (e) { ui.toast(e.missing ? 'Commends aren’t available yet' : e.message, 'bad'); }
    m.remove();
  }; });
}

export function reportDialog(ui, player, ctx, onDone) {
  if (!player) return;
  const m = ui.modal(`<h2 class="m-h2">Report ${esc(player.name)}</h2>
    <p class="m-sub">Reports go to the moderator with this match's details${ctx.chat?.length ? ` and ${ctx.chat.length} of their chat message${ctx.chat.length > 1 ? 's' : ''}` : ''}. False reports may be ignored.</p>
    <div class="report-reasons">${REPORT_REASONS.map(([k, l], i) => `<label class="radio"><input type="radio" name="rr" value="${k}" ${i ? '' : 'checked'}><span>${l}</span></label>`).join('')}</div>
    <label class="field"><span>Details (optional)</span><textarea id="rr-note" maxlength="500" rows="3" placeholder="What happened? Round, time, anything that helps."></textarea></label>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn small ghost" data-x>Cancel</button><button class="btn small danger" data-send>Send report</button></div>`);
  m.querySelector('[data-x]').onclick = () => m.remove();
  m.querySelector('[data-send]').onclick = async () => {
    const reason = m.querySelector('input[name=rr]:checked')?.value || 'other';
    const note = m.querySelector('#rr-note').value.trim();
    const evidence = { map: ctx.map, stats: { k: player.k, d: player.d, hs: player.hs, dmg: player.dmg }, chat: (ctx.chat || []).slice(-30) };
    try { await ui.app.api.report(player.id, ctx.matchId, ctx.mode, reason, note, evidence); ui.toast('Report sent. Thanks for helping keep matches fair.', 'good'); onDone?.(); m.remove(); }
    catch (e) { ui.toast(e.missing ? 'Reports aren’t available yet' : e.message, 'bad'); }
  };
}

// Full-screen notice for a banned account. The only way out is signing out.
export function showBanned(ui, ban) {
  ui.hide?.();
  ui.root.innerHTML = `<div class="ban-screen"><div class="ban-card">
    <div class="ban-icon" aria-hidden="true">⛔</div>
    <h1 class="m-h1">Account suspended</h1>
    <p>This account is banned ${esc(banUntil(ban.until) || 'permanently')}.</p>
    ${ban.reason ? `<p class="ban-reason">Reason: ${esc(ban.reason)}</p>` : ''}
    <p class="m-sub">You can't play online, earn XP or take part in ranked while suspended.</p>
    <div class="row" style="justify-content:center;gap:8px"><button class="btn primary" id="ban-out">Sign out</button></div>
  </div></div>`;
  ui.root.querySelector('#ban-out').onclick = () => ui.app.signOut();
}

// Full-screen maintenance notice for everyone but admins. It goes away by itself when maintenance ends.
export function showMaintenance(ui, mt) {
  const msg = mt?.message || 'The game is down for maintenance.';
  const card = ui.root.querySelector('.maint-screen');
  if (card) { card.querySelector('.maint-msg').textContent = msg; return; }
  ui.hide?.();
  document.querySelectorAll('.modal-backdrop, .ed').forEach((e) => e.remove());
  ui.root.innerHTML = `<div class="ban-screen maint-screen"><div class="ban-card">
    <div class="ban-icon" aria-hidden="true">🛠️</div>
    <h1 class="m-h1">Down for maintenance</h1>
    <p class="maint-msg">${esc(msg)}</p>
    <p class="m-sub">You'll be let back in automatically as soon as it's over. Keep this page open.</p>
    <div class="queue-pulse" aria-hidden="true"></div>
  </div></div>`;
}

export function showWarnings(ui, list) {
  const m = ui.modal(`<h2 class="m-h2">⚠ Message from the moderator</h2>
    ${list.map((w) => `<div class="warn-item"><p>${esc(w.message)}</p><span class="m-sub">${new Date(w.at).toLocaleString()}</span></div>`).join('')}
    <p class="m-sub">Repeated problems can lead to a mute or ban.</p>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary small" data-x>I understand</button></div>`);
  m.dataset.locked = '1';
  m.querySelector('[data-x]').onclick = () => m.remove();
}

// Announcement and maintenance strip at the top of the menu.
export function bannerHTML(app) {
  const items = [];
  const mt = app.maintenance;
  if (mt) items.push({ kind: 'warn', message: mt.message || 'Online play is paused for maintenance. Training and bot matches still work.' });
  const boost = app.appSettings?.xp_boost;
  if (boost && Date.parse(boost.until) > Date.now() && boost.multiplier > 1) items.push({ kind: 'event', message: `${boost.multiplier}× XP event — ends ${new Date(boost.until).toLocaleString()}` });
  for (const a of app.announcementsList || []) items.push(a);
  const motd = app.appSettings?.motd;
  if (motd?.text) items.push({ kind: 'info', message: motd.text });
  return items.slice(0, 3).map((a) => `<div class="m-banner ${esc(a.kind || 'info')}"><b>${a.kind === 'warn' ? 'Notice' : a.kind === 'event' ? 'Event' : 'News'}</b><span>${esc(a.message)}</span></div>`).join('');
}
