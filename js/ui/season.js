// The Season screen: reward track, daily and weekly challenges, ranked season progress,
// the season leaderboard and a look at the seasons still to come.
import { SEASONS, currentSeason, seasonStarted, seasonTrack, tierFor, rankedReward, itemDef, rarityColor, fmtDate, timeLeft, TIERS, TIER_XP, RANKED_REWARD_WINS } from '../data/seasons.js';
import { activeChallenges, normalizeProgress, nextDailyReset, nextWeeklyReset } from '../data/challenges.js';
import { KINDS, RARITIES } from '../data/skins.js';
import { rankBadge } from '../data/modes.js';
import { itemSwatch, cardImage } from './cards.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kindLabel = (k) => KINDS[k]?.label || k;
const SHORT_KIND = { finish: 'Finish', outfit: 'Outfit', card: 'Card', effect: 'Kill effect', emote: 'Emote' };

function rewardTile(r, state, owned) {
  const d = itemDef(r), sw = itemSwatch(r.kind, r.id);
  const art = r.kind === 'card' ? `<span class="sw wide" style="background-image:url(${cardImage(r.id, 240, 60)})"></span>` : `<span class="sw" style="background:${sw.bg}">${sw.glyph}</span>`;
  return `<button class="tier ${state} ${r.exclusive ? 'excl' : ''}" data-tier="${r.tier}" style="--rc:${rarityColor(r)}" title="${esc(d?.name)} · ${esc(kindLabel(r.kind))}${r.exclusive ? ' · season exclusive' : ''}">
    <span class="tier-n">${r.tier}</span>${art}<b>${esc(d?.name || r.id)}</b><em>${r.exclusive ? '★ Exclusive' : esc(RARITIES[d?.rarity]?.name || '')}</em><small>${esc(SHORT_KIND[r.kind] || '')}</small>
    ${state === 'earned' || owned ? '<i class="tier-ok">✓</i>' : ''}</button>`;
}

