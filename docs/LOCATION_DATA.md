# Location data (state, district, block, panchayat) and "Use current location"

## Source and licence

| | |
|---|---|
| Data | Local Government Directory (LGD): 38 states / UTs, 765 districts, 7,245 development blocks, 252,049 gram panchayats |
| Publisher | Ministry of Panchayati Raj, Government of India ([lgdirectory.gov.in](https://lgdirectory.gov.in)) |
| Copy used | India Data Portal, dataset "LGD Codes" ([ckandev.indiadataportal.com/dataset/lgd-codes](https://ckandev.indiadataportal.com/dataset/lgd-codes)), CSV, data last modified **October 2023** |
| Licence of that copy | **Open Data Commons Attribution License (ODC-By)**: commercial use allowed, the source must be credited |
| Licence of the original | Government Open Data License - India (GODL): commercial use allowed with attribution |
| Credit shown in the app | About Us screen (`credit_location_data` in `strings.xml`). Keep it. |

The official LGD download page sits behind a captcha, so nothing is scraped from it: `scripts/download-lgd.js` only fetches the published CSV files.
Have the licence confirmed once by whoever signs off the launch (the data.gov.in contact for licence questions is ndsap@gov.in); this document is an engineering note, not legal advice.
Not used: villages (100 MB, and the app lists panchayats), geocoding services (the phone's own Geocoder is used), map tiles.

## What was added

| Piece | File |
|---|---|
| `lgd_code` column + indexes on the four master tables | [migrations/005_lgd_location_codes.sql](../migrations/005_lgd_location_codes.sql), models `MasterState/District/Block/GramPanchayat` |
| Download | [scripts/download-lgd.js](../scripts/download-lgd.js) |
| Merge into the database | [scripts/import-lgd.js](../scripts/import-lgd.js) |
| Name matching (spelling variants) | [utils/locationMatch.js](../utils/locationMatch.js) |
| GPS names -> our ids | `GET /api/locations/match`, [services/locationResolve.service.js](../services/locationResolve.service.js) |
| App | `LocationPickerView.useCurrentLocation()`, `CurrentLocationFinder.kt`; the booking page and Add Farm sheet call it from their own cards |

## Loading it into a database

```bash
cd DarhubBackend
node scripts/apply-sql.js migrations/005_lgd_location_codes.sql --apply   # or let DB_SYNC_ALTER add the columns, then apply the indexes
node scripts/download-lgd.js ./lgd-data
node scripts/import-lgd.js ./lgd-data            # DRY RUN: does the whole merge in a transaction, prints the report, rolls back
node scripts/import-lgd.js ./lgd-data --apply    # commit
```

* **Back up the database first.** The import only inserts rows and fills the new `lgd_code` column; it never renames, moves or deletes an existing row, so ids used by addresses, orders and drones stay valid. It is repeatable: a second run changes nothing.
* It refuses a remote database unless `--allow-remote` is given. `apply-sql.js` is hard-wired to SSL, so on a local database without SSL run the migration with `psql -f` instead.
* Existing rows that match an official one (same state, same district... by spelling-tolerant name) keep their id and name and get the code (test database: 10 of 11 states, 25 of 26 districts, 49 of 52 blocks). Everything else is inserted. About 260,000 rows are added; the run takes a few seconds.
* The dry run reports existing rows that look wrong. **Nothing is changed for them; decide what to do.** In the test copy of your data:
  * state "Bihar" (#12) and "BIHAR" (#22) are the same state; only #12 got the code;
  * district #5 "KHURDHA" is filed under JHARKHAND, but Khordha is in Odisha (the official Khordha was inserted under Odisha);
  * blocks "AGARPADA", "SADAR" and "Danapur" are not in the directory under those names; "AGARPADA" also points at district 34, which does not exist.
* Production has not been touched by anything here. Run the dry run against a restored copy of production first.

## "Use current location" (GPS)

```
tap -> permission (if needed) -> phone reads position -> phone's Geocoder gives place names
    -> GET /api/locations/match?state=..&district=..&places=a|b|c -> ids -> the lists are selected
```

* Only **place names** are sent to the server, never coordinates. Position and address lookup are on the phone (Play Services location + the platform Geocoder; no API key, no third-party service of ours).
* **Strict, level by level:** a level is filled only from what the phone actually reported for it, and the first level that cannot be matched stops everything below it. State only -> only the state is selected; state + district -> those two. The district is never inferred from a locality name, and the district's own name is never used as a block. The farmer picks the rest.
* **The name matcher** ([utils/locationMatch.js](../utils/locationMatch.js)) compares a name only with the siblings of the place it belongs to (the districts of one state, the blocks of one district), in tiers from strictest to loosest. The first tier that finds exactly one sibling decides; a tier that finds several returns nothing, and no looser tier is tried after that.

  | Tier | Treats as the same | Example |
  |---|---|---|
  | 1 exact | case, punctuation, spacing | "Detroj-Rampura" = "detroj rampura" |
  | 2 | ... and the words District, Taluka, Division, Block, The | "Pune District" = "Pune" |
  | 3 aliases | ... and old / new names | "Bangalore Urban" = "Bengaluru Urban", "Allahabad" = "Prayagraj", "Kutch" = "Kachchh" |
  | 4 | ... and City, Urban, Rural, (brackets), when unambiguous | "Ahmedabad City" = "Ahmedabad" |
  | 5 sounds-like | ... and e/i, o/u, v/w, ph/f, c/k, double letters, silent h | "Ahmadabad", "Khurdha" = "Khordha" |
  | 6 one typo | one wrong / missing / extra letter (names of 7+ letters; two for 12+) | "Ahmedabad" = "Ahmadabad" |
  | 7 consonants | same consonants, same first letter, only one sibling has them | "Mahesana" = "Mehsana" |

  Roman numerals and one-letter qualifiers are never blurred ("Hansi-I" is not "Hansi-II", "Sirpur (T)" is not "Sirpur (U)"), and aliases are not applied to exact matches (the directory has both the district "Gurugram" and the block "Gurgaon"). Villages (panchayats) only use tiers 1-5: village names differ by one real letter all the time.
* **Measured on the whole directory:** `npm run check:locations` (after `download-lgd.js`) builds about 386,000 misspelt variants of every state, district, block and a sample of panchayats, matches them against their siblings and counts right / not found / wrong, and also tests names that are NOT in the list. Last run: **97.6% found, 0.03% wrong, the rest left for the farmer to pick**; for districts 0 of 256 absent names were falsely matched. It fails (exit code 1) above 0.1% wrong, so it can gate a change to the matcher. Through the live endpoint, all 765 districts resolve from upper-case and "... District" spellings.
* To add a renamed place, add one line to `ALIASES` in `locationMatch.js` and a case in `tests/locationMatch.test.js`.
* What the matcher deliberately does NOT do: guess when two siblings are equally close, match very short names that differ by a letter ("Bela" / "Bala"), or match a place that is not in the list.
* The server matches names to rows tolerant of spelling
* Messages cover: permission refused, location switch off, no position, no address (offline), nothing matched, only partly matched.
* Screens: sign-up, add address, profile, farm information (button inside the picker); booking step 1 and Add Farm sheet (their existing "Use current location" cards, same code).

## Known limits

* The directory snapshot is from October 2023: districts and blocks created since are missing. Re-run `download-lgd.js` + `import-lgd.js` when the India Data Portal publishes a newer file.
* The panchayat list of a block can be long (up to about 300) and the dropdown has no search box.
* The phone's Geocoder gives districts reliably in cities and towns but sometimes only a locality in the countryside, and "blocks" are the government's units, not what people call their area: expect state + district most of the time, block when the locality name is also a block name, panchayat rarely. The farmer completes the rest from the lists.
* Drone service areas are separate (`DRONE_ADDRESS`): a farmer in a block with no drone gets the "not available" answer at booking, as before. The new data makes many more blocks selectable.
* An installed app that talks to a backend without the new data/endpoint still works: the button then reports "could not match", and the lists stay as they were.
