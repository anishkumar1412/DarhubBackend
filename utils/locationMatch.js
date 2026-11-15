/**
 * Matching place names across spellings: "Ahmedabad" / "Ahmadabad" / "Amdavad", "Detroj-Rampura" / "Detroj Rampura",
 * "ODISHA" / "Odisha", "Khurdha" / "Khordha", "Gurgaon" / "Gurugram", "Bengaluru Urban" / "Bangalore Urban".
 * Used by the LGD import (merging the official directory into the existing master tables) and by
 * GET /api/locations/match (turning a phone's GPS address into our ids).
 *
 * Pure functions, no database. The matcher always compares a name with the SIBLINGS of the place it belongs to (the
 * districts of one state, the blocks of one district...), a few dozen names, so it can afford to be tolerant. It
 * works in tiers, from strictest to loosest, and the first tier that finds anything decides:
 *
 *   1 exact        same words, any case / punctuation / spacing ("Detroj-Rampura" = "detroj rampura")
 *   2 ignoring     ... also ignoring the words "District", "Taluka", "Division", "Block" ... ("Pune District" = "Pune")
 *   3 aliases      ... and old / new names ("Bangalore Urban" = "Bengaluru Urban", "Allahabad" = "Prayagraj")
 *   4 city / rural ... and "City" / "Urban" / "Rural" / "(brackets)" when that makes it unambiguous ("Ahmadabad City" = "Ahmedabad")
 *   5 sounds-like  ... and spelling variants that sound the same (o/u, v/w, ph/f, c/k, e/i, double letters, "h")
 *   6 one typo     ... and one (two for long names) wrong, missing or extra letters ("Ahmedabad" = "Ahmadabad")
 *   7 consonants   ... and the same consonants in the same first letter and order ("Mahesana" = "Mehsana")
 *
 * A tier that finds exactly ONE sibling returns it. A tier that finds several returns nothing (never guess: a wrong
 * district is worse than asking the farmer to pick), and so do the later tiers: nothing is tried after an ambiguity.
 * Roman numerals and one-letter qualifiers ("Hansi-I" / "Hansi-II", "Sirpur (T)" / "(U)") are never blurred.
 */

/** Words that only say what kind of place it is (dropped from tier 2). */
const KIND_WORDS = new Set(['the', 'district', 'dist', 'division', 'tehsil', 'tahsil', 'taluka', 'taluk', 'block', 'mandal', 'zila', 'zilla', 'subdivision']);

/** Words that often distinguish two sibling blocks, but that people and geocoders also add loosely (dropped from tier 4). */
const SOFT_WORDS = new Set(['city', 'urban', 'rural', 'town', 'municipality', 'corporation']);

/**
 * Old / other names of the same place, as a phrase on the left and the name the directory uses on the right
 * (lower case, no punctuation). Applied from tier 3 on, never to an exact match: the directory itself has both
 * "Gurugram" (district) and "Gurgaon" (block), and each must find itself.
 */
const ALIASES = new Map([
  // states and union territories
  ['nct of delhi', 'delhi'], ['national capital territory of delhi', 'delhi'], ['orissa', 'odisha'],
  ['pondicherry', 'puducherry'], ['uttaranchal', 'uttarakhand'], ['telengana', 'telangana'],
  ['jammu kashmir', 'jammu and kashmir'], ['andaman nicobar islands', 'andaman and nicobar islands'],
  ['dadra and nagar haveli and daman and diu', 'the dadra and nagar haveli and daman and diu'],
  // renamed cities and districts (old and new spellings both appear in maps, geocoders and old records)
  ['allahabad', 'prayagraj'], ['faizabad', 'ayodhya'], ['bangalore', 'bengaluru'], ['bombay', 'mumbai'],
  ['calcutta', 'kolkata'], ['madras', 'chennai'], ['baroda', 'vadodara'], ['trivandrum', 'thiruvananthapuram'],
  ['mysore', 'mysuru'], ['mangalore', 'mangaluru'], ['belgaum', 'belagavi'], ['gulbarga', 'kalaburagi'],
  ['bellary', 'ballari'], ['shimoga', 'shivamogga'], ['tumkur', 'tumakuru'], ['chikmagalur', 'chikkamagaluru'],
  ['vizag', 'visakhapatnam'], ['benares', 'varanasi'], ['banaras', 'varanasi'], ['jubbulpore', 'jabalpur'],
  ['amdavad', 'ahmadabad'], ['cawnpore', 'kanpur'], ['simla', 'shimla'], ['trichy', 'tiruchirappalli'],
  ['thoothukudi', 'tuticorin'], ['kancheepuram', 'kanchipuram'], ['hoshangabad', 'narmadapuram'],
  ['dharashiv', 'osmanabad'], ['ahilyanagar', 'ahmednagar'], ['chhatrapati sambhajinagar', 'aurangabad'],
  ['sambhajinagar', 'aurangabad'], ['kutch', 'kachchh'], ['dangs', 'dang'], ['gurgaon', 'gurugram'],
  ['belgaum', 'belagavi'], ['bijapur', 'vijayapura'], ['kolar gold fields', 'kolar'], ['tiruvananthapuram', 'thiruvananthapuram'],
]);

