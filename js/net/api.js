import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import { assertPassword } from '../data/auth.js';

export { PASSWORD_RULES, OTP_LENGTH, passwordProblems, assertPassword } from '../data/auth.js';

const SCHEMA_HINT = 'Database tables are missing. Run supabase/schema.sql in the Supabase SQL editor.';

function friendly(error) {
  const msg = error?.message || String(error);
  if (/schema cache|does not exist|PGRST205|PGRST202/i.test(msg)) return new Error(SCHEMA_HINT);
  if (/Email not confirmed/i.test(msg)) return new Error('Email not confirmed yet. Click the link in your confirmation email.');
  if (/Database error saving new user/i.test(msg)) return new Error('That username is taken or invalid.');
  if (/captcha/i.test(msg)) return new Error('Security check failed or expired. Complete it again and retry.');
  if (/rate limit|only request this after/i.test(msg)) return new Error('Too many emails requested. Wait a minute and try again.');
  if (/Token has expired or is invalid|otp_expired|invalid.*otp/i.test(msg)) return new Error('That code is wrong or has expired. Request a new one.');
  if (/Password should|weak_password|Password is known/i.test(msg)) return new Error('Password must be at least 8 characters and include a lowercase letter, an uppercase letter and a number.');
  if (/New password should be different/i.test(msg)) return new Error('Your new password must be different from the old one.');
  return new Error(msg);
}

// Absolute URL of a page next to index.html (works on localhost and on a GitHub Pages sub-path).
export function siteUrl(page = '') {
  return new URL(page, new URL('./', location.href)).href;
}

// Reads Supabase auth errors returned in the URL after following an email link.
export function authErrorFromUrl() {
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const code = params.get('error_code'), desc = params.get('error_description');
  if (!code && !desc) return null;
  if (code === 'otp_expired') return 'That email link has expired or was already used. Request a new one.';
  return (desc || code).replace(/\+/g, ' ');
}

