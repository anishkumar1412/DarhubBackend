/**
 * Downloads the Local Government Directory (LGD) code files that scripts/import-lgd.js merges into the database.
 *
 *   node scripts/download-lgd.js ./lgd-data
 *
 * Source: India Data Portal, dataset "LGD Codes" (https://ckandev.indiadataportal.com/dataset/lgd-codes), which
 * republishes the official directory of the Ministry of Panchayati Raj (https://lgdirectory.gov.in).
 * Licence: Open Data Commons Attribution License (ODC-By): free for commercial use if the source is credited.
 * The credit text the app shows is in docs/LOCATION_DATA.md. (The official portal's own download needs a captcha, so
 * it is not scraped here.) The villages file (about 100 MB) is not needed: the app lists panchayats.
 */
import fs from 'fs';
import path from 'path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/download-lgd.js <folder>');
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });

const API = 'https://ckandev.indiadataportal.com/api/3/action/package_show?id=lgd-codes';
const NEEDED = {
  'State LGD Codes': 'state_lgd_codes.csv',
  'District LGD Codes': 'district_lgd_codes.csv',
  'Block LGD Codes': 'block_lgd_codes.csv',
  'Gram Panchayat LGD Codes': 'gram_panchayat_lgd_codes.csv',
};

const pkg = (await (await fetch(API)).json()).result;
console.log(`${pkg.title}  licence: ${pkg.license_title} (${pkg.license_id})  updated: ${pkg.metadata_modified}`);
for (const resource of pkg.resources) {
  const file = NEEDED[resource.name];
  if (!file) continue;
  const res = await fetch(resource.url);
  if (!res.ok) throw new Error(`${resource.name}: HTTP ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(path.join(dir, file), text);
  console.log(`${file}  ${(text.length / 1e6).toFixed(1)} MB  (data last modified ${resource.last_modified})`);
}
const missing = Object.values(NEEDED).filter((f) => !fs.existsSync(path.join(dir, f)));
if (missing.length) throw new Error(`Not found in the dataset: ${missing.join(', ')}`);
