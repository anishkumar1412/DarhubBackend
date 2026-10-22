import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, similarity, bestMatch, tidyName } from '../utils/locationMatch.js';

const m = (name, names, options) => bestMatch(name, names.map((n, i) => ({ id: i + 1, name: n })), options)?.name ?? null;

test('normalize: case, punctuation, "&", kind words, aliases', () => {
  assert.equal(normalizeName('  Detroj-Rampura '), 'detroj rampura');
  assert.equal(normalizeName('Jammu & Kashmir'), 'jammu and kashmir');
  assert.equal(normalizeName('Pune District'), 'pune');
  assert.equal(normalizeName('Ahmadabad City'), 'ahmadabad');
  assert.equal(normalizeName('Haveli (Rural)'), 'haveli');
  assert.equal(normalizeName('NCT of Delhi'), 'delhi');
  assert.equal(normalizeName('Orissa'), 'odisha');
  assert.equal(normalizeName('Urban'), 'urban', 'a name that is only a kind word keeps it');
  assert.equal(normalizeName(null), '');
  assert.equal(normalizeName('Café'), 'cafe');
});

// ── Gujarat: the districts as the official directory spells them
const GUJARAT = ['Ahmadabad', 'Amreli', 'Anand', 'Arvalli', 'Banas Kantha', 'Bharuch', 'Bhavnagar', 'Botad', 'Chhota Udaipur',
  'Dahod', 'Dang', 'Devbhumi Dwarka', 'Gandhinagar', 'Gir Somnath', 'Jamnagar', 'Junagadh', 'Kachchh', 'Kheda', 'Mahesana',
  'Mahisagar', 'Morbi', 'Narmada', 'Navsari', 'Panch Mahals', 'Patan', 'Porbandar', 'Rajkot', 'Sabar Kantha', 'Surat',
  'Surendranagar', 'Tapi', 'Vadodara', 'Valsad'];

test('Ahmedabad, Gujarat: every way the name is written finds the district', () => {
  for (const written of ['Ahmedabad', 'Ahmadabad', 'AHMEDABAD', 'ahmedabad', 'Ahmedabad District', 'District Ahmedabad', 'Ahmedabad City',
    'Ahmedabad Urban', 'Ahmedabad Division', ' Ahmedabad ', 'Ahmedabad.', 'Amdavad', 'Ahemdabad', 'Ahmadabad Gujarat'.replace(' Gujarat', '')]) {
    assert.equal(m(written, GUJARAT), 'Ahmadabad', `"${written}"`);
  }
});

test('Gujarat districts: common alternate spellings', () => {
  const cases = { 'Banaskantha': 'Banas Kantha', 'Banas Kantha District': 'Banas Kantha', 'Sabarkantha': 'Sabar Kantha', 'Mehsana': 'Mahesana',
    'Kutch': 'Kachchh', 'Kachchh': 'Kachchh', 'Panchmahal': 'Panch Mahals', 'Panchmahals': 'Panch Mahals', 'The Dangs': 'Dang', 'Dangs': 'Dang',
    'Baroda': 'Vadodara', 'Vadodra': 'Vadodara', 'Chota Udaipur': 'Chhota Udaipur', 'Chhotaudepur': 'Chhota Udaipur', 'Aravalli': 'Arvalli',
    'Devbhoomi Dwarka': 'Devbhumi Dwarka', 'Gir-Somnath': 'Gir Somnath', 'Surendra Nagar': 'Surendranagar', 'Gandhi Nagar': 'Gandhinagar',
    'Junagarh': 'Junagadh', 'Bhavanagar': 'Bhavnagar', 'Jamnager': 'Jamnagar', 'Bharuch District': 'Bharuch' };
  for (const [written, official] of Object.entries(cases)) assert.equal(m(written, GUJARAT), official, `"${written}"`);
});

test('renamed places: old and new names meet (aliases)', () => {
  assert.equal(m('Allahabad', ['Prayagraj', 'Lucknow']), 'Prayagraj');
  assert.equal(m('Bangalore Urban', ['Bengaluru Urban', 'Bengaluru Rural']), 'Bengaluru Urban');
  assert.equal(m('Bangalore Rural', ['Bengaluru Urban', 'Bengaluru Rural']), 'Bengaluru Rural');
  assert.equal(m('Gurgaon', ['Gurugram', 'Faridabad']), 'Gurugram');
  assert.equal(m('Orissa', ['Odisha', 'Gujarat']), 'Odisha');
  assert.equal(m('Chhatrapati Sambhajinagar', ['Aurangabad', 'Beed']), 'Aurangabad');
  assert.equal(m('Mysore', ['Mysuru', 'Mandya']), 'Mysuru');
});

