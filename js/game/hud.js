import * as THREE from 'three';
import { WEAPONS, GRENADES, BUY_MENU, itemInfo, GUN_GAME_ORDER } from '../data/weapons.js';
import { TEAM_CLASS, SOLO_KINDS, RESPAWN_KINDS, goalText, econFor } from '../data/modes.js';
import { RARITIES, KINDS } from '../data/skins.js';
import { itemSwatch, emoteName, cardImage } from '../ui/cards.js';
import { spreadFor } from './combat.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

// In-match DOM overlay: vitals, scores, killfeed, radar and the interactive panels.
export class Hud {
  constructor(game) {
    this.g = game;
    this.root = document.getElementById('hud');
    this.t = 0;
    this.overlay = null;
    this.centerT = 0;
    this.infoT = 0;
  }

  mount() {
    const r = this.root;
    r.classList.remove('hidden');
    r.innerHTML = `
      <div class="radar"><canvas width="200" height="200"></canvas></div>
      <div class="fps hidden"></div>
      <div class="topscore"></div>
      <div class="goal-pill"></div>
      <div class="alive-row"></div>
      <div class="killfeed"></div>
      <div class="crosshair"></div>
      <div class="hitmarker"></div>
      <div class="dmg-ind"></div>
      <div class="flash"></div>
      <div class="blind"></div>
      <div class="scope hidden"></div>
      <div class="center-msg"></div>
      <div class="info-msg"></div>
      <div class="progress hidden"><div class="lbl"></div><div class="bar"><div></div></div></div>
      <div class="spectate hidden"></div>
      <div class="bomb-icon hidden">◆ CHARGE</div>
      <div class="money"></div>
      <div class="hud-bottom-left">
        <div class="hp"><div class="hud-label">Health</div><div class="hud-num">100</div><div class="hp-bar"><div></div></div></div>
        <div class="ar"><div class="hud-label">Armor</div><div class="hud-num">0</div></div>
      </div>
      <div class="hud-bottom-right">
        <div class="slots"></div>
        <div class="weapon-name"></div>
        <div class="ammo"><div class="hud-num"></div></div>
      </div>
      <div class="chat"></div>
      <div class="emote-wheel hidden"></div>
      <div class="killcam hidden"></div>
      <div class="ovl"></div>`;
    const q = (s) => r.querySelector(s);
    this.el = {
      radar: q('.radar canvas'), fps: q('.fps'), top: q('.topscore'), alive: q('.alive-row'), kf: q('.killfeed'),
      ch: q('.crosshair'), hm: q('.hitmarker'), dmg: q('.dmg-ind'), flash: q('.flash'), blind: q('.blind'), scope: q('.scope'),
      center: q('.center-msg'), goal: q('.goal-pill'), info: q('.info-msg'), prog: q('.progress'), spec: q('.spectate'), bomb: q('.bomb-icon'),
      money: q('.money'), hp: q('.hp'), ar: q('.ar'), slots: q('.slots'), wname: q('.weapon-name'), ammo: q('.ammo .hud-num'),
      chat: q('.chat'), ovl: q('.ovl'), wheel: q('.emote-wheel'), killcam: q('.killcam'),
    };
    this.radarImg = this.g.world.radarCanvas(8);
    this.buildCrosshair();
    this.el.fps.classList.toggle('hidden', !this.g.settings.showFps);
  }

  unmount() {
    this.root.innerHTML = '';
    this.root.classList.add('hidden');
  }

  buildCrosshair() {
    const s = this.g.settings;
    this.el.ch.style.setProperty('--ch', s.crosshairColor);
    this.el.ch.innerHTML = `<i class="l"></i><i class="r"></i><i class="u"></i><i class="d"></i>${s.crosshairDot ? '<i class="dot"></i>' : ''}`;
    this.chParts = [...this.el.ch.querySelectorAll('i:not(.dot)')];
  }

  layoutCrosshair(gap) {
    const s = this.g.settings, L = s.crosshairSize, T = s.crosshairThick;
    const [l, r, u, d] = this.chParts;
    const set = (e, x, y, w, h) => { e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.width = w + 'px'; e.style.height = h + 'px'; };
    set(l, -gap - L, -T / 2, L, T); set(r, gap, -T / 2, L, T);
    set(u, -T / 2, -gap - L, T, L); set(d, -T / 2, gap, T, L);
  }

