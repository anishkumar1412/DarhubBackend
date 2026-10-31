import { z } from 'zod';
import { optionalText } from './common.js';

/** GET /api/locations/match: names only, short, and a handful of them (it is a public endpoint). */
export const locationMatchQuery = z.object({
  state: optionalText('state', { max: 100 }),
  district: optionalText('district', { max: 100 }),
  // "Gondal|Gondal City|Station Road": place names the geocoder knew, separated by |
  places: z.preprocess(
    (v) => (typeof v === 'string' ? v.split('|').map((p) => p.trim()).filter(Boolean) : v ?? []),
    z.array(z.string().max(100, 'a place name is too long')).max(8, 'at most 8 place names').default([]),
  ),
});
