// Admin panel. Only shown when the database confirms the signed-in account is an admin
// (public.admins, which only holds Carter's account), and every action here goes through an
// admin_* database function that re-checks that on the server. Hiding or showing this screen
// in the browser grants nothing.
import { KINDS } from '../data/skins.js';
import { MODES, rankBadge } from '../data/modes.js';
import { MAPS } from '../data/maps.js';
import { REPORT_REASONS, COMMENDS, esc, banUntil, isActive } from './social.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
// Report evidence is written by the reporting player, so numbers are forced to numbers.
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const REASON = Object.fromEntries(REPORT_REASONS.map(([k, l]) => [k, l.split(' (')[0]]));
const DURATIONS = [[60, '1 hour'], [1440, '1 day'], [10080, '7 days'], [43200, '30 days'], [0, 'Permanent']];
const SECTIONS = [['overview', 'Overview'], ['reports', 'Reports'], ['players', 'Players'], ['moderated', 'Bans & mutes'], ['live', 'Online now'], ['announce', 'Announcements'], ['settings', 'Game switches'], ['audit', 'Audit log']];

// Small form dialog. fields: [{id, label, type: 'text'|'textarea'|'select'|'number', options, value}]. Resolves to values or null.
function ask(ui, title, fields, { confirm = 'Confirm', danger = false, note = '' } = {}) {
  return new Promise((resolve) => {
    const m = ui.modal(`<h2 class="m-h2">${esc(title)}</h2>${note ? `<p class="m-sub">${esc(note)}</p>` : ''}
      ${fields.map((f) => `<label class="field"><span>${esc(f.label)}</span>${f.type === 'select'
        ? `<select data-f="${f.id}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(f.value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
        : f.type === 'textarea' ? `<textarea data-f="${f.id}" rows="3" maxlength="${f.max || 300}">${esc(f.value || '')}</textarea>`
          : `<input data-f="${f.id}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.max ? `maxlength="${f.max}"` : ''}>`}</label>`).join('')}
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn small ghost" data-x>Cancel</button><button class="btn small ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirm)}</button></div>`);
    const done = (v) => { m.remove(); resolve(v); };
    m.querySelector('[data-x]').onclick = () => done(null);
    m.querySelector('[data-ok]').onclick = () => done(Object.fromEntries([...m.querySelectorAll('[data-f]')].map((e) => [e.dataset.f, e.value])));
    m.querySelector('[data-f]')?.focus();
  });
}

export class AdminPanel {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
    this.section = 'overview';
    this.reportFilter = 'open';
  }

  async call(fn, args, ok) {
    try {
      const r = await this.app.api.admin(fn, args);
      if (ok) this.ui.toast(ok, 'good');
      return r;
    } catch (e) {
      this.ui.toast(e.missing ? 'Admin tools need the database update (supabase/schema.sql) first.' : e.message, 'bad', null, 6000);
      throw e;
    }
  }

  render(el) {
    this.el = el;
    if (!this.app.isAdmin) { el.innerHTML = '<p class="m-empty">Not available.</p>'; return; }
    el.innerHTML = `<div class="row"><h2 class="m-h1">Admin</h2><span class="spacer"></span><span class="admin-badge">Moderator · ${esc(this.app.me().name)}</span></div>
      <div class="m-switch scroll" id="adm-tabs">${SECTIONS.map(([k, l]) => `<button data-s="${k}" class="${k === this.section ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="adm-body"><p class="m-sub">Loading…</p></div>`;
    el.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { this.section = b.dataset.s; this.render(el); }; });
    this.body = el.querySelector('#adm-body');
    this[this.section]?.().catch((e) => { this.body.innerHTML = `<p class="err">${esc(e.message)}</p>`; });
  }

  refresh() { this.render(this.el); }

  // ───────────── overview ─────────────
  async overview() {
    const o = await this.call('overview');
    const mt = o.settings?.maintenance?.on;
    this.body.innerHTML = `<div class="adm-stats">
      ${[['players', 'Players'], ['new_today', 'New today'], ['active_today', 'Active today'], ['matches_today', 'Matches today'], ['open_reports', 'Open reports'], ['banned', 'Banned'], ['muted', 'Muted']].map(([k, l]) => `<div class="${k === 'open_reports' && o[k] ? 'hot' : ''}"><b>${Number(o[k] || 0).toLocaleString()}</b><span>${l}</span></div>`).join('')}
      <div><b>${esc((o.season || '—').toUpperCase())}</b><span>Current season</span></div></div>
      ${mt ? '<p class="m-banner warn"><b>Maintenance on</b><span>Online play is paused for everyone but you.</span></p>' : ''}
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn small primary" data-go="reports">Review reports</button><button class="btn small" data-go="players">Find a player</button><button class="btn small" data-go="announce">Post an announcement</button><button class="btn small" data-go="settings">Game switches</button></div>`;
    this.body.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => { this.section = b.dataset.go; this.refresh(); }; });
  }

  // ───────────── reports ─────────────
  async reports() {
    const list = await this.call('reports', { p_status: this.reportFilter, p_limit: 100 });
    this.body.innerHTML = `<div class="seg" id="rf">${[['open', 'Open'], ['actioned', 'Actioned'], ['dismissed', 'Dismissed'], ['all', 'All']].map(([k, l]) => `<button data-k="${k}" class="${k === this.reportFilter ? 'sel' : ''}">${l}</button>`).join('')}</div>
      ${list.length ? list.map((r) => `<div class="adm-report ${r.status}">
        <div class="ar-head"><b class="ar-reason">${esc(REASON[r.reason] || r.reason)}</b><span>against <a href="#" data-player="${r.target}">${esc(r.target_name)}</a>${r.target_report_count > 1 ? ` <em class="hot">${r.target_report_count} reports total</em>` : ''}</span><span class="spacer"></span><span class="m-sub">${when(r.created_at)}</span></div>
        <div class="m-sub">From ${esc(r.reporter_name)} · ${esc(MODES[r.mode]?.name || r.mode || '')}${r.evidence?.map ? ` on ${esc(MAPS[r.evidence.map]?.name || r.evidence.map)}` : ''} · match ${esc(r.match_id)}</div>
        ${r.note ? `<p class="ar-note">“${esc(r.note)}”</p>` : ''}
        ${r.evidence?.stats ? `<div class="m-sub">Their stats that match: ${num(r.evidence.stats.k)} kills, ${num(r.evidence.stats.d)} deaths, ${num(r.evidence.stats.hs)} headshots, ${num(r.evidence.stats.dmg)} damage</div>` : ''}
        ${r.evidence?.chat?.length ? `<div class="ar-chat">${r.evidence.chat.map((c) => `<div><span class="m-sub">${Math.floor(c.t / 60)}:${String(c.t % 60).padStart(2, '0')}</span> ${esc(c.text)}</div>`).join('')}</div>` : ''}
        ${r.status !== 'open' ? `<div class="m-sub">${esc(r.status)}${r.resolution ? ': ' + esc(r.resolution) : ''} · ${when(r.resolved_at)}</div>` : ''}
        <div class="row ar-actions">
          <button class="btn tiny" data-player="${r.target}">Open player</button>
          <button class="btn tiny danger" data-act="ban" data-u="${r.target}" data-r="${r.id}">Ban</button>
          <button class="btn tiny" data-act="mute" data-u="${r.target}" data-r="${r.id}">Mute</button>
          <button class="btn tiny" data-act="warn" data-u="${r.target}" data-r="${r.id}">Warn</button>
          <button class="btn tiny" data-act="kick" data-u="${r.target}" data-r="${r.id}">Kick</button>
          ${r.status === 'open' ? `<button class="btn tiny ghost" data-resolve="${r.id}" data-st="actioned">Mark handled</button><button class="btn tiny ghost" data-resolve="${r.id}" data-st="dismissed">Dismiss</button>` : `<button class="btn tiny ghost" data-resolve="${r.id}" data-st="open">Reopen</button>`}
        </div></div>`).join('') : '<p class="m-empty">No reports here.</p>'}`;
    this.body.querySelectorAll('#rf button').forEach((b) => { b.onclick = () => { this.reportFilter = b.dataset.k; this.refresh(); }; });
    this.bindPlayerLinks(this.body);
    this.bindActions(this.body);
    this.body.querySelectorAll('[data-resolve]').forEach((b) => { b.onclick = async () => {
      const st = b.dataset.st;
      const v = st === 'open' ? { note: '' } : await ask(this.ui, st === 'dismissed' ? 'Dismiss report' : 'Mark report handled', [{ id: 'note', label: 'Note (optional)', type: 'textarea' }]);
      if (!v) return;
      await this.call('resolve_report', { p_id: +b.dataset.resolve, p_status: st, p_note: v.note }, 'Report updated');
      this.refresh();
    }; });
  }

  // ───────────── players ─────────────
  async players() {
    this.body.innerHTML = `<div class="row" style="gap:8px"><input type="text" id="adm-q" placeholder="Search by username" aria-label="Search players" value="${esc(this.query || '')}"><button class="btn small" id="adm-search">Search</button></div>
      <div id="adm-results"></div><div id="adm-player"></div>`;
    const q = this.body.querySelector('#adm-q');
    const go = async () => {
      this.query = q.value.trim();
      const res = this.body.querySelector('#adm-results');
      if (!this.query) { res.innerHTML = ''; return; }
      const rows = await this.app.api.searchPlayers(this.query);
      res.innerHTML = rows.length ? `<div class="adm-list">${rows.map((r) => `<button class="adm-row" data-player="${r.id}"><b>${esc(r.username)}</b>${rankBadge(r.elo)}<span class="m-sub">${r.matches} matches</span></button>`).join('')}</div>` : '<p class="m-empty">No players match.</p>';
      this.bindPlayerLinks(res);
    };
    this.body.querySelector('#adm-search').onclick = go;
    q.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    if (this.query) go();
    if (this.playerId) this.showPlayer(this.playerId);
  }

  bindPlayerLinks(root) {
    root.querySelectorAll('[data-player]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); this.playerId = a.dataset.player; this.section = 'players'; if (this.body.querySelector('#adm-player')) this.showPlayer(this.playerId); else this.refresh(); }; });
  }

  async showPlayer(id) {
    const box = this.body.querySelector('#adm-player');
    if (!box) return;
    box.innerHTML = '<p class="m-sub">Loading player…</p>';
    const d = await this.call('player', { p_id: id });
    const p = d.profile, m = d.moderation || {};
    if (!p) { box.innerHTML = '<p class="m-empty">Player not found.</p>'; return; }
    const banned = isActive(m.banned_until), muted = isActive(m.muted_until);
    const commends = COMMENDS.map(([k, l, i]) => `${i} ${l} ${d.commends?.[k] || 0}`).join(' · ');
    box.innerHTML = `<div class="adm-player">
      <div class="row"><h3 class="m-h2">${esc(p.username)}</h3>${rankBadge(p.elo)}${d.is_admin ? '<span class="admin-badge">Admin</span>' : ''}${banned ? `<span class="tag bad">Banned ${esc(banUntil(m.banned_until))}</span>` : ''}${muted ? `<span class="tag warn">Muted ${esc(banUntil(m.muted_until))}</span>` : ''}</div>
      <div class="m-sub">Joined ${when(p.created_at)} · last seen ${when(p.last_seen)} · id ${esc(p.id)}</div>
      ${banned && m.ban_reason ? `<div class="m-sub">Ban reason: ${esc(m.ban_reason)}</div>` : ''}${muted && m.mute_reason ? `<div class="m-sub">Mute reason: ${esc(m.mute_reason)}</div>` : ''}
      <div class="st-nums small">
        <div><b>${p.elo}</b><span>Rating (peak ${p.peak_elo})</span></div><div><b>${p.ranked_wins}–${p.ranked_losses}</b><span>Ranked</span></div>
        <div><b>${p.wins}–${p.losses}</b><span>Online W–L</span></div><div><b>${p.kills}/${p.deaths}</b><span>Kills / deaths</span></div>
        <div><b>${p.headshots}</b><span>Headshots</span></div><div><b>${(p.xp || 0).toLocaleString()}</b><span>XP (season ${(p.pass_xp || 0).toLocaleString()})</span></div></div>
      <div class="m-sub">Commends: ${commends} · Reports against: ${d.reports_against.length} · Reports filed: ${d.reports_filed}</div>
      ${d.is_admin ? '<p class="m-sub">Admins can’t be banned, muted, kicked or warned.</p>' : ''}
      <div class="row ar-actions">
        ${d.is_admin ? '' : `${banned ? `<button class="btn tiny" data-act="unban" data-u="${p.id}">Unban</button>` : `<button class="btn tiny danger" data-act="ban" data-u="${p.id}">Ban</button>`}
        ${muted ? `<button class="btn tiny" data-act="unmute" data-u="${p.id}">Unmute</button>` : `<button class="btn tiny" data-act="mute" data-u="${p.id}">Mute</button>`}
        <button class="btn tiny" data-act="kick" data-u="${p.id}">Kick from match</button><button class="btn tiny" data-act="warn" data-u="${p.id}">Warn</button>`}
        <button class="btn tiny" data-act="rename" data-u="${p.id}" data-name="${esc(p.username)}">Rename</button>
        <button class="btn tiny" data-act="stats" data-u="${p.id}">Edit stats</button>
        <button class="btn tiny" data-act="grant" data-u="${p.id}">Give item</button>
        <button class="btn tiny" data-act="revoke" data-u="${p.id}">Remove item</button>
        <button class="btn tiny danger" data-act="reset" data-u="${p.id}">Reset stats</button>
      </div>
      ${d.warnings.length ? `<h4 class="m-h3">Warnings</h4>${d.warnings.map((w) => `<div class="m-sub">${when(w.created_at)} · ${esc(w.message)}${w.seen ? ' · seen' : ''}</div>`).join('')}` : ''}
      ${d.reports_against.length ? `<h4 class="m-h3">Reports against them</h4>${d.reports_against.map((r) => `<div class="m-sub">${when(r.created_at)} · ${esc(REASON[r.reason])} from ${esc(r.reporter_name)} · ${esc(r.status)}${r.note ? ` · “${esc(r.note)}”` : ''}</div>`).join('')}` : ''}
      <h4 class="m-h3">Recent matches</h4>
      ${d.matches.length ? `<table class="tbl"><tr><th>When</th><th>Mode</th><th>Map</th><th>Result</th><th class="num">K–D</th><th class="num">ELO</th><th></th></tr>${d.matches.map((h) => `<tr><td class="m-sub">${when(h.created_at)}</td><td>${esc(MODES[h.mode]?.name || h.mode)}</td><td>${esc(MAPS[h.map]?.name || h.map)}</td><td class="res-${h.result}">${esc(h.result)}</td><td class="num">${h.kills}–${h.deaths}</td><td class="num">${h.ranked ? (h.elo_change > 0 ? '+' : '') + h.elo_change : '—'}</td><td>${h.ranked && h.elo_change ? `<button class="btn tiny ghost" data-void="${esc(h.match_id)}">Void result</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="m-empty">No matches.</p>'}
      ${d.seasons.length ? `<h4 class="m-h3">Past seasons</h4>${d.seasons.map((s) => `<div class="m-sub">${esc(s.season_id.toUpperCase())}: ${s.final_elo} final, ${s.peak_elo} peak, ${s.wins}–${s.losses}, ${s.pass_xp.toLocaleString()} season XP</div>`).join('')}` : ''}
    </div>`;
    this.bindActions(box, () => this.showPlayer(id));
    box.querySelectorAll('[data-void]').forEach((b) => { b.onclick = async () => {
      const v = await ask(this.ui, 'Void ranked result', [], { confirm: 'Void it', danger: true, note: `Reverses both players' rating change and win/loss for match ${b.dataset.void}.` });
      if (!v) return;
      await this.call('void_ranked', { p_match_id: b.dataset.void }, 'Ranked result voided');
      this.showPlayer(id);
    }; });
    box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // Ban / mute / warn / kick / rename / stats / items buttons.
  bindActions(root, after = () => this.refresh()) {
    root.querySelectorAll('[data-act]').forEach((b) => { b.onclick = async () => {
      const u = b.dataset.u, act = b.dataset.act, rid = b.dataset.r;
      let v;
      try {
        if (act === 'ban' || act === 'mute') {
          v = await ask(this.ui, act === 'ban' ? 'Ban player' : 'Mute player', [{ id: 'mins', label: 'Length', type: 'select', options: DURATIONS, value: act === 'ban' ? 1440 : 60 }, { id: 'reason', label: 'Reason (shown to them)', type: 'textarea' }],
            { confirm: act === 'ban' ? 'Ban' : 'Mute', danger: act === 'ban', note: act === 'ban' ? 'They are removed from any match and blocked from online play, ranked and XP.' : 'Their chat is blocked and hidden from other players.' });
          if (!v) return;
          await this.call(act, { p_user: u, p_minutes: +v.mins, p_reason: v.reason }, act === 'ban' ? 'Player banned' : 'Player muted');
        } else if (act === 'unban' || act === 'unmute') {
          await this.call(act, { p_user: u }, act === 'unban' ? 'Ban lifted' : 'Mute lifted');
        } else if (act === 'kick') {
          v = await ask(this.ui, 'Kick from current match', [{ id: 'reason', label: 'Reason (shown to them)', type: 'text', max: 200 }], { confirm: 'Kick' });
          if (!v) return;
          await this.call('kick', { p_user: u, p_reason: v.reason }, 'Kick sent — it takes effect within 30 seconds');
        } else if (act === 'warn') {
          v = await ask(this.ui, 'Send a warning', [{ id: 'msg', label: 'Message', type: 'textarea', max: 500 }], { confirm: 'Send' });
          if (!v || !v.msg.trim()) return;
          await this.call('warn', { p_user: u, p_message: v.msg }, 'Warning sent');
        } else if (act === 'rename') {
          v = await ask(this.ui, 'Rename player', [{ id: 'name', label: 'New username (3–16 letters, numbers or _)', type: 'text', value: b.dataset.name, max: 16 }], { confirm: 'Rename' });
          if (!v) return;
          await this.call('rename', { p_user: u, p_name: v.name.trim() }, 'Username changed');
        } else if (act === 'stats') {
          const d = await this.app.api.profile(u);
          const keys = ['elo', 'peak_elo', 'ranked_wins', 'ranked_losses', 'wins', 'losses', 'matches', 'kills', 'deaths', 'headshots', 'xp', 'pass_xp'];
          v = await ask(this.ui, 'Edit stats', keys.map((k) => ({ id: k, label: k.replace(/_/g, ' '), type: 'number', value: d[k] ?? 0 })), { confirm: 'Save' });
          if (!v) return;
          const patch = Object.fromEntries(keys.filter((k) => String(d[k] ?? 0) !== v[k]).map((k) => [k, Math.max(0, Math.round(+v[k] || 0))]));
          if (!Object.keys(patch).length) return;
          await this.call('set_stats', { p_user: u, p_patch: patch }, 'Stats updated');
        } else if (act === 'reset') {
          v = await ask(this.ui, 'Reset all stats', [], { confirm: 'Reset everything', danger: true, note: 'Rating back to 1000; wins, kills, XP and season progress to zero. Match history is kept.' });
          if (!v) return;
          await this.call('reset_stats', { p_user: u }, 'Stats reset');
        } else if (act === 'grant' || act === 'revoke') {
          const items = Object.entries(KINDS).flatMap(([k, def]) => Object.entries(def.defs).filter(([, x]) => !x.starter && !x.milestone).map(([id, x]) => [`${k}:${id}`, `${def.label} — ${x.name}${x.season ? ` (${x.season.toUpperCase()})` : ''}`]));
          v = await ask(this.ui, act === 'grant' ? 'Give an item' : 'Remove an item', [{ id: 'item', label: 'Item', type: 'select', options: items, value: items[0][0] }], { confirm: act === 'grant' ? 'Give' : 'Remove', danger: act === 'revoke', note: 'It reaches their inventory the next time their game checks in (within 30 seconds).' });
          if (!v) return;
          const [kind, item] = v.item.split(':');
          await this.call('grant_item', { p_user: u, p_kind: kind, p_item: item, p_revoke: act === 'revoke' }, act === 'grant' ? 'Item sent' : 'Removal sent');
        }
        if (rid && ['ban', 'mute', 'warn', 'kick'].includes(act)) await this.call('resolve_report', { p_id: +rid, p_status: 'actioned', p_note: act }).catch(() => null);
        after();
      } catch { /* toast already shown */ }
    }; });
  }

  // ───────────── bans & mutes ─────────────
  async moderated() {
    const list = await this.call('moderated', { p_limit: 200 });
    this.body.innerHTML = list.length ? `<table class="tbl"><tr><th>Player</th><th>Ban</th><th>Mute</th><th>Updated</th><th></th></tr>
      ${list.map((m) => `<tr><td><a href="#" data-player="${m.user_id}">${esc(m.username)}</a></td>
        <td>${isActive(m.banned_until) ? `${esc(banUntil(m.banned_until))}${m.ban_reason ? `<div class="m-sub">${esc(m.ban_reason)}</div>` : ''}` : '—'}</td>
        <td>${isActive(m.muted_until) ? `${esc(banUntil(m.muted_until))}${m.mute_reason ? `<div class="m-sub">${esc(m.mute_reason)}</div>` : ''}` : '—'}</td>
        <td class="m-sub">${when(m.updated_at)}</td>
        <td class="rate">${isActive(m.banned_until) ? `<button class="btn tiny" data-act="unban" data-u="${m.user_id}">Unban</button>` : ''}${isActive(m.muted_until) ? `<button class="btn tiny" data-act="unmute" data-u="${m.user_id}">Unmute</button>` : ''}</td></tr>`).join('')}</table>`
      : '<p class="m-empty">Nobody is banned or muted.</p>';
    this.bindPlayerLinks(this.body);
    this.bindActions(this.body);
  }

  // ───────────── online now ─────────────
  async live() {
    const list = this.app.onlinePlayers();
    this.body.innerHTML = `<p class="m-sub">${list.length} player${list.length === 1 ? '' : 's'} online. Spectate a match to see what's happening.</p>
      ${list.length ? `<table class="tbl"><tr><th>Player</th><th>Status</th><th></th></tr>${list.map((m) => `<tr><td><a href="#" data-player="${esc(m.id)}">${esc(m.name)}</a></td><td class="m-sub">${esc(m.status || 'menu')}${m.match ? ` · ${esc(MODES[m.match.mode]?.name || m.match.mode)} on ${esc(MAPS[m.match.map]?.name || m.match.map)}` : ''}</td>
        <td class="rate">${m.match?.id && m.id !== this.app.user?.id ? `<button class="btn tiny" data-spec="${esc(m.id)}">Spectate</button>` : ''}<button class="btn tiny" data-act="kick" data-u="${esc(m.id)}">Kick</button></td></tr>`).join('')}</table>` : ''}`;
    this.bindPlayerLinks(this.body);
    this.bindActions(this.body);
    this.body.querySelectorAll('[data-spec]').forEach((b) => { b.onclick = () => this.app.spectate(list.find((m) => m.id === b.dataset.spec)?.match); });
  }

  // ───────────── announcements ─────────────
  async announce() {
    const list = await this.call('announcements');
    const live = (a) => new Date(a.ends_at) > new Date() && new Date(a.starts_at) <= new Date();
    this.body.innerHTML = `<div class="adm-form">
      <label class="field"><span>Message (shown at the top of everyone's menu)</span><textarea id="an-msg" rows="2" maxlength="300"></textarea></label>
      <div class="row" style="gap:8px;flex-wrap:wrap"><label class="field"><span>Style</span><select id="an-kind"><option value="info">News</option><option value="warn">Notice</option><option value="event">Event</option></select></label>
      <label class="field"><span>Show for</span><select id="an-h"><option value="1">1 hour</option><option value="6">6 hours</option><option value="24" selected>1 day</option><option value="72">3 days</option><option value="168">1 week</option></select></label>
      <button class="btn small primary" id="an-post" style="align-self:flex-end">Post</button></div></div>
      <h3 class="m-h3">Recent</h3>${list.length ? list.map((a) => `<div class="adm-ann ${live(a) ? 'live' : ''}"><span class="tag">${esc(a.kind)}</span><span>${esc(a.message)}</span><span class="spacer"></span><span class="m-sub">${live(a) ? 'until ' + when(a.ends_at) : 'ended'}</span>${live(a) ? `<button class="btn tiny ghost" data-end="${a.id}">End now</button>` : ''}</div>`).join('') : '<p class="m-empty">None yet.</p>'}`;
    this.body.querySelector('#an-post').onclick = async () => {
      const msg = this.body.querySelector('#an-msg').value.trim();
      if (!msg) return this.ui.toast('Write a message first', 'bad');
      await this.call('announce', { p_message: msg, p_hours: +this.body.querySelector('#an-h').value, p_kind: this.body.querySelector('#an-kind').value }, 'Announcement posted');
      this.app.pollStatus();
      this.refresh();
    };
    this.body.querySelectorAll('[data-end]').forEach((b) => { b.onclick = async () => { await this.call('end_announcement', { p_id: +b.dataset.end }, 'Announcement ended'); this.app.pollStatus(); this.refresh(); }; });
  }

  // ───────────── game switches ─────────────
  async settings() {
    const o = await this.call('overview');
    const s = o.settings || {}, mt = s.maintenance || {}, boost = s.xp_boost || {}, motd = s.motd || {};
    const boostOn = boost.until && new Date(boost.until) > new Date() && boost.multiplier > 1;
    this.body.innerHTML = `<div class="adm-switch"><div><b>Maintenance mode</b><p class="m-sub">Stops everyone except you from queueing, joining lobbies or starting online matches. Bot matches and training still work.</p>
        <input type="text" id="mt-msg" maxlength="200" placeholder="Message to players" value="${esc(mt.message || '')}"></div>
        <button class="btn small ${mt.on ? 'danger' : ''}" id="mt-toggle">${mt.on ? 'Turn off' : 'Turn on'}</button></div>
      <div class="adm-switch"><div><b>XP event</b><p class="m-sub">${boostOn ? `${boost.multiplier}× XP until ${when(boost.until)}.` : 'Multiply match XP (and season track XP) for everyone.'}</p>
        <div class="row" style="gap:8px"><select id="xb-m"><option value="1.5">1.5×</option><option value="2" selected>2×</option><option value="3">3×</option></select><select id="xb-h"><option value="2">2 hours</option><option value="24">1 day</option><option value="48" selected>Weekend (2 days)</option><option value="168">1 week</option></select></div></div>
        <div class="row" style="gap:6px">${boostOn ? '<button class="btn small" id="xb-off">End event</button>' : ''}<button class="btn small primary" id="xb-on">${boostOn ? 'Restart' : 'Start'}</button></div></div>
      <div class="adm-switch"><div><b>Message of the day</b><p class="m-sub">A standing line in the menu banner, until you clear it.</p><input type="text" id="motd" maxlength="200" value="${esc(motd.text || '')}" placeholder="e.g. Season 1 ends Dec 31 — finish your track!"></div>
        <button class="btn small" id="motd-save">Save</button></div>`;
    const $ = (q) => this.body.querySelector(q);
    $('#mt-toggle').onclick = async () => { await this.call('set_setting', { p_key: 'maintenance', p_value: { on: !mt.on, message: $('#mt-msg').value.trim() } }, mt.on ? 'Maintenance off' : 'Maintenance on'); this.app.pollStatus(); this.refresh(); };
    $('#xb-on').onclick = async () => { const h = +$('#xb-h').value; await this.call('set_setting', { p_key: 'xp_boost', p_value: { multiplier: +$('#xb-m').value, until: new Date(Date.now() + h * 3600e3).toISOString() } }, 'XP event started'); this.app.pollStatus(); this.refresh(); };
    $('#xb-off')?.addEventListener('click', async () => { await this.call('set_setting', { p_key: 'xp_boost', p_value: { multiplier: 1, until: new Date().toISOString() } }, 'XP event ended'); this.app.pollStatus(); this.refresh(); });
    $('#motd-save').onclick = async () => { await this.call('set_setting', { p_key: 'motd', p_value: { text: $('#motd').value.trim() } }, 'Saved'); this.app.pollStatus(); };
  }

  // ───────────── audit log ─────────────
  async audit() {
    const list = await this.call('audit_log', { p_limit: 200 });
    this.body.innerHTML = list.length ? `<table class="tbl"><tr><th>When</th><th>Action</th><th>Target</th><th>Details</th></tr>
      ${list.map((a) => `<tr><td class="m-sub">${when(a.created_at)}</td><td>${esc(a.action.replace(/_/g, ' '))}</td><td>${a.target_name ? `<a href="#" data-player="${esc(a.target)}">${esc(a.target_name)}</a>` : esc(a.target || '')}</td><td class="m-sub">${esc(a.details ? JSON.stringify(a.details) : '')}</td></tr>`).join('')}</table>`
      : '<p class="m-empty">No admin actions yet.</p>';
    this.bindPlayerLinks(this.body);
  }
}
