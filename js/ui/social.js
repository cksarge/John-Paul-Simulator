// Commend and report dialogs for the results screen.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