  overlayOpen() { return !!this.overlay; }

  closeOverlay(relock = true) {
    this.overlay = null;
    this.el.ovl.innerHTML = '';
    this.g.paused = false;
    if (relock && !this.g.ended) {
      this.g.input.lock().catch(() => {
        if (!this.overlay && !this.g.ended) this.showPause('The browser needs a moment after you leave the game. Click Resume again.');
      });
    }
  }

  showClickToPlay() {
    this.overlay = 'start';
    const m = this.g.mode, map = this.g.mapDef;
    this.el.ovl.innerHTML = `<div class="overlay"><div class="panel pause" style="text-align:center">
      <h3>${esc(m.name)} · ${esc(map.name)}</h3>
      <h1 style="margin:0">Ready up</h1>
      <p class="muted small">WASD move · Space jump · Ctrl crouch · Shift walk · R reload · B buy (1-3 presets) · F rebuy · K keep loadout · E doors, ammo, plant/defuse · Tab scores · 1-5 weapons</p>
      <p class="goal-tag" style="margin:0">${esc(goalText(m))}</p>
      <button class="btn primary big" data-a="go">Click to play</button>
    </div></div>`;
    this.el.ovl.querySelector('[data-a=go]').onclick = () => this.closeOverlay(true);
  }

  showPause(note = '') {
    this.overlay = 'pause';
    this.g.paused = true;
    this.el.ovl.innerHTML = `<div class="overlay"><div class="panel pause">
      <h2>Paused</h2>
      ${note ? `<p class="small" style="color:var(--accent);margin:0">${esc(note)}</p>` : ''}
      ${this.g.online ? '<p class="muted small">Online match keeps running.</p>' : ''}
      <button class="btn primary" data-a="resume">Resume</button>
      <button class="btn" data-a="settings">Settings</button>
      <button class="btn danger" data-a="leave">${this.g.mode.ranked ? 'Forfeit & leave' : 'Leave match'}</button>
    </div></div>`;
    const o = this.el.ovl;
    o.querySelector('[data-a=resume]').onclick = () => this.closeOverlay(true);
    o.querySelector('[data-a=settings]').onclick = () => {
      this.overlay = 'settings';
      this.g.app.ui.openSettingsModal(this.el.ovl, () => { this.buildCrosshair(); this.el.fps.classList.toggle('hidden', !this.g.settings.showFps); this.showPause(); });
    };
    o.querySelector('[data-a=leave]').onclick = () => this.g.leave();
  }

  // ───────────── buy menu ─────────────
  toggleBuy() {
    if (this.overlay === 'buy') return this.closeOverlay(true);
    this.openBuy();
  }

  openBuy() {
    if (!this.g.canBuy()) { this.info(SOLO_KINDS.has(this.g.mode.kind) ? `No buying in ${this.g.mode.name}` : 'You can only buy during the buy phase', 2); return; }
    this.overlay = 'buy';
    this.g.input.unlock();
    this.refreshBuy();
  }

