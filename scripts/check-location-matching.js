/**
 * Measures how well utils/locationMatch.js finds the right place when a name is spelled differently, for EVERY
 * state, district and block of the official directory (and a sample of panchayats).
 *
 *   node scripts/download-lgd.js ./lgd-data          (once)
 *   node scripts/check-location-matching.js ./lgd-data [--verbose]
 *
 * For each place it builds spelling variants the way a phone's geocoder or a person might write them (case,
 * punctuation, "District" / "City" words, vowel swaps like Ahmedabad / Ahmadabad, v/w, ph/f, c/k, doubled letters,
 * dropped letters), matches each variant against ONLY the siblings of that place (the districts of its state, the
 * blocks of its district...: exactly what the server does), and counts:
 *   right  the correct place was returned
 *   none   nothing was returned (the farmer picks it: safe)
 *   WRONG  another place was returned (the one outcome that must stay near zero)
 * It also reports sibling names the matcher cannot tell apart (they can only ever match by exact spelling).
 * Exit code 1 when WRONG is above the limit or recall is below the floor, so it can run in CI.
 */
import fs from 'fs';
import path from 'path';
import { bestMatch, normalizeName } from '../utils/locationMatch.js';

const dir = process.argv[2];
const verbose = process.argv.includes('--verbose');
if (!dir) { console.error('Usage: node scripts/check-location-matching.js <lgd-data folder> [--verbose]'); process.exit(1); }

const parseCsv = (text) => {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [h, ...b] = rows;
  return b.map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));
};
const load = (f) => parseCsv(fs.readFileSync(path.join(dir, f), 'utf8'));

// Deterministic random numbers, so a run can be repeated and compared
let seed = 20261021;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

/** Spelling changes real transliteration makes; each takes the name and returns a changed copy (or the same). */
const SWAPS = [['a', 'e'], ['e', 'a'], ['i', 'ee'], ['ee', 'i'], ['o', 'u'], ['u', 'o'], ['i', 'y'], ['v', 'w'], ['w', 'v'],
  ['ph', 'f'], ['f', 'ph'], ['k', 'c'], ['c', 'k'], ['j', 'z'], ['sh', 's'], ['s', 'sh'], ['dh', 'd'], ['bh', 'b'], ['th', 't'],
  ['ai', 'ay'], ['au', 'ow'], ['aa', 'a'], ['a', 'aa']];
const mutations = {
  case: (n) => (rnd() < 0.5 ? n.toUpperCase() : n.toLowerCase()),
  spaces: (n) => ` ${n.replace(/ /g, '  ')} `,
  punctuation: (n) => n.replace(/ /g, '-'),
  joined: (n) => n.replace(/ /g, ''),
  kindWord: (n) => pick([`${n} District`, `${n} City`, `${n} Taluka`, `${n} Urban`, `District ${n}`, `${n} (Rural)`]),
  swap: (n) => {
    const lower = n.toLowerCase();
    const options = SWAPS.filter(([from]) => lower.includes(from));
    if (!options.length) return n;
    const [from, to] = pick(options);
    const at = lower.indexOf(from);
    return lower.slice(0, at) + to + lower.slice(at + from.length);
  },
  doubled: (n) => { const i = Math.floor(rnd() * n.length); return /[a-z]/i.test(n[i]) ? n.slice(0, i) + n[i] + n.slice(i) : n; },
  droppedLetter: (n) => { if (n.length < 7) return n; const i = 1 + Math.floor(rnd() * (n.length - 2)); return n.slice(0, i) + n.slice(i + 1); },
};

const stats = {};
const wrongs = [];
const falsePositives = [];
const ambiguous = [];
const record = (level, kind, outcome, detail) => {
  const s = (stats[level] ??= { total: 0, right: 0, none: 0, wrong: 0, byKind: {} });
  s.total++; s[outcome]++;
  const k = (s.byKind[kind] ??= { total: 0, right: 0 });
  k.total++; if (outcome === 'right') k.right++;
  if (outcome === 'wrong') wrongs.push({ level, kind, ...detail });
};

const strictKey = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '');
const hasNumeral = (n) => n.toLowerCase().split(/[^a-z0-9]+/).some((w) => /^([ivx]+|\d+)$/.test(w));
const LETTER_LEVEL = new Set(['swap', 'doubled', 'droppedLetter']);