test('exact official names always find themselves, even next to look-alikes', () => {
  assert.equal(m('Gurgaon', ['Gurugram', 'Gurgaon']), 'Gurgaon', 'the block "Gurgaon" is not the district "Gurugram"');
  assert.equal(m('Bengaluru Rural', ['Bengaluru Urban', 'Bengaluru Rural']), 'Bengaluru Rural');
  assert.equal(m('Patiala Rural', ['Patiala', 'Patiala Rural']), 'Patiala Rural');
  assert.equal(m('Patiala', ['Patiala', 'Patiala Rural']), 'Patiala');
  assert.equal(m('Ongpangkong(South)', ['Ongpangkong(North)', 'Ongpangkong(South)']), 'Ongpangkong(South)');
  assert.equal(m('Hansi-I', ['Hansi-I', 'Hansi-II']), 'Hansi-I');
  assert.equal(m('Hansi-II', ['Hansi-I', 'Hansi-II']), 'Hansi-II');
  assert.equal(m('Sirpur (T)', ['Sirpur (U)', 'Sirpur (T)']), 'Sirpur (T)');
});

test('ambiguous names are refused, not guessed', () => {
  assert.equal(m('Bengaluru', ['Bengaluru Urban', 'Bengaluru Rural']), null, 'urban or rural?');
  assert.equal(m('Patiala (Rural)', ['Patiala', 'Patiala Rural']), 'Patiala Rural');
  assert.equal(m('Rampur', ['Rampur Kalan', 'Rampur Khurd']), null);
  assert.equal(m('Hansi', ['Hansi-I', 'Hansi-II']), null, 'a numeral is part of the name');
  assert.equal(m('Garo Hills', ['East Garo Hills', 'West Garo Hills']), null);
});

test('different places stay apart', () => {
  assert.equal(m('Pune', ['Patna', 'Nashik']), null);
  assert.equal(m('Bela', ['Bala', 'Kela']), null, 'short names need an exact-ish match');
  assert.equal(m('Raipur', ['Jaipur', 'Rampur']), null);
  assert.equal(m('Aurangabad', ['Ahmadabad', 'Allahabad']), null);
  assert.equal(m('Mumbai', GUJARAT), null);
  assert.equal(m('', GUJARAT), null);
  assert.equal(m('South Garo Hills', ['East Garo Hills', 'West Garo Hills']), null);
  assert.equal(m('Sout Garo Hills', ['East Garo Hills', 'South Garo Hills']), 'South Garo Hills', 'consonants alone must not turn "South" into "East"');
  assert.equal(m('Kamaganj', ['Kaimganj', 'Kamalganj']), 'Kamalganj');
});

test('similarity: the tier decides the score', () => {
  assert.equal(similarity('Surat', 'SURAT'), 1);
  assert.ok(similarity('Ahmedabad', 'Ahmadabad') >= 0.86);
  assert.ok(similarity('Pune', 'Patna') < 0.86);
  assert.equal(similarity('', 'Pune'), 0);
});

test('villages: a threshold of 0.95 allows the same name or a sounds-like spelling, never a typo', () => {
  const villages = ['Tandi', 'Tindi', 'Ambardi', 'Bhadva'];
  assert.equal(m('Tandi', villages, { threshold: 0.95 }), 'Tandi');
  assert.equal(m('Ambardi', villages, { threshold: 0.95 }), 'Ambardi');
  assert.equal(m('Bhadwa', villages, { threshold: 0.95 }), 'Bhadva', 'v / w sound the same');
  assert.equal(m('Ambardii', villages, { threshold: 0.95 }), 'Ambardi', 'doubled letters sound the same');
  assert.equal(m('Tondi', ['Tindi', 'Tandi'], { threshold: 0.95 }), null, 'a different vowel in a village name is a different village');
  assert.equal(m('Tandi', ['Tindi', 'Tondi'], { threshold: 0.95 }), null, 'a / i / o are different sounds here');
  assert.equal(m('Ambard', villages, { threshold: 0.95 }), null);
});

test('tidyName: only all-capital names are rewritten', () => {
  assert.equal(tidyName('RAMPUR KALAN'), 'Rampur Kalan');
  assert.equal(tidyName('  Sahibganj  '), 'Sahibganj');
  assert.equal(tidyName('MCD (WEST)'), 'Mcd (West)');
  assert.equal(tidyName('Pune'), 'Pune');
  assert.equal(tidyName(null), '');
});