  refreshBuy() {
    if (this.overlay !== 'buy') return;
    const g = this.g, p = g.local, free = !econFor(g.mode);
    const owned = (id) => (WEAPONS[id] && p.inv[WEAPONS[id].slot] === id && !(free && id === 'knife')) || (GRENADES[id] && p.inv.nades.includes(id)) || (id === 'kevlar' && p.armor >= 100) || (id === 'helmet' && p.helmet && p.armor >= 100);
    const names = (items) => items.map((i) => esc(itemInfo(i)?.name || i)).join(' · ');
    const cats = BUY_MENU.map((c) => `<div class="buy-cat"><h3>${c.title}</h3>${c.items.map((id) => {
      const info = itemInfo(id), price = g.priceOf(id);
      const cls = owned(id) ? 'owned' : p.money < price ? 'no' : '';
      return `<div class="buy-item ${cls}" data-id="${id}"><span>${esc(info.name)}</span><b>${free || !price ? 'FREE' : '$' + price}</b></div>`;
    }).join('')}</div>`).join('');
    this.el.ovl.innerHTML = `<div class="overlay" data-close><div class="buy-menu">
      <div class="row"><h2 style="margin:0">${free ? 'Choose loadout' : 'Buy menu'}</h2><span class="spacer"></span>
      ${free ? '' : `<span class="hud-num" style="font-size:28px;color:var(--good)">$${p.money}</span>`}
      <button class="btn small" data-a="rebuy" ${g.savedBuys.length ? '' : 'disabled'}>Rebuy last (F)</button>
      <button class="btn small ${g.settings.keepLoadout ? 'primary' : ''}" data-a="keep">Keep loadout: ${g.settings.keepLoadout ? 'ON' : 'OFF'} (K)</button>
      <button class="btn small" data-a="close">Done (B)</button></div>
      <p class="muted small" style="margin:8px 0 0">${g.savedBuys.length ? 'Last loadout: ' + names(g.savedBuys) : 'Whatever you end up holding after you buy becomes your last loadout.'} With <b>Keep loadout</b> on, it's re-equipped automatically every round${g.mode.kind === 'tdm' ? ' and respawn' : ''}.</p>
      <div class="presets">${g.presets().map((items, i) => `<div class="preset">
        <div class="preset-head"><b>Preset ${i + 1}</b><span class="muted small">${i + 1} equip · Shift+${i + 1} save</span></div>
        <div class="preset-items small">${items ? names(items) : '<span class="muted">Empty</span>'}</div>
        <div class="row"><button class="btn small primary" data-preset="${i}" ${items ? '' : 'disabled'}>Equip</button><button class="btn small" data-save="${i}">Save current</button></div>
      </div>`).join('')}</div>
      <div class="buy-cats" style="margin-top:14px">${cats}</div></div></div>`;
    this.el.ovl.querySelectorAll('.buy-item').forEach((e) => { e.onclick = () => g.buy(e.dataset.id); });
    this.el.ovl.querySelector('[data-a=close]').onclick = () => this.closeOverlay(true);
    this.el.ovl.querySelector('[data-a=rebuy]').onclick = () => g.rebuy(true);
    this.el.ovl.querySelector('[data-a=keep]').onclick = () => g.toggleKeepLoadout();
    this.el.ovl.querySelectorAll('[data-preset]').forEach((e) => { e.onclick = () => g.equipPreset(+e.dataset.preset); });
    this.el.ovl.querySelectorAll('[data-save]').forEach((e) => { e.onclick = () => g.savePreset(+e.dataset.save); });
    this.el.ovl.querySelector('[data-close]').onclick = (e) => { if (e.target.dataset.close !== undefined) this.closeOverlay(true); };
    if (!this.buyKey) {
      this.buyKey = (e) => {
        if (this.overlay !== 'buy') return;
        if (e.code === 'KeyB' || e.code === 'Escape') { e.preventDefault(); this.closeOverlay(e.code === 'KeyB'); }
        if (e.code === 'KeyF') this.g.rebuy(true);
        if (e.code === 'KeyK') this.g.toggleKeepLoadout();
        const n = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
        if (n !== undefined) { e.preventDefault(); if (e.shiftKey) this.g.savePreset(n); else this.g.equipPreset(n); }
      };
      addEventListener('keydown', this.buyKey);
    }
  }

  // ───────────── scoreboard ─────────────
  setScoreboard(on) {
    if (on && !this.overlay) { this.overlay = 'score'; this.renderScoreboard(); }
    else if (!on && this.overlay === 'score') { this.overlay = null; this.el.ovl.innerHTML = ''; }
    else if (on && this.overlay === 'score' && (this.sbT = (this.sbT || 0) + 1) % 20 === 0) this.renderScoreboard();
  }

  scoreTable(players, showMoney) {
    const lp = this.g.local;
    return `<table class="tbl"><tr><th>Player</th>${showMoney ? '<th class="num">$</th>' : ''}<th class="num">K</th><th class="num">D</th><th class="num">HS</th><th class="num">DMG</th>${this.g.online ? '<th class="num">ELO</th>' : ''}</tr>
      ${players.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).map((p) => `<tr class="${p === lp ? 'me' : ''} ${p.alive ? '' : 'dead'}">
        <td>${esc(p.name)}${this.g.state.bomb?.carrier === p.id && lp && p.team === lp.team ? ' <span style="color:var(--bad)">◆</span>' : ''}</td>
        ${showMoney ? `<td class="num">${lp && p.team === lp.team ? '$' + p.money : ''}</td>` : ''}
        <td class="num">${p.kills}</td><td class="num">${p.deaths}</td><td class="num">${p.hs}</td><td class="num">${Math.round(p.damage)}</td>
        ${this.g.online ? `<td class="num">${p.isBot ? '—' : p.elo}</td>` : ''}</tr>`).join('')}</table>`;
  }