const evaluate = (level, groups, { sampleEvery = 1 } = {}) => {
  const all = groups.flat();
  for (const siblings of groups) {
    const candidates = siblings.map((s) => ({ id: s.id, name: s.name }));
    // names the matcher cannot tell apart even when spelled exactly the same way as the official name
    const seen = new Map();
    for (const c of candidates) {
      const key = normalizeName(c.name);
      if (seen.has(key)) ambiguous.push(`${level}: "${c.name}" and "${seen.get(key)}" normalise to the same name "${key}"`);
      else seen.set(key, c.name);
    }
    siblings.forEach((place, index) => {
      if (index % sampleEvery) return;
      // official spelling must always find itself
      const exact = bestMatch(place.name, candidates);
      record(level, 'exact', exact?.id === place.id ? 'right' : exact ? 'wrong' : 'none', { name: place.name, got: exact?.name });
      // a name that is NOT among these siblings must not be matched to one of them (the real risk of a tolerant matcher)
      if (index % 3 === 0 && all.length > siblings.length) {
        const stranger = pick(all);
        if (!siblings.some((s) => strictKey(s.name) === strictKey(stranger.name))) {
          const found = bestMatch(stranger.name, candidates);
          const s = (stats[`${level} (absent names)`] ??= { total: 0, right: 0, none: 0, wrong: 0, byKind: {} });
          s.total++; s[found ? 'wrong' : 'right']++;
          if (found) falsePositives.push(`[${level}] "${stranger.name}" is not among ${siblings.length} siblings but matched "${found.name}"`);
        }
      }
      for (const [kind, mutate] of Object.entries(mutations)) {
        if (LETTER_LEVEL.has(kind) && hasNumeral(place.name)) continue;      // "Hansi-I" is a different place from "Hansi-II"
        const variant = mutate(place.name);
        if (variant.trim().toLowerCase() === place.name.trim().toLowerCase() && kind !== 'case') continue;   // the mutation did not apply
        // the variant is, spelled out, the official name of ANOTHER sibling: not a matcher error
        if (siblings.some((s) => s.id !== place.id && strictKey(s.name) === strictKey(variant))) continue;
        const found = bestMatch(variant, candidates);
        record(level, kind, found?.id === place.id ? 'right' : found ? 'wrong' : 'none', { name: place.name, variant, got: found?.name });
      }
    });
  }
};

const group = (rows, parentKey, idKey, nameKey) => {
  const map = new Map();
  for (const r of rows) map.set(r[parentKey], [...(map.get(r[parentKey]) ?? []), { id: r[idKey], name: r[nameKey] }]);
  return [...map.values()];
};

const states = load('state_lgd_codes.csv');
evaluate('states', [states.map((s) => ({ id: s.state_code, name: s.state_name }))]);
evaluate('districts', group(load('district_lgd_codes.csv'), 'state_code', 'district_code', 'district_name'));
evaluate('blocks', group(load('block_lgd_codes.csv'), 'district_code', 'block_code', 'block_name'));
evaluate('panchayats (every 5th)', group(load('gram_panchayat_lgd_codes.csv'), 'block_code', 'gp_code', 'gp_name'), { sampleEvery: 5 });

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(2)}%` : '-');
let totalWrong = 0; let totalAll = 0; let totalRight = 0;
for (const [level, s] of Object.entries(stats)) {
  if (!level.includes('absent')) { totalWrong += s.wrong; totalAll += s.total; totalRight += s.right; }
  if (level.includes('absent')) {
    console.log(`\n${level.padEnd(34)} tests ${String(s.total).padStart(7)}   correctly NOT matched ${pct(s.right, s.total).padStart(7)}   falsely matched ${pct(s.wrong, s.total).padStart(6)} (${s.wrong})`);
    continue;
  }
  console.log(`\n${level.padEnd(24)} tests ${String(s.total).padStart(7)}   right ${pct(s.right, s.total).padStart(7)}   none ${pct(s.none, s.total).padStart(7)}   WRONG ${pct(s.wrong, s.total).padStart(6)} (${s.wrong})`);
  if (verbose) for (const [k, v] of Object.entries(s.byKind)) console.log(`    ${k.padEnd(14)} ${pct(v.right, v.total).padStart(7)} of ${v.total}`);
}
console.log(`\nALL: ${totalAll} tests, right ${pct(totalRight, totalAll)}, WRONG ${pct(totalWrong, totalAll)} (${totalWrong})`);
if (wrongs.length) {
  console.log(`\nWrong matches (first ${Math.min(25, wrongs.length)}):`);
  wrongs.slice(0, 25).forEach((w) => console.log(`  [${w.level}/${w.kind}] "${w.variant ?? w.name}" (official "${w.name}") -> "${w.got}"`));
}
if (falsePositives.length) {
  console.log(`\nNames that are not in the list but were matched anyway (first 12):`);
  falsePositives.slice(0, 12).forEach((f) => console.log(`  ${f}`));
}
if (ambiguous.length) {
  console.log(`\n${ambiguous.length} sibling pair(s) share the same normalised name (first 10):`);
  ambiguous.slice(0, 10).forEach((a) => console.log(`  ${a}`));
}
const limit = Number(process.env.MAX_WRONG_PERCENT ?? 0.1);
const floor = Number(process.env.MIN_RIGHT_PERCENT ?? 90);
const wrongPct = (100 * totalWrong) / totalAll;
const rightPct = (100 * totalRight) / totalAll;
if (wrongPct > limit || rightPct < floor) {
  console.log(`\nFAIL: wrong ${wrongPct.toFixed(3)}% (limit ${limit}%), right ${rightPct.toFixed(2)}% (floor ${floor}%)`);
  process.exit(1);
}
console.log(`\nOK: wrong ${wrongPct.toFixed(3)}% (limit ${limit}%), right ${rightPct.toFixed(2)}% (floor ${floor}%)`);
