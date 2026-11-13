// Chat filter: swaps bad words for ****. It runs on every message as it is shown, so a message
// from a modified client is still cleaned on everyone else's screen.
// It sees through common dodges: capitals, l33t letters (sh1t, $hit), stretched letters (fuuuck),
// symbols inside a word (f.u.c.k, f*ck) and spaced-out letters (f u c k).

// Caught anywhere inside a word (fuck → fucking, motherfucker).
const ANYWHERE = ['fuck', 'fuk', 'fck', 'phuck', 'shit', 'cunt', 'nigg', 'niga', 'faggot', 'fagot', 'bitch', 'biatch', 'whore', 'retard', 'wank', 'twat', 'asshole', 'dumbass', 'jackass', 'bullshit', 'dipshit', 'cocksucker', 'motherf', 'pussies', 'blowjob', 'handjob', 'dildo', 'jizz', 'kike', 'chink', 'wetback', 'tranny'];
// Only caught as a whole word (plus endings like -s or -ing), so "class", "cockpit" and "scrap" stay clean.
const WHOLE = ['ass', 'asses', 'arse', 'dick', 'dicks', 'cock', 'cocks', 'pussy', 'slut', 'sluts', 'fag', 'fags', 'dyke', 'prick', 'bastard', 'piss', 'pissed', 'porn', 'rape', 'raped', 'rapist', 'tits', 'titty', 'titties', 'cum', 'spic', 'coon', 'homo', 'kys', 'nazi', 'thot', 'skank', 'bollocks', 'wanker', 'damn', 'goddamn', 'crap'];
// Real words that happen to contain one of the above.
const ALLOW = new Set(['shiitake', 'shitake', 'scunthorpe', 'niggle', 'niggles', 'niggled', 'niggling', 'snigger', 'sniggers', 'sniggered', 'sniggering', 'retardant', 'retardants', 'retardation', 'wankel', 'cockpit', 'cockpits', 'hancock', 'peacock', 'shuttlecock', 'dickens', 'scrap', 'cumulative', 'circumstance']);
const ENDINGS = ['', 's', 'es', 'ed', 'er', 'ers', 'ing', 'y'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't', '(': 'c', '€': 'e', '£': 'l' };

// Lowercase, drop punctuation around the word, undo l33t, drop symbols used to break words up (f*ck, f.u.c.k).
const trim = (w) => w.replace(/^["'(\[{<]+|[.,!?;:'")\]}>~-]+$/g, '');
const normalize = (w) => [...trim(w).toLowerCase()].map((c) => LEET[c] ?? c).join('').replace(/[^a-z]/g, '');
const squash = (w) => w.replace(/(.)\1+/g, '$1'); // fuuuck → fuck
const squashLong = (w) => w.replace(/(.)\1{2,}/g, '$1$1'); // asssss → ass (keeps real doubles)

const ANY_SQ = ANYWHERE.map(squash);
const WHOLE_SET = new Set(WHOLE.flatMap((w) => ENDINGS.map((e) => w + e)));

function isBad(raw) {
  const w = normalize(raw);
  if (!w || ALLOW.has(w)) return false;
  const sq = squash(w);
  if (ANY_SQ.some((r) => sq.includes(r))) return true;
  return WHOLE_SET.has(w) || WHOLE_SET.has(squashLong(w));
}

// Returns the text with each bad word (or spaced-out bad word) replaced by ****.
export function censor(text) {
  const parts = String(text ?? '').split(/(\s+)/); // keeps the spaces so the message reads the same
  const words = parts.map((p, i) => ({ p, i })).filter((x) => x.p.trim());
  const hit = new Set();
  for (const { p, i } of words) if (isBad(p)) hit.add(i);
  // Spaced-out letters: join runs of single characters ("f u c k", "s h i t") and test them together.
  for (let a = 0; a < words.length; a++) {
    if (normalize(words[a].p).length !== 1) continue;
    let b = a;
    while (b + 1 < words.length && normalize(words[b + 1].p).length === 1) b++;
    if (b > a) {
      const run = words.slice(a, b + 1);
      // Every stretch inside the run, so "i said f u c k" still finds the word.
      for (let s = 0; s < run.length; s++) for (let e = s + 2; e <= run.length; e++) {
        if (isBad(run.slice(s, e).map((x) => x.p).join(''))) for (let k = s; k < e; k++) hit.add(run[k].i);
      }
    }
    a = b;
  }
  if (!hit.size) return text;
  // A spaced-out word collapses to a single ****.
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (!hit.has(i)) { out.push(parts[i]); continue; }
    out.push('****');
    const single = (k) => normalize(parts[k]).length === 1;
    if (single(i)) while (hit.has(i + 2) && single(i + 2)) i += 2;
  }
  return out.join('');
}