  renderScoreboard() {
    const g = this.g, all = [...g.players.values()];
    let body;
    if (SOLO_KINDS.has(g.mode.kind)) body = `<div class="sb-team">${this.scoreTable(all, false)}</div>`;
    else body = [0, 1].map((t) => `<div class="sb-team"><div class="sb-head ${TEAM_CLASS[t]}"><span>${g.teamName(t)}</span><span>${g.state.scores[t]}</span></div>${this.scoreTable(all.filter((p) => p.team === t), !!econFor(g.mode))}</div>`).join('');
    this.el.ovl.innerHTML = `<div class="overlay" style="pointer-events:none;background:none"><div class="scoreboard">
      <div class="row"><h2 style="margin:0">${esc(g.mode.name)}</h2><span class="muted">${esc(g.mapDef.name)}${RESPAWN_KINDS.has(g.mode.kind) ? '' : ' · Round ' + g.state.round}</span><span class="spacer"></span><span class="goal-tag">${esc(goalText(g.mode))}</span></div>${body}</div></div>`;
  }

  // ───────────── chat ─────────────
  openChat() {
    if (this.overlay) return;
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 120; input.placeholder = 'Say something… (Enter to send)';
    this.el.chat.appendChild(input);
    this.g.input.typing = true;
    setTimeout(() => input.focus(), 0);
    const done = (send) => { if (send) this.g.chat(input.value); input.remove(); this.g.input.typing = false; };
    input.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
    input.onblur = () => done(false);
  }

  chatLine(name, text, team) {
    const ln = document.createElement('div');
    ln.className = 'ln';
    const color = team === 0 ? 'var(--t)' : team === 1 ? 'var(--ct)' : 'var(--muted)';
    ln.innerHTML = name ? `<b style="color:${color}">${esc(name)}:</b> ${esc(text)}` : `<i class="muted">${esc(text)}</i>`;
    const input = this.el.chat.querySelector('input');
    this.el.chat.insertBefore(ln, input);
    setTimeout(() => ln.classList.add('old'), 8000);
    setTimeout(() => ln.remove(), 9500);
  }

  // Kill cam banner: who killed you, with what, and their calling card. null hides it.
  killcam(info) {
    const el = this.el.killcam;
    this.root.classList.toggle('in-killcam', !!info);
    if (!info) { el.classList.add('hidden'); return; }
    const k = info.killer;
    const wname = itemInfo(info.weapon)?.name || info.weapon;
    el.innerHTML = `<div class="kc-tag"><i></i>KILL CAM</div>
      <div class="kc-card" style="background-image:url(${cardImage(k?.char?.card || 'standard')})">
        <div class="kc-text"><span>KILLED BY</span><b>${esc(k?.name || '')}</b><em>${esc(wname)}${info.hs ? ' · headshot' : ''}${info.hp ? ` · ${info.hp} HP left` : ''}</em></div>
      </div>
      <div class="kc-skip">Space · skip</div>`;
    el.classList.remove('hidden');
  }

  // Emote wheel while G is held. `list` null hides it.
  emoteWheel(list, sel = 0) {
    const el = this.el.wheel;
    if (!list) { el.classList.add('hidden'); this.wheelKey = ''; return; }
    const key = list.join() + sel;
    el.classList.remove('hidden');
    if (key === this.wheelKey) return;
    this.wheelKey = key;
    el.innerHTML = list.map((id, i) => `<div class="ew-slot s${i} ${i === sel ? 'sel' : ''}"><i>${itemSwatch('emote', id).glyph}</i><span>${esc(emoteName(id))}</span></div>`).join('') + '<div class="ew-hint">Move the mouse to choose · release G</div>';
  }

  // ───────────── feedback ─────────────
  center(text, sub = '', time = 3, team = -1) {
    this.el.center.innerHTML = `<div class="big ${team >= 0 ? TEAM_CLASS[team] : ''}">${esc(text)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}`;
    this.el.center.style.opacity = 1;
    this.centerT = time;
  }