// Thin wrapper over Supabase for auth, profiles, leaderboards and match results.
export class Api {
  constructor() {
    this.sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 120 } },
    });
  }

  async session() {
    const { data } = await this.sb.auth.getSession();
    return data.session;
  }

  onAuth(cb) { return this.sb.auth.onAuthStateChange((_e, session) => cb(session)); }

  async signUp(email, password, username, captchaToken) {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw new Error('Username must be 3-16 letters, numbers or _.');
    assertPassword(password);
    const { data: taken, error: e1 } = await this.sb.from('profiles').select('id').ilike('username', username).limit(1);
    if (e1) throw friendly(e1);
    if (taken?.length) throw new Error('That username is taken.');
    const { data, error } = await this.sb.auth.signUp({
      email, password, options: { data: { username }, emailRedirectTo: siteUrl('index.html?confirmed=1'), captchaToken },
    });
    if (error) throw friendly(error);
    return data;
  }

  async resendConfirmation(email, captchaToken) {
    const { error } = await this.sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: siteUrl('index.html?confirmed=1'), captchaToken } });
    if (error) throw friendly(error);
  }

  async requestPasswordReset(email, captchaToken) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: siteUrl('index.html?reset=1'), captchaToken });
    if (error) throw friendly(error);
  }

  async verifyEmailCode(email, code) {
    const { data, error } = await this.sb.auth.verifyOtp({ email, token: code, type: 'signup' });
    if (error) throw friendly(error);
    return data;
  }

  async verifyResetCode(email, code) {
    const { data, error } = await this.sb.auth.verifyOtp({ email, token: code, type: 'recovery' });
    if (error) throw friendly(error);
    return data;
  }

  async updatePassword(password) {
    assertPassword(password);
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw friendly(error);
  }

  async signIn(email, password, captchaToken) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password, options: { captchaToken } });
    if (error) throw friendly(error);
    return data;
  }

  async signOut() { await this.sb.auth.signOut(); }

  async profile(id) {
    const { data, error } = await this.sb.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw friendly(error);
    return data;
  }

  async profileByName(name) {
    const { data, error } = await this.sb.from('profiles').select('*').ilike('username', name).maybeSingle();
    if (error) throw friendly(error);
    return data;
  }

  async saveCharacter(id, character) {
    const { error } = await this.sb.from('profiles').update({ character, last_seen: new Date().toISOString() }).eq('id', id);
    if (error) throw friendly(error);
  }

  async saveInventory(id, inventory) {
    const { error } = await this.sb.from('profiles').update({ inventory }).eq('id', id);
    if (error) throw friendly(error);
  }

  async leaderboard(kind = 'elo', limit = 100) {
    const col = { elo: 'elo', kills: 'kills', wins: 'wins', xp: 'xp' }[kind] || 'elo';
    let q = this.sb.from('profiles').select('id,username,elo,peak_elo,ranked_wins,ranked_losses,wins,losses,matches,kills,deaths,headshots,xp').order(col, { ascending: false }).limit(limit);
    if (kind === 'elo') q = q.gt('ranked_wins', -1);
    const { data, error } = await q;
    if (error) throw friendly(error);
    return data;
  }

  async history(userId, limit = 15) {
    const { data, error } = await this.sb.from('match_history').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw friendly(error);
    return data;
  }

  async searchPlayers(q) {
    const { data, error } = await this.sb.from('profiles').select('id,username,elo,xp,matches').ilike('username', `%${q.replace(/[%_]/g, '')}%`).order('elo', { ascending: false }).limit(20);
    if (error) throw friendly(error);
    return data;
  }

  async reportRanked(matchId, winner, loser) {
    const { data, error } = await this.sb.rpc('report_ranked', { p_match_id: matchId, p_winner: winner, p_loser: loser });
    if (error) throw friendly(error);
    return data;
  }

  async recordMatch(o) {
    const args = {
      p_match_id: o.matchId, p_mode: o.mode, p_map: o.map, p_ranked: o.ranked, p_online: o.online,
      p_result: o.result, p_kills: o.kills, p_deaths: o.deaths, p_headshots: o.headshots, p_score: o.score, p_elo_change: o.eloChange || 0,
    };
    // Per-match details need the newer database function; older databases just skip them.
    if (o.details && this.detailsSupported !== false) {
      const { error } = await this.sb.rpc('record_match', { ...args, p_details: o.details });
      if (!error) { this.detailsSupported = true; return; }
      if (error.code !== 'PGRST202') throw friendly(error);
      this.detailsSupported = false;
    }
    const { error } = await this.sb.rpc('record_match', args);
    if (error) throw friendly(error);
  }

  // ───────────── seasons, challenges, social, moderation ─────────────
  // These need the November 2026 additions to supabase/schema.sql. Before that runs, the calls fail
  // with a "missing" error and the features stay hidden instead of breaking the menu.
  static missing(error) { return /PGRST202|PGRST205|schema cache|does not exist|42883|42P01/i.test(error?.code + ' ' + error?.message); }

  async rpc(fn, args) {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) { const e = friendly(error); e.missing = Api.missing(error); throw e; }
    return data;
  }

  async seasons() {
    const { data, error } = await this.sb.from('seasons').select('*').order('starts_at');
    if (error) return null;
    return data;
  }

  async seasonHistory(userId) {
    const { data, error } = await this.sb.from('season_history').select('*').eq('user_id', userId);
    return error ? [] : data;
  }

  myStatus() { return this.rpc('my_status'); }
  ackStatus(warnings, grants) { return this.rpc('ack_status', { p_warnings: warnings, p_grants: grants }); }
  claimChallenge(key) { return this.rpc('claim_challenge', { p_key: key }); }

  async saveChallenges(id, challenges) {
    const { error } = await this.sb.from('profiles').update({ challenges }).eq('id', id);
    if (error) throw friendly(error);
  }

  async saveAchievements(id, achievements) {
    const { error } = await this.sb.from('profiles').update({ achievements }).eq('id', id);
    if (error) { const e = friendly(error); e.missing = Api.missing(error) || /achievements/.test(error.message); throw e; }
  }

  // ───────────── custom maps ─────────────
  // Listings leave out the grid (`data`); it's fetched only when a map is downloaded or played.
  async featuredMaps() {
    const { data, error } = await this.sb.from('custom_maps').select('id,name,description,size,data,featured_slot,likes,profiles!owner(username)').not('featured_slot', 'is', null).order('featured_slot');
    if (error) { const e = friendly(error); e.missing = Api.missing(error); throw e; }
    return data;
  }

  async communityMaps({ q = '', sort = 'likes', owner = null } = {}) {
    let query = this.sb.from('custom_maps').select('id,name,description,size,likes,featured_slot,created_at,updated_at,owner,profiles!owner(username)');
    if (q) query = query.ilike('name', `%${q.replace(/[%_]/g, '')}%`);
    if (owner) query = query.eq('owner', owner);
    query = sort === 'new' ? query.order('created_at', { ascending: false }) : query.order('likes', { ascending: false }).order('created_at', { ascending: false });
    const { data, error } = await query.limit(60);
    if (error) { const e = friendly(error); e.missing = Api.missing(error); throw e; }
    return data;
  }

  async customMap(id) {
    const { data, error } = await this.sb.from('custom_maps').select('id,name,description,size,data,featured_slot,likes,owner,profiles!owner(username)').eq('id', id).maybeSingle();
    if (error) { const e = friendly(error); e.missing = Api.missing(error); throw e; }
    return data;
  }

  saveMap(id, name, description, size, data) { return this.rpc('save_custom_map', { p_id: id, p_name: name, p_description: description, p_size: size, p_data: data }); }
  deleteMap(id) { return this.rpc('delete_custom_map', { p_id: id }); }
  likeMap(id, like) { return this.rpc('like_custom_map', { p_id: id, p_like: like }); }
  myMapLikes() { return this.rpc('my_map_likes'); }

  friends() { return this.rpc('my_friends'); }
  friendRequest(id) { return this.rpc('friend_request', { p_to: id }); }
  friendRespond(id, accept) { return this.rpc('friend_respond', { p_from: id, p_accept: accept }); }
  friendRemove(id) { return this.rpc('friend_remove', { p_id: id }); }

  commend(to, matchId, kind) { return this.rpc('commend_player', { p_to: to, p_match: matchId, p_kind: kind }); }
  report(target, matchId, mode, reason, note, evidence) { return this.rpc('report_player', { p_target: target, p_match: matchId, p_mode: mode, p_reason: reason, p_note: note, p_evidence: evidence }); }
  playerCommends(id) { return this.rpc('player_commends', { p_id: id }); }

  async moderationFlags(ids) {
    const real = ids.filter((id) => /^[0-9a-f-]{36}$/.test(id));
    if (!real.length) return [];
    try { return (await this.rpc('moderation_flags', { p_ids: real })) || []; } catch { return []; }
  }

  async announcements() {
    const { data, error } = await this.sb.from('announcements').select('id,message,kind,ends_at').order('id', { ascending: false }).limit(3);
    return error ? [] : data;
  }

  async appSettings() {
    const { data, error } = await this.sb.from('app_settings').select('key,value');
    return error ? {} : Object.fromEntries(data.map((r) => [r.key, r.value]));
  }

  async seasonLeaderboard(seasonId, limit = 100) {
    const { data, error } = await this.sb.from('profiles').select('id,username,elo,season_peak,season_wins,season_losses,pass_xp')
      .eq('season_id', seasonId).order('elo', { ascending: false }).limit(limit);
    if (error) throw friendly(error);
    return data;
  }

  // Admin calls. The database refuses every one of these unless the caller is in public.admins.
  async isAdmin() { try { return (await this.rpc('is_admin')) === true; } catch { return false; } }
  admin(fn, args = {}) { return this.rpc('admin_' + fn, args); }

  // Recent history with details for the stats page.
  async statsHistory(userId, limit = 100) {
    const { data, error } = await this.sb.from('match_history').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw friendly(error);
    return data;
  }
}
