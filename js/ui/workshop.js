// Workshop tab: your map drafts and uploads, the community map browser and the featured maps.
// The editor itself is js/ui/editor.js; map storage and registration is js/data/custommaps.js.
import { MAPS } from '../data/maps.js';
import { MAX_UPLOADS, FEATURED_SLOTS, featuredList, saveDownloaded, removeDownloaded, isDownloaded } from '../data/custommaps.js';
import { MapEditor, newDraft, draftDef, previewCanvas } from './editor.js';
import { esc } from './social.js';

const DRAFTS = 'jps_map_drafts';
const readDrafts = () => { try { return JSON.parse(localStorage.getItem(DRAFTS) || '{}') || {}; } catch { return {}; } };
const writeDrafts = (d) => { try { localStorage.setItem(DRAFTS, JSON.stringify(d)); } catch { /* storage full */ } };
const ago = (t) => { const s = (Date.now() - new Date(t)) / 1000; return s < 3600 ? Math.max(1, Math.floor(s / 60)) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };

export class Workshop {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
    this.view = 'mine';
    this.sort = 'likes';
    this.q = '';
    this.liked = null;
  }

  render(el) {
    this.el = el;
    // Coming back from a test match reopens the editor on the same draft.
    if (this.reopen) { const d = this.reopen; this.reopen = null; this.edit(d); }
    el.innerHTML = `<div class="row"><h2 class="m-h1">Map workshop</h2></div>
      <div class="m-switch" id="ws-tabs">${[['mine', 'My maps'], ['community', 'Community'], ['featured', 'Featured']].map(([k, l]) => `<button data-v="${k}" class="${this.view === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="ws-body"><p class="m-sub">Loading…</p></div>`;
    el.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { this.view = b.dataset.v; this.render(el); }; });
    this.body = el.querySelector('#ws-body');
    this[this.view]().catch((e) => { this.body.innerHTML = `<p class="err">${esc(e.missing ? 'Custom maps need the latest database update (run supabase/schema.sql).' : e.message)}</p>`; });
  }

  thumb(data) { try { return `<img class="ws-thumb" src="${previewCanvas(data, 3).toDataURL()}" alt="">`; } catch { return '<span class="ws-thumb"></span>'; } }

  // ───── my maps ─────
  async mine() {
    const app = this.app, drafts = Object.values(readDrafts()).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    let uploads = [];
    if (app.user && app.api) uploads = await app.api.communityMaps({ owner: app.user.id, sort: 'new' });
    const draftRow = (d) => `<div class="ws-row">${this.thumb(d.data)}<div><b>${esc(d.name || 'Untitled map')}</b><span>${d.size === 'large' ? 'Large' : 'Small'} · draft${d.id ? ' of an upload' : ''} · edited ${ago(d.updated || Date.now())}</span></div><span class="spacer"></span>
      <button class="btn small primary" data-edit="${esc(d.key)}">Edit</button><button class="btn small ghost" data-deld="${esc(d.key)}" title="Delete draft">×</button></div>`;
    const upRow = (m) => `<div class="ws-row"><div><b>${esc(m.name)}</b><span>${m.size === 'large' ? 'Large' : 'Small'} · ♥ ${m.likes}${m.featured_slot ? ' · <i class="ws-feat">Featured</i>' : ''} · uploaded ${ago(m.created_at)}</span></div><span class="spacer"></span>
      <button class="btn small" data-play="${m.id}">Play vs bots</button><button class="btn small" data-editup="${m.id}">Edit</button><button class="btn small danger" data-delup="${m.id}" data-name="${esc(m.name)}">Delete</button></div>`;
    this.body.innerHTML = `<div class="row" style="gap:8px;margin:6px 0 12px"><button class="btn small primary" data-new="small">New small map</button><button class="btn small primary" data-new="large">New large map (bomb sites)</button></div>
      <p class="m-sub">Small maps are for 1v1, 2v2, deathmatch, gun game and free-for-all. Large maps need bomb sites A and B and also host bomb defusal, hostage rescue and retakes.</p>
      <h3 class="m-h3">Drafts on this device</h3>${drafts.length ? drafts.map(draftRow).join('') : '<p class="m-empty">No drafts. Start a new map above.</p>'}
      <h3 class="m-h3">Uploaded ${app.user ? `(${uploads.length} of ${MAX_UPLOADS})` : ''}</h3>
      ${app.user ? uploads.length ? uploads.map(upRow).join('') : '<p class="m-empty">Nothing uploaded yet. Open a draft and press Upload.</p>' : '<p class="m-empty">Sign in to upload maps and share them.</p>'}`;
    const b = this.body;
    b.querySelectorAll('[data-new]').forEach((x) => { x.onclick = () => this.edit(newDraft(x.dataset.new)); });
    b.querySelectorAll('[data-edit]').forEach((x) => { x.onclick = () => this.edit(readDrafts()[x.dataset.edit]); });
    b.querySelectorAll('[data-deld]').forEach((x) => { x.onclick = () => { const all = readDrafts(); delete all[x.dataset.deld]; writeDrafts(all); this.mine(); }; });
    b.querySelectorAll('[data-play]').forEach((x) => { x.onclick = () => this.play(+x.dataset.play); });
    b.querySelectorAll('[data-editup]').forEach((x) => { x.onclick = async () => {
      const row = await app.api.customMap(+x.dataset.editup);
      if (!row) return;
      // Reuse an existing draft of this upload if there is one.
      const existing = Object.values(readDrafts()).find((d) => d.id === row.id);
      this.edit(existing || { key: 'u' + row.id, id: row.id, name: row.name, description: row.description || '', size: row.size, mirror: false, data: row.data });
    }; });
    b.querySelectorAll('[data-delup]').forEach((x) => { x.onclick = async () => {
      if (x.dataset.confirm !== '1') { x.dataset.confirm = '1'; x.textContent = 'Really delete?'; return; }
      try { await app.api.deleteMap(+x.dataset.delup); this.ui.toast(`Deleted ${x.dataset.name}`, 'good'); } catch (e) { this.ui.toast(e.message, 'bad'); }
      this.mine();
    }; });
  }

  edit(draft) {
    if (!draft) return;
    const ed = new MapEditor(this.ui, draft, {
      onSave: (d) => { const all = readDrafts(); all[d.key] = d; writeDrafts(all); },
      onTest: (d) => this.test(d, ed),
      onWalk: (d) => this.test(d, ed, true),
      onUpload: (d) => this.upload(d, ed),
      onClose: () => { if (this.ui.tab === 'workshop') this.render(this.el); },
    });
    ed.open();
  }

  // Plays the draft against bots (or walks it alone, free for all with nobody else), then comes back to the editor.
  test(d, ed, walk = false) {
    ed.close();
    MAPS.draft = draftDef(d);
    this.reopen = d;
    this.app.returnTab = 'workshop';
    if (walk) this.app.startOffline({ mode: 'ffa', map: 'draft', variant: 'day', noBots: true });
    else this.app.startOffline({ mode: d.size === 'large' ? 'bomb' : 'tdm', map: 'draft', variant: 'day', botLevel: 'normal' });
  }

  async upload(d, ed) {
    const app = this.app;
    if (!app.user) { this.ui.toast('Sign in to upload maps', 'bad'); return; }
    try {
      const id = await app.api.saveMap(d.id, d.name, d.description, d.size, { ...d.data, rows: d.data.rows });
      const wasNew = !d.id;
      d.id = id;
      ed.cb.onSave(d);
      ed.el.querySelector('[data-a=upload]').textContent = 'Update upload';
      // Your own uploads count as downloaded so you can use them in lobbies straight away.
      saveDownloaded({ id, name: d.name, description: d.description, size: d.size, data: d.data, author: app.me().name });
      this.ui.toast(wasNew ? `${d.name} is uploaded. Players can find it under Community.` : `${d.name} is updated. If it was featured, it waits for approval again.`, 'good', null, 6000);
    } catch (e) { this.ui.toast(e.missing ? 'Custom maps need the latest database update (run supabase/schema.sql).' : e.message, 'bad', null, 6000); }
  }

  // Downloads a map (if needed) and opens it in a bot match.
  async play(id) {
    const def = await this.download(id, true);
    if (!def) return;
    this.app.returnTab = 'workshop';
    this.app.startOffline({ mode: def.size === 'large' ? 'bomb' : 'tdm', map: def.id, variant: 'day', botLevel: 'normal' });
  }

  async download(id, quiet = false) {
    try {
      const row = await this.app.api.customMap(id);
      if (!row) { this.ui.toast('That map no longer exists', 'bad'); return null; }
      const def = saveDownloaded(row);
      if (!quiet) this.ui.toast(`Downloaded ${def.name}. It's in your map lists for lobbies and bot matches.`, 'good');
      return def;
    } catch (e) { this.ui.toast(e.message, 'bad'); return null; }
  }

  // ───── community ─────
  async community() {
    const app = this.app;
    if (!app.api) { this.body.innerHTML = '<p class="m-empty">The community browser needs an internet connection.</p>'; return; }
    if (app.user && !this.liked) this.liked = new Set(await app.api.myMapLikes().catch(() => []));
    const list = await app.api.communityMaps({ q: this.q, sort: this.sort });
    const liked = this.liked || new Set();
    this.body.innerHTML = `<div class="row ws-search"><input type="text" id="ws-q" placeholder="Search maps" value="${esc(this.q)}" aria-label="Search maps">
        <div class="seg" id="ws-sort">${[['likes', 'Most liked'], ['new', 'Newest']].map(([k, l]) => `<button data-s="${k}" class="${this.sort === k ? 'sel' : ''}">${l}</button>`).join('')}</div></div>
      <p class="m-sub">Like the maps you enjoy: the most-liked maps are considered for the 4 featured slots, which every player gets automatically.</p>
      ${list.length ? list.map((m) => {
        const cid = 'cm' + m.id, have = isDownloaded(cid) || MAPS[cid]?.featured;
        return `<div class="ws-row"><div><b>${esc(m.name)}</b><span>${m.size === 'large' ? 'Large' : 'Small'} · by ${esc(m.profiles?.username || 'unknown')}${m.featured_slot ? ' · <i class="ws-feat">Featured</i>' : ''}${m.description ? ' · ' + esc(m.description) : ''}</span></div><span class="spacer"></span>
          <button class="btn small ${liked.has(m.id) ? 'primary' : 'ghost'} ws-like" data-like="${m.id}" ${app.user ? '' : 'disabled title="Sign in to like maps"'}>♥ ${m.likes}</button>
          <button class="btn small" data-play="${m.id}">Play vs bots</button>
          ${m.featured_slot ? '' : have ? `<button class="btn small ghost" data-rm="${cid}">Remove</button>` : `<button class="btn small" data-dl="${m.id}">Download</button>`}</div>`;
      }).join('') : '<p class="m-empty">No maps found.</p>'}`;
    const b = this.body;
    const q = b.querySelector('#ws-q');
    q.onkeydown = (e) => { if (e.key === 'Enter') { this.q = q.value.trim(); this.community(); } };
    b.querySelectorAll('[data-s]').forEach((x) => { x.onclick = () => { this.sort = x.dataset.s; this.community(); }; });
    b.querySelectorAll('[data-like]').forEach((x) => { x.onclick = async () => {
      const id = +x.dataset.like, on = !liked.has(id);
      try { const n = await app.api.likeMap(id, on); if (on) liked.add(id); else liked.delete(id); x.textContent = `♥ ${n}`; x.classList.toggle('primary', on); x.classList.toggle('ghost', !on); }
      catch (e) { this.ui.toast(e.message, 'bad'); }
    }; });
    b.querySelectorAll('[data-play]').forEach((x) => { x.onclick = () => this.play(+x.dataset.play); });
    b.querySelectorAll('[data-dl]').forEach((x) => { x.onclick = async () => { x.disabled = true; await this.download(+x.dataset.dl); this.community(); }; });
    b.querySelectorAll('[data-rm]').forEach((x) => { x.onclick = () => { removeDownloaded(x.dataset.rm); this.community(); }; });
  }

  // ───── featured ─────
  async featured() {
    const list = featuredList();
    this.body.innerHTML = `<p class="m-sub">Featured maps are installed on every player's device automatically and are in the rotation for every queue, ranked included, like the official maps. Slots 1-2 are small maps and 3-4 are large. They're chosen from the most-liked community maps.</p>
      ${FEATURED_SLOTS.map(([slot, size]) => { const m = list.find((x) => x.slot === slot); return `<div class="ws-row">${m ? this.thumb(m.data) : '<span class="ws-thumb"></span>'}<div><b>Slot ${slot} · ${size}</b><span>${m ? `${esc(m.name)} by ${esc(m.author)}` : 'Empty'}</span></div><span class="spacer"></span>${m ? `<button class="btn small" data-playf="${esc(m.id)}">Play vs bots</button>` : ''}</div>`; }).join('')}`;
    this.body.querySelectorAll('[data-playf]').forEach((x) => { x.onclick = () => { const def = MAPS[x.dataset.playf]; this.app.returnTab = 'workshop'; this.app.startOffline({ mode: def.size === 'large' ? 'bomb' : 'tdm', map: def.id, variant: 'day', botLevel: 'normal' }); }; });
  }
}