  // Timed message. Persistent context hints (buy phase, plant here…) go through `hint` instead, so the
  // two never fight over the same line and nothing flickers when one expires.
  info(text, time = 3) { this.infoT = time; this.infoText = text; this.showInfoLine(); }

  showInfoLine() {
    const text = this.infoT > 0 ? this.infoText : this.hint || '';
    if (this.el.info.textContent !== text) this.el.info.textContent = text;
    this.el.info.style.opacity = text ? 1 : 0;
  }

  // Flashbang: white-out that fades over the last part of `time`.
  blind(time) {
    if (time <= 0.05) return;
    this.blindT = Math.max(this.blindT || 0, time);
  }

  hitmarker(head, kill) {
    const h = this.el.hm;
    h.className = 'hitmarker on' + (head ? ' hs' : '') + (kill ? ' kill' : '');
    clearTimeout(this.hmT);
    this.hmT = setTimeout(() => { h.className = 'hitmarker' + (head ? ' hs' : '') + (kill ? ' kill' : ''); }, 60);
  }

  damaged(by) {
    const f = this.el.flash;
    f.classList.add('on');
    setTimeout(() => f.classList.remove('on'), 50);
    const lp = this.g.local;
    if (by && lp) {
      const ang = Math.atan2(-(by.pos.x - lp.pos.x), -(by.pos.z - lp.pos.z)) - lp.yaw;
      const i = document.createElement('i');
      i.style.transform = `rotate(${-ang}rad)`;
      this.el.dmg.appendChild(i);
      setTimeout(() => { i.style.opacity = 0; }, 400);
      setTimeout(() => i.remove(), 1100);
    }
  }

  killfeed(k, v, w, hs) {
    const cls = (p) => (SOLO_KINDS.has(this.g.mode.kind) ? 'ffa' : TEAM_CLASS[p.team]);
    const e = document.createElement('div');
    const lp = this.g.local;
    e.className = 'kf' + ((k && k === lp) || v === lp ? ' mine' : '');
    const wname = itemInfo(w)?.name || { bomb: 'Charge', barrel: 'Exploding barrel', fire: 'Incendiary', fall: 'Fall' }[w] || w;
    e.innerHTML = `${k && k !== v ? `<span class="${cls(k)}">${esc(k.name)}</span>` : ''}<span class="w">${esc(wname)}</span>${hs ? '<span class="hs">◉ HS</span>' : ''}<span class="${cls(v)}">${esc(v.name)}</span>`;
    this.el.kf.prepend(e);
    while (this.el.kf.children.length > 6) this.el.kf.lastChild.remove();
    setTimeout(() => e.remove(), 7000);
  }

  // ───────────── results ─────────────
  showResults({ result, reason, scores, stats, score }) {
    this.overlay = 'results';
    const g = this.g, title = { win: 'VICTORY', loss: 'DEFEAT', draw: 'DRAW' }[result];
    const color = result === 'win' ? 'var(--good)' : result === 'loss' ? 'var(--bad)' : 'var(--muted)';
    const reasonText = { forfeit: 'Opponent forfeited', 'host-left': 'The host left the match', kills: 'Kill limit reached', time: 'Time limit reached', gungame: 'Got a kill with every weapon', score: '' }[reason] || '';
    const rows = [...stats].sort((a, b) => b.k - a.k).map((s) => `<tr class="${s.id === g.localId ? 'me' : ''}"><td>${esc(s.name)}</td>${!SOLO_KINDS.has(g.mode.kind) ? `<td style="color:var(--${TEAM_CLASS[s.team]})">${g.mode.kind === 'bomb' ? (s.team === 0 ? 'ATK' : 'DEF') : 'T' + (s.team + 1)}</td>` : ''}<td class="num">${s.k}</td><td class="num">${s.d}</td><td class="num">${s.hs}</td><td class="num">${s.dmg}</td></tr>`).join('');
    this.el.ovl.innerHTML = `<div class="overlay"><div class="panel" style="width:min(720px,94vw)">
      <div style="text-align:center"><div class="hud-num" style="font-size:64px;color:${color}">${title}</div>
      <div class="muted">${esc(g.mode.name)} · ${esc(g.mapDef.name)} · ${esc(score)}</div>
      ${reasonText ? `<div class="muted small">${esc(reasonText)}</div>` : ''}
      <div class="elo" style="margin:10px 0;font-family:var(--display);font-size:22px">${g.mode.ranked && g.app.user ? 'Updating rating…' : ''}</div>
      <div class="drop"></div></div>
      <table class="tbl"><tr><th>Player</th>${!SOLO_KINDS.has(g.mode.kind) ? '<th>Team</th>' : ''}<th class="num">K</th><th class="num">D</th><th class="num">HS</th><th class="num">DMG</th></tr>${rows}</table>
      <div class="row" style="justify-content:center;margin-top:16px"><button class="btn" data-a="replay">Watch replay</button><button class="btn primary" data-a="menu">Back to menu</button></div>
    </div></div>`;
    this.el.ovl.querySelector('[data-a=menu]').onclick = () => this.g.leave();
    this.el.ovl.querySelector('[data-a=replay]').onclick = () => {
      const app = this.g.app;
      this.g.destroy();
      app.game = null;
      setTimeout(() => (app.lastReplayId ? app.watchReplay(app.lastReplayId) : app.exitGame()), 150);
    };
  }