export async function renderSeason(ui, el) {
  const app = ui.app, p = app.profile, s = currentSeason();
  const signedIn = !!app.user;
  const inSeason = !!(s && p && p.season_id === s.id);
  const passXp = inSeason ? p.pass_xp || 0 : 0;
  const { tier, into } = tierFor(passXp);
  const track = s ? seasonTrack(s.id) : [];
  const ranked = s ? rankedReward(s.id) : null;
  const rWins = inSeason ? p.season_wins || 0 : 0;
  const progress = normalizeProgress(app.challenges);
  const ch = activeChallenges();
  const chRow = (c) => {
    const n = progress[c.key] || 0, done = n >= c.n, claimed = progress.claimed.includes(c.key);
    return `<div class="ch ${done ? 'done' : ''}"><div class="ch-top"><b>${esc(c.text)}</b><span class="ch-xp">+${c.xp.toLocaleString()} XP</span></div>
      <div class="bar"><i style="width:${Math.round((n / c.n) * 100)}%"></i></div>
      <span class="m-sub">${n.toLocaleString()} / ${c.n.toLocaleString()}${done ? (signedIn ? (claimed ? ' · XP earned' : ' · claiming…') : ' · sign in to earn the XP') : ''}</span></div>`;
  };

  el.innerHTML = s ? `
    <div class="season-head" style="--sc:${s.color}">
      <div><span class="season-kicker">Season ${s.num}</span><h2 class="m-h1">${esc(s.name)}</h2>
      <p class="m-sub">${fmtDate(s.start)} – ${fmtDate(new Date(Date.parse(s.end) - 1).toISOString())} (UTC) · ends in ${timeLeft(s.end)}</p></div>
      <div class="season-tier"><b>${tier}</b><span>of ${TIERS}</span></div>
    </div>
    <div class="season-xp"><div class="bar big"><i style="width:${tier >= TIERS ? 100 : Math.round((into / TIER_XP) * 100)}%"></i></div>
      <span class="m-sub">${tier >= TIERS ? 'Track complete — every reward unlocked.' : `${into.toLocaleString()} / ${TIER_XP.toLocaleString()} XP to tier ${tier + 1}. Matches and challenges both count.`}${signedIn ? '' : ' Sign in to earn season rewards.'}</span></div>
    <h3 class="m-h3">Reward track</h3>
    <div class="track" id="track">${track.map((r) => rewardTile(r, r.tier <= tier ? 'earned' : r.tier === tier + 1 ? 'next' : 'locked', ui.owned(r.kind, r.id))).join('')}</div>
    <div class="season-cols">
      <section><h3 class="m-h3">Daily challenges <span class="m-sub">· new in ${timeLeft(new Date(nextDailyReset()).toISOString())}</span></h3>${ch.filter((c) => c.period === 'daily').map(chRow).join('')}</section>
      <section><h3 class="m-h3">Weekly challenges <span class="m-sub">· new in ${timeLeft(new Date(nextWeeklyReset()).toISOString())}</span></h3>${ch.filter((c) => c.period === 'weekly').map(chRow).join('')}</section>
    </div>
    <div class="season-cols">
      <section><h3 class="m-h3">Ranked season</h3>
        ${p ? `<div class="season-rank">${rankBadge(p.elo, true)}<div><b>${p.elo} rating</b><span class="m-sub">${inSeason ? `${p.season_wins}–${p.season_losses} this season · peak ${p.season_peak}` : 'Play a ranked match to join this season'}</span></div></div>` : '<p class="m-sub">Sign in to play ranked.</p>'}
        ${ranked ? `<div class="ranked-reward"><span class="sw wide" style="background-image:url(${cardImage(ranked.id, 240, 60)})"></span><div><b>${esc(itemDef(ranked).name)}</b><span class="m-sub">Win ${RANKED_REWARD_WINS} ranked matches this season (${Math.min(rWins, RANKED_REWARD_WINS)}/${RANKED_REWARD_WINS}). Awarded when the season ends.</span></div></div>` : ''}
        <p class="m-sub">When a season ends your rating moves halfway back toward 1000, so everyone climbs again.</p></section>
      <section><h3 class="m-h3">Season leaderboard</h3><div id="season-lb"><p class="m-sub">Loading…</p></div></section>
    </div>` : '<h2 class="m-h1">Between seasons</h2><p class="m-sub">The next season hasn’t started yet.</p>';

  el.insertAdjacentHTML('beforeend', `<h3 class="m-h3">Upcoming seasons</h3><div class="future">${SEASONS.filter((x) => x !== s && !seasonStarted(x)).map((x) => {
    const ex = seasonTrack(x.id).filter((r) => r.exclusive);
    return `<div class="future-s" style="--sc:${x.color}"><div class="fs-head"><b>Season ${x.num}: ${esc(x.name)}</b><span class="m-sub">${fmtDate(x.start)} – ${fmtDate(new Date(Date.parse(x.end) - 1).toISOString())}</span></div>
      <div class="fs-items">${ex.map((r) => { const sw = itemSwatch(r.kind, r.id); return r.kind === 'card' ? `<span class="sw wide" title="${esc(itemDef(r).name)}" style="background-image:url(${cardImage(r.id, 240, 60)})"></span>` : `<span class="sw" title="${esc(itemDef(r).name)}" style="background:${sw.bg}">${sw.glyph}</span>`; }).join('')}</div>
      <span class="m-sub">Exclusive rewards locked until ${fmtDate(x.start)}</span></div>`;
  }).join('')}</div>`);

  // Clicking a reward previews it on your operator.
  el.querySelectorAll('[data-tier]').forEach((b) => { b.onclick = () => {
    const r = track.find((x) => x.tier === +b.dataset.tier), d = itemDef(r);
    if (r.kind === 'finish') { ui.scene?.setChar({ ...app.char, skins: { ...(app.char.skins || {}), ar7: r.id } }, 'ar7'); ui.scene?.setFocus('weapon'); }
    else if (r.kind === 'outfit') { ui.scene?.setChar({ ...app.char, outfit: r.id }, 'ar7'); ui.scene?.setFocus('operator'); }
    else if (r.kind === 'emote') ui.scene?.emote(r.id);
    else if (r.kind === 'effect') ui.scene?.killFx(r.id);
    ui.scene?.faceFront();
    ui.toast(`Tier ${r.tier}: ${d.name} (${kindLabel(r.kind).toLowerCase()})${r.tier <= tier ? ' — unlocked' : ''}`);
  }; });
  const cur = el.querySelector('.tier.next') || el.querySelector('.tier.earned:last-of-type');
  cur?.scrollIntoView?.({ block: 'nearest', inline: 'center' });

  const lb = el.querySelector('#season-lb');
  if (!lb) return;
  if (!app.api) { lb.innerHTML = '<p class="m-empty">Needs an internet connection.</p>'; return; }
  try {
    const rows = await app.api.seasonLeaderboard(s.id, 25);
    lb.innerHTML = rows.length ? `<table class="tbl lb"><tr><th>#</th><th>Player</th><th>Rank</th><th class="num">Rating</th><th class="num">Record</th></tr>
      ${rows.map((r, i) => `<tr class="clickable ${r.id === app.user?.id ? 'me' : ''}" data-id="${r.id}"><td class="pos">${i + 1}</td><td><b>${esc(r.username)}</b></td><td>${rankBadge(r.elo)}</td><td class="num">${r.elo}</td><td class="num">${r.season_wins}–${r.season_losses}</td></tr>`).join('')}</table>`
      : '<p class="m-empty">Nobody has played ranked this season yet.</p>';
    lb.querySelectorAll('[data-id]').forEach((r) => { r.onclick = () => ui.profileModal(r.dataset.id); });
  } catch { lb.innerHTML = '<p class="m-empty">The season leaderboard will appear once the database update is applied.</p>'; }
}
