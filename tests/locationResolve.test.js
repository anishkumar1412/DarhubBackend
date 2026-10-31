import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocation } from '../services/locationResolve.service.js';

// A tiny in-memory stand-in for the four master tables (findAll with the where clauses the service uses)
const states = [
  { id: 2, state_name: 'ODISHA', lgd_code: 21 }, { id: 5, state_name: 'Gujarat', lgd_code: 24 },
  { id: 12, state_name: 'Bihar', lgd_code: 10 }, { id: 22, state_name: 'BIHAR', lgd_code: null },
];
const districts = [
  { id: 6, district_name: 'Ahmedabad', state_id: 5 }, { id: 9, district_name: 'Rajkot', state_id: 5 },
  { id: 30, district_name: 'Khordha', state_id: 2 }, { id: 25, district_name: 'Patna', state_id: 12 },
  { id: 31, district_name: 'Gaya', state_id: 22 },       // filed under the duplicate "BIHAR" row
];
const blocks = [
  { id: 61, block_name: 'Sanand', district_id: 6 }, { id: 62, block_name: 'Ahmadabad City', district_id: 6 },
  { id: 68, block_name: 'Gondal', district_id: 9 }, { id: 69, block_name: 'Rajkot', district_id: 9 },
  { id: 70, block_name: 'Gaya Sadar', district_id: 31 },
];
const panchayats = [
  { id: 100, gram_panchayat_name: 'Ambardi', block_id: 68 }, { id: 101, gram_panchayat_name: 'Bhadva', block_id: 68 },
];
const table = (rows) => ({
  findAll: async ({ where = {} }) => rows.filter((r) => Object.entries(where).every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v))),
});
const db = {
  MasterState: table(states), MasterDistrict: table(districts), MasterBlock: table(blocks), MasterGramPanchayat: table(panchayats),
  sequelize: { literal: (s) => s },
};
const names = (r) => [r.state?.name, r.district?.name, r.block?.name, r.panchayat?.name];

test('resolve: full chain from names, specific place beats the district name', async () => {
  const r = await resolveLocation(db, { state: 'Gujarat', district: 'Rajkot', places: ['Gondal', 'Ambardi'] });
  assert.deepEqual(names(r), ['Gujarat', 'Rajkot', 'Gondal', 'Ambardi']);
});

test('resolve: spelling variants and a misspelt village', async () => {
  assert.deepEqual(names(await resolveLocation(db, { state: 'GUJARAT', district: 'Ahmadabad', places: ['Sanand'] })).slice(0, 3),
    ['Gujarat', 'Ahmedabad', 'Sanand']);
  assert.equal((await resolveLocation(db, { state: 'Gujarat', district: 'Rajkot', places: ['Gondal', 'Ambardii'] })).panchayat?.name, 'Ambardi');
});

test('resolve: state only -> ONLY the state is filled (the district is never inferred from a locality)', async () => {
  const r = await resolveLocation(db, { state: 'Gujarat', places: ['Rajkot', 'Gondal'] });
  assert.deepEqual(names(r), ['Gujarat', undefined, undefined, undefined]);
  assert.deepEqual(names(await resolveLocation(db, { state: 'Gujarat' })), ['Gujarat', undefined, undefined, undefined]);
});

test('resolve: state + district but no locality -> the block is NOT guessed from the district name', async () => {
  const r = await resolveLocation(db, { state: 'Gujarat', district: 'Rajkot', places: [] });
  assert.deepEqual(names(r), ['Gujarat', 'Rajkot', undefined, undefined]);
  const ahd = await resolveLocation(db, { state: 'Gujarat', district: 'Ahmedabad', places: [] });
  assert.deepEqual(names(ahd), ['Gujarat', 'Ahmedabad', undefined, undefined], 'no "Ahmadabad City" unless the phone reported it');
});

test('resolve: a reported locality that is its own block ("Ahmedabad" city = "Ahmadabad City") is filled', async () => {
  const r = await resolveLocation(db, { state: 'Gujarat', district: 'Ahmedabad', places: ['Ahmedabad'] });
  assert.equal(r.block?.name, 'Ahmadabad City');
});

test('resolve: districts filed under the duplicate state row are still found', async () => {
  const r = await resolveLocation(db, { state: 'Bihar', district: 'Gaya', places: [] });
  assert.equal(r.district?.id, 31);
  assert.equal(r.state?.id, 12, 'the state with the official code is returned');
});

test('resolve: stops at the first level it cannot match, and never guesses', async () => {
  assert.deepEqual(names(await resolveLocation(db, { state: 'Atlantis', district: 'Rajkot' })), [undefined, undefined, undefined, undefined]);
  const noDistrict = await resolveLocation(db, { state: 'Gujarat', district: 'Mumbai', places: ['Gondal'] });
  assert.deepEqual(names(noDistrict), ['Gujarat', undefined, undefined, undefined], 'unknown district: nothing below it, even if a locality would match');
  const noBlock = await resolveLocation(db, { state: 'Gujarat', district: 'Rajkot', places: ['Nowhere'] });
  assert.deepEqual(names(noBlock), ['Gujarat', 'Rajkot', undefined, undefined]);
});