const stripAccents = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Lower case words: no accents, "&" as "and", punctuation and brackets as spaces. */
const words = (value) => {
  if (value === null || value === undefined) return [];
  return stripAccents(String(value)).toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
};

const applyAliases = (list) => {
  let text = ` ${list.join(' ')} `;
  for (const [from, to] of ALIASES) {
    if (text.includes(` ${from} `)) text = text.replace(` ${from} `, ` ${to} `);
  }
  return text.trim().split(' ').filter(Boolean);
};

const NUMERAL = /^([ivx]+|\d+)$/;                      // "ii", "iii", "2": a different place from "i", never blurred
const isFixed = (word) => NUMERAL.test(word) || word.length <= 2;

/** The words as they sound: spelling variants of Indian place names collapse to one form. */
const soundsLike = (word) => {
  if (isFixed(word)) return word;
  return word
    .replace(/(?<=[bcdfghjklmnpqrstvwxz])y(?=a)/g, '')   // "Choryasi" / "Chorasi"
    .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks')
    .replace(/c(?!h)/g, 'k')                              // Calcutta / Kalkutta; "ch" stays
    .replace(/[wv]/g, 'v').replace(/z/g, 'j').replace(/f/g, 'p')
    .replace(/[eiy]/g, 'i').replace(/[ou]/g, 'o')
    .replace(/(.)\1+/g, '$1')
    .replace(/h(?=[a-z])/g, '');                          // "Sahebganj" / "Saibganj", "Dhanbad" / "Danbad"
};

const consonants = (text) => text.replace(/[aeiou]/g, '').replace(/(.)\1+/g, '$1');

const compact = (list) => list.join('');

/**
 * Runs of ordinary words are joined and converted as one piece, so a space never changes the result
 * ("Panchmahal" = "Panch Mahals"); roman numerals and short qualifiers stay exactly as written.
 */
const segment = (list, convert) => {
  const out = [];
  let run = [];
  const flush = () => { if (run.length) { out.push(convert(run.join(''))); run = []; } };
  for (const word of list) {
    if (isFixed(word)) { flush(); out.push(word); } else run.push(word);
  }
  flush();
  return out;
};

/** Every form of a name the tiers compare, computed once. */
const keysOf = (name) => {
  const all = words(name);
  const noKind = all.filter((w) => !KIND_WORDS.has(w));
  const base = noKind.length ? noKind : all;
  const aliased = applyAliases(base);
  const noSoft = aliased.filter((w) => !SOFT_WORDS.has(w));
  const loose = noSoft.length ? noSoft : aliased;
  const sound = segment(loose, soundsLike);
  return {
    exact: compact(all),
    ignoring: compact(base),
    aliased: compact(aliased),
    loose: compact(loose),
    sound: compact(sound),
    consonants: compact(segment(loose, (t) => consonants(soundsLike(t)))),
    // the sounds-like form, for the typo tier
    typo: compact(sound),
    words: loose,
  };
};

/**
 * Lower-case "loose" form of a name, for comparing and grouping rows that are the same place written differently
 * (the master table has both "Bihar" and "BIHAR"). Words are kept, separated by single spaces.
 */
