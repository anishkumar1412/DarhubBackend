/**
 * Turns the place names a phone's GPS reverse-geocoder returned into ids from our location tables.
 *
 * STRICT: a level is filled only from what the geocoder actually reported for it, and the first level that cannot be
 * matched with confidence stops everything below it (state only -> only the state is filled; the farmer picks the rest):
 *   state     <- `state`
 *   district  <- `district` only (never inferred from a locality name)
 *   block     <- `places` (locality, sub-locality...) only; the district's own name is NOT used as a block
 *   panchayat <- `places` only, and only once a block is matched
 * Only names reach the server, never coordinates.
 */
import { bestMatch, normalizeName } from '../utils/locationMatch.js';

const asCandidates = (rows, nameKey) => rows.map((r) => ({ id: r.id, name: r[nameKey] }));

/** First of `names` that matches one of `candidates`, or null. */
const firstMatch = (names, candidates, options) => {
  for (const name of names) {
    const m = bestMatch(name, candidates, options);
    if (m) return { ...m, from: name };
  }
  return null;
};

export const resolveLocation = async (db, { state, district, places = [] }) => {
  const result = { state: null, district: null, block: null, panchayat: null };
  const placeNames = [...new Set(places.map((n) => n.trim()).filter(Boolean))];

  // ── state: every row of that state (the table has "Bihar" and "BIHAR"), the one with the official code first
  const states = await db.MasterState.findAll({
    attributes: ['id', 'state_name', 'lgd_code'], raw: true,
    order: [[db.sequelize.literal('"lgd_code" IS NULL'), 'ASC'], ['id', 'ASC']],
  });
  // "Bihar" and "BIHAR" are one state: offer it once (the row with the official code comes first in the list)
  const seenStates = new Set();
  const stateCandidates = asCandidates(states, 'state_name').filter((c) => {
    const key = normalizeName(c.name);
    if (seenStates.has(key)) return false;
    seenStates.add(key);
    return true;
  });
  const stateMatch = state ? bestMatch(state, stateCandidates, { threshold: 0.88 }) : null;
  if (!stateMatch) return result;
  result.state = { id: stateMatch.id, name: stateMatch.name };
  const sameState = states.filter((s) => normalizeName(s.state_name) === normalizeName(stateMatch.name)).map((s) => s.id);

  // ── district: only if the geocoder reported one
  const districts = district ? await db.MasterDistrict.findAll({
    where: { state_id: sameState }, attributes: ['id', 'district_name'], raw: true, order: [['id', 'ASC']],
  }) : [];
  const districtMatch = district ? bestMatch(district, asCandidates(districts, 'district_name')) : null;
  if (!districtMatch) return result;
  result.district = { id: districtMatch.id, name: districtMatch.name };

  // ── block: from the reported localities
  const blocks = await db.MasterBlock.findAll({
    where: { district_id: districtMatch.id }, attributes: ['id', 'block_name'], raw: true, order: [['id', 'ASC']],
  });
  const blockMatch = firstMatch(placeNames, asCandidates(blocks, 'block_name'));
  if (!blockMatch) return result;
  result.block = { id: blockMatch.id, name: blockMatch.name };

  // ── panchayat / village: from the reported localities (the name that already matched the block is skipped)
  const panchayats = await db.MasterGramPanchayat.findAll({
    where: { block_id: blockMatch.id }, attributes: ['id', 'gram_panchayat_name'], raw: true, order: [['id', 'ASC']],
  });
  // villages differ by one real letter all the time (Tandi / Tindi): no typo or consonant matching here, only
  // the same name or a spelling that sounds the same
  const panchayatMatch = firstMatch(placeNames.filter((n) => normalizeName(n) !== normalizeName(blockMatch.name)),
    asCandidates(panchayats, 'gram_panchayat_name'), { threshold: 0.95 });
  if (panchayatMatch) result.panchayat = { id: panchayatMatch.id, name: panchayatMatch.name };
  return result;
};