  showDrop(item) {
    const e = this.el.ovl.querySelector('.drop');
    if (!e || !item) return;
    const r = RARITIES[item.rarity];
    e.innerHTML = `<div class="drop-card" style="--rc:${r.color}"><span class="small muted">${item.duplicate ? 'Duplicate drop' : 'New item unlocked'}</span>
      <div class="drop-swatch" style="background:${itemSwatch(item.kind, item.id).bg}">${itemSwatch(item.kind, item.id).glyph}</div>
      <b>${esc(item.name)}</b><span style="color:${r.color}">${r.name} ${(KINDS[item.kind]?.label || '').toLowerCase()}</span></div>`;
  }

  setEloChange(delta, error) {
    const e = this.el.ovl.querySelector('.elo');
    if (!e) return;
    if (error) { e.innerHTML = `<span class="small" style="color:var(--bad)">${esc(error)}</span>`; return; }
    if (delta === null || delta === undefined) { e.textContent = this.g.app.user ? 'Stats saved' : ''; return; }
    e.innerHTML = `<span style="color:${delta >= 0 ? 'var(--good)' : 'var(--bad)'}">${delta >= 0 ? '+' : ''}${delta} ELO</span>`;
  }

  // ───────────── per-frame ─────────────
  update(dt) {
    const g = this.g, p = g.local, el = this.el, s = g.state;
    this.t += dt;
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) el.center.style.opacity = 0; }
    if (this.infoT > 0) { this.infoT -= dt; if (this.infoT <= 0) this.showInfoLine(); }
    if (this.blindT > 0 || this.blindShown) {
      this.blindT = Math.max(0, (this.blindT || 0) - dt);
      const o = Math.min(1, this.blindT / 1.6);
      el.blind.style.opacity = o.toFixed(3);
      this.blindShown = o > 0;
    }
    if (!p) return;

    // Crosshair (every frame — dynamic spread)
    const w = p.weapon;
    const spreadPx = w ? spreadFor(p) * (innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(g.engine.camera.fov / 2)) : 0;
    this.layoutCrosshair(g.settings.crosshairGap + Math.min(40, spreadPx * 0.6));
    const scoped = p.alive && p.ws.scope > 0;
    el.ch.style.display = scoped || !p.alive || g.emoteT > 0 || (w && w.type === 'sniper') ? 'none' : '';
    el.scope.classList.toggle('hidden', !scoped);

    // Plant/defuse progress
    if (g.action && p.alive) {
      const total = g.actionTime(g.action.type, p);
      el.prog.classList.remove('hidden');
      el.prog.querySelector('.lbl').textContent = g.action.type === 'plant' ? 'Planting charge…' : 'Defusing…';
      el.prog.querySelector('.bar div').style.width = Math.min(100, (g.action.t / total) * 100) + '%';
    } else el.prog.classList.add('hidden');

    this.radarT = (this.radarT || 0) - dt;
    if (this.radarT <= 0) { this.radarT = 1 / 30; this.drawRadar(); }

    this.slowT = (this.slowT || 0) - dt;
    if (this.slowT > 0) return;
    this.slowT = 0.1;
    if (g.settings.showFps) el.fps.textContent = `${Math.round(g.fpsAcc || 0)} FPS`;

    // Top score / timer
    const bomb = s.bomb || {};
    const planted = bomb.state === 'planted';
    const timer = planted ? bomb.time : s.time;
    const phaseLabel = { warmup: g.waitingForPlayers() ? 'WAITING' : 'WARMUP', buy: 'BUY', live: planted ? 'CHARGE' : '', post: '', over: 'FINAL' }[s.phase] ?? '';
    const kind = g.mode.kind;
    let goal = goalText(g.mode);
    if (kind === 'rounds' || kind === 'bomb') goal += ` · Round ${Math.max(1, s.round)}`;
    if (kind === 'ffa') {
      const lead = [...g.players.values()].sort((a, b) => b.kills - a.kills)[0];
      el.top.innerHTML = `<div class="ts ct" title="Your kills">${p.kills}</div><div class="timer">${fmtTime(timer)}<small>${lead ? 'LEAD ' + esc(lead.name) + ' ' + lead.kills : ''}</small></div><div class="ts t" title="Kills to win">${g.mode.killsToWin}</div>`;
      goal += ` · you have ${p.kills}`;
    } else if (kind === 'gungame') {
      const N = GUN_GAME_ORDER.length, lvl = Math.min((p.gg || 0) + 1, N);
      const lead = [...g.players.values()].sort((a, b) => (b.gg || 0) - (a.gg || 0) || b.kills - a.kills)[0];
      el.top.innerHTML = `<div class="ts ct" title="Your weapon level">${lvl}</div><div class="timer">${fmtTime(timer)}<small>${lead ? 'LEAD ' + esc(lead.name) + ' ' + Math.min((lead.gg || 0) + 1, N) : ''}</small></div><div class="ts t" title="Weapons">${N}</div>`;
      const next = GUN_GAME_ORDER[(p.gg || 0) + 1];
      goal += ` · weapon ${lvl}/${N}${next ? ' · next: ' + (WEAPONS[next]?.name || next) : ' · knife kill wins'}`;
    } else {
      el.top.innerHTML = `<div class="ts t">${s.scores[0]}</div><div class="timer ${planted ? 'bomb' : ''}">${fmtTime(timer)}<small>${phaseLabel}</small></div><div class="ts ct">${s.scores[1]}</div>`;
      if (kind === 'tdm') el.top.querySelector('.timer small').textContent = `TO ${g.mode.killsToWin}`;
      const pills = (t) => [...g.players.values()].filter((q) => q.team === t).map((q) => `<i class="${q.alive ? '' : 'dead'}"></i>`).join('');
      el.alive.innerHTML = `<div class="t">${pills(0)}</div><div class="ct">${pills(1)}</div>`;
    }

    el.goal.textContent = goal;

    // Vitals
    el.hp.querySelector('.hud-num').textContent = Math.max(0, p.hp);
    el.hp.querySelector('.hp-bar div').style.width = Math.max(0, p.hp) + '%';
    el.hp.classList.toggle('hp-low', p.hp <= 25);
    el.ar.querySelector('.hud-num').textContent = p.armor;
    el.ar.querySelector('.hud-label').textContent = p.helmet ? 'Armor + Helmet' : 'Armor';
    el.money.textContent = econFor(g.mode) ? `$${p.money}` : '';
    el.bomb.classList.toggle('hidden', !p.hasBomb);
    if (w) {
      el.wname.textContent = w.name;
      const a = p.ammo[w.id];
      el.ammo.innerHTML = a ? `${a.mag}<span> / ${a.reserve}</span>` : '';
      if (p.ws.reloadT >= 0) el.ammo.innerHTML = `<span>Reloading…</span>`;
    } else if (p.slot === 'nade') { el.wname.textContent = GRENADES[p.weaponId]?.name || ''; el.ammo.innerHTML = ''; }
    else if (p.slot === 'bomb') { el.wname.textContent = 'Demolition Charge'; el.ammo.innerHTML = ''; }
    const slotNames = [['primary', '1'], ['secondary', '2'], ['melee', '3'], ['nade', '4'], ['bomb', '5']];
    el.slots.innerHTML = slotNames.map(([sl, key]) => {
      let label = sl === 'nade' ? p.inv.nades.map((n) => GRENADES[n]?.short || n).join(' · ') : sl === 'bomb' ? (p.hasBomb ? 'Charge' : '') : WEAPONS[p.inv[sl]]?.name;
      if (!label) return '';
      return `<div class="${p.slot === sl ? 'cur' : ''}"><b>${key}</b>${esc(label)}</div>`;
    }).join('');

    // Spectate
    const st = g.spectateTarget;
    el.spec.classList.toggle('hidden', p.alive || !st || s.phase === 'over');
    if (!p.alive && st) el.spec.innerHTML = `Spectating <b>${esc(st.name)}</b> · ${st.hp} HP <span class="muted small">(click to switch)</span>`;

    // Contextual hints: recomputed every tick and shown whenever no timed message is up.
    let hint = '';
    if (p.alive && s.phase === 'live') {
      if (bomb.state === 'carried' && bomb.carrier === p.id && g.world.siteAt(p.pos.x, p.pos.z)) hint = 'Hold E to plant the charge';
      else if (planted && p.team === 1 && Math.hypot(p.pos.x - bomb.pos[0], p.pos.z - bomb.pos[2]) < 2.2) hint = 'Hold E to defuse';
      else hint = g.interactHint?.() || '';
    }
    if (s.phase === 'buy' && !this.overlay && p.alive) hint = econFor(g.mode) ? 'Buy phase — press B to open the buy menu' : 'Press B to choose your loadout';
    this.hint = hint;
    this.showInfoLine();
  }

  drawRadar() {
    const g = this.g, p = g.local, c = this.el.radar, ctx = c.getContext('2d');
    if (!p) return;
    const center = g.spectateTarget && !p.alive ? g.spectateTarget : p;
    const S = 8 / 2; // radar px per metre (radarCanvas uses 8 px per 2 m cell)
    const zoom = 0.75;
    ctx.save();
    ctx.clearRect(0, 0, 200, 200);
    ctx.translate(100, 100);
    ctx.rotate(center.yaw);
    ctx.scale(zoom, zoom);
    ctx.translate(-center.pos.x * S, -center.pos.z * S);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.radarImg, 0, 0);
    ctx.globalAlpha = 1;
    const eye = p.eye();
    for (const o of g.players.values()) {
      if (!o.alive || o === center) continue;
      const friendly = !SOLO_KINDS.has(g.mode.kind) && o.team === p.team;
      let visible = friendly || (p.alive && p.char?.perk === 'sixth' && o.pos.distanceTo(p.pos) < 14);
      if (!visible && p.alive) {
        o._radarT = (o._radarT || 0) - 1 / 30;
        if (o.firingT > 0 && o.pos.distanceTo(p.pos) < 30) o._radarT = 1.5;
        if (Math.random() < 0.2 && g.world.lineOfSight(eye, o.eye())) o._radarT = 1;
        visible = o._radarT > 0;
      }
      if (!visible) continue;
      ctx.fillStyle = friendly ? (o.team === 0 ? '#e8833a' : '#4ea3ff') : '#ff4040';
      ctx.beginPath(); ctx.arc(o.pos.x * S, o.pos.z * S, 6 / zoom * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    // Decoys look like an enemy firing.
    for (const d of g.decoys || []) {
      if (!p.alive || d.firingT <= 0 || (!SOLO_KINDS.has(g.mode.kind) && d.team === p.team) || d.owner === p.id) continue;
      ctx.fillStyle = '#ff4040';
      ctx.beginPath(); ctx.arc(d.pos.x * S, d.pos.z * S, 6 / zoom * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    const b = g.state.bomb || {};
    if ((b.state === 'dropped' || b.state === 'planted') && (g.mode.kind === 'bomb' && (p.team === 0 || b.state === 'planted'))) {
      ctx.fillStyle = b.state === 'planted' && Math.floor(this.t * 4) % 2 ? '#fff' : '#ff3030';
      ctx.fillRect(b.pos[0] * S - 5, b.pos[2] * S - 5, 10, 10);
    }
    ctx.restore();
    // self arrow
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(100, 92); ctx.lineTo(106, 106); ctx.lineTo(100, 102); ctx.lineTo(94, 106); ctx.closePath(); ctx.fill();
  }
}