export const normalizeName = (value) => keysOf(value).words.join(' ');

const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
};

/** Wrong / missing / extra letters allowed by length: one typo needs 7+ letters, two need 12+ ("Bela" is not "Bala"). */
const allowedTypos = (length) => (length >= 12 ? 2 : length >= 7 ? 1 : 0);

/** [tier name, key to compare, score of a match at that tier] */
const TIERS = [
  ['exact', 'exact', 1],
  ['ignoring', 'ignoring', 0.998],
  ['aliased', 'aliased', 0.995],
  ['loose', 'loose', 0.99],
  ['sound', 'sound', 0.95],
];
const TYPO_SCORE = 0.885;
const CONSONANT_SCORE = 0.87;
const MIN_CONSONANTS = 3;                          // "Ara" / "Era" share consonants but are not the same place
/** The consonant skeleton must also start with the same letter: "East" and "South" are both "st" without it. */
const skeleton = (keys) => `${keys.sound[0] ?? ''}|${keys.consonants}`;

/** 1 = same name ... 0 = nothing alike: the score of the first tier at which the two names meet. */
export const similarity = (a, b) => {
  const ka = keysOf(a);
  const kb = keysOf(b);
  if (!ka.exact || !kb.exact) return 0;
  for (const [, key, score] of TIERS) if (ka[key] === kb[key]) return score;
  const allowed = allowedTypos(Math.max(ka.typo.length, kb.typo.length));
  if (allowed && levenshtein(ka.typo, kb.typo) <= allowed) return TYPO_SCORE;
  if (ka.consonants.length >= MIN_CONSONANTS && skeleton(ka) === skeleton(kb)) return CONSONANT_SCORE;
  return 0;
};

/**
 * The one sibling a name refers to, or null when nothing is close enough or several are equally close.
 * @param {string} name
 * @param {Array<{id:number,name:string}>} candidates the siblings (never the whole country)
 * @param {{ threshold?: number }} [options] lowest tier score accepted (default 0.86: every tier)
 * @returns {{ id:number, name:string, score:number } | null}
 */
export const bestMatch = (name, candidates, { threshold = 0.86 } = {}) => {
  const wanted = keysOf(name);
  if (!wanted.exact) return null;
  const keyed = candidates.map((c) => ({ c, keys: keysOf(c.name) }));

  for (const [, key, score] of TIERS) {
    if (score < threshold) return null;
    const hits = keyed.filter((k) => k.keys[key] === wanted[key]);
    if (hits.length === 1) return { id: hits[0].c.id, name: hits[0].c.name, score };
    if (hits.length > 1) return null;                       // ambiguous: do not guess, do not try looser tiers
  }

  // one typo: the nearest sibling within the allowed distance, if it is alone in being the nearest
  if (TYPO_SCORE >= threshold) {
    let best = null;
    let tied = false;
    for (const { c, keys } of keyed) {
      const allowed = allowedTypos(Math.max(wanted.typo.length, keys.typo.length));
      if (!allowed) continue;
      const distance = levenshtein(wanted.typo, keys.typo);
      if (distance > allowed) continue;
      if (!best || distance < best.distance) { best = { c, distance }; tied = false; }
      else if (distance === best.distance) tied = true;
    }
    if (best) return tied ? null : { id: best.c.id, name: best.c.name, score: TYPO_SCORE };
  }

  // same consonants in the same order (and the same first letter), when exactly one sibling has them
  if (CONSONANT_SCORE >= threshold && wanted.consonants.length >= MIN_CONSONANTS) {
    const hits = keyed.filter((k) => skeleton(k.keys) === skeleton(wanted));
    if (hits.length === 1) return { id: hits[0].c.id, name: hits[0].c.name, score: CONSONANT_SCORE };
  }
  return null;
};

/** Title Case for names the directory writes in capitals ("RAMPUR KALAN" -> "Rampur Kalan"); other names are left alone. */
export const tidyName = (value) => {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (s.length > 3 && s === s.toUpperCase() && /[A-Z]/.test(s)) {
    return s.toLowerCase().replace(/(^|[\s(\-/])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
  }
  return s;
};
