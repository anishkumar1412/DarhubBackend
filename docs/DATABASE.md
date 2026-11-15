# Database: migrations, seeders, local setup, go-live

The schema is owned by **migrations** (`migrations/`, run by `sequelize-cli`) and the reference data by **seeders**
(`seeders/`). The server no longer creates or alters tables: a model change without a migration is caught by
`npm run db:check`, and a production start with a migration pending is refused.

| | |
|---|---|
| `migrations/*.cjs` | Ordered, versioned schema changes. Recorded in the `SequelizeMeta` table. `.cjs` because the project is ESM. |
| `seeders/*.cjs` | **Reference data**, safe for production, idempotent (re-run on every deploy). |
| `seeders/demo/*.cjs` | **Demo data**, development only (`npm run db:seed:demo`). Never in production. |
| `db/sql/` | The SQL that the migrations execute (`001` integrity, `003` indexes, `005` location indexes). `manual/` holds one-off data fixes you run by hand; `superseded/` is history. |
| `config/sequelize-cli.cjs` | Which database the CLI targets, plus the remote-database guard (below). |

## Commands

| Command | What it does |
|---|---|
| `npm run db:setup:local` | Starts the Docker Postgres, migrates, seeds reference data. First-time local setup in one command. |
| `npm run db:migrate` / `db:migrate:status` | Apply pending migrations / list applied and pending. |
| `npm run db:migrate:undo` / `undo:all` | Roll back the last / every migration (refused in production). |
| `npm run db:seed` | Reference data: 30 privileges, 6 roles (`super_admin`, `manager`, `operator`, `viewer`, `Pilot`, `Farmer`), default role privileges. |
| `npm run db:seed:locations` | Downloads and merges the official LGD directory: 38 states, 765 districts, 7,245 blocks, 252,049 panchayats (see [LOCATION_DATA.md](LOCATION_DATA.md)). |
| `npm run db:seed:demo` | Sample crops, working-day bands, fertilizers, inventory dashboard rows. **Development only.** |
| `npm run db:check` | Read-only: do the models match the database, and is anything pending? Exit 1 = no. Use as a CI / release gate. |
| `npm run db:rehearse` | Release gate: migrate a throwaway DB, check, seed twice, roll all back, migrate again. |
| `npm run db:reset:local` | Roll everything back and rebuild the local database (destroys local data). |

## Local setup

```bash
cd DarhubBackend
cp .env.local.example .env.local          # points at the Docker database, port 55433
npm run db:setup:local                    # container + migrate + seed
npm run db:seed:locations                 # optional: the full location directory (~15 s)
ENV_FILE=.env.local npm run dev           # run the API against it
```
The Docker database (`darhub-local-pg`, user `darhub`, db `darhub_local`, port 55433) is separate from the e2e test
database (port 55432) and from every remote database. Connect with
`docker exec -it darhub-local-pg psql -U darhub -d darhub_local`.

## Which database a command targets (and the safety net)

* `ENV_FILE=<file>` is honoured by the server, the CLI and every script.
* The CLI never loads the project's plain `.env` implicitly. With nothing set it uses `.env.local`; on a platform
  (Render, CI) the variables already in the environment win.
* **A database that is not on this machine is refused** unless `NODE_ENV=production` or `ALLOW_REMOTE_DB=true`. A stray
  `npm run db:migrate` on a laptop cannot touch the shared dev database.
* The server and `scripts/*.js` read `.env` when `ENV_FILE` is unset: **always set `ENV_FILE` when running tests or
  scripts**, e.g. `ENV_FILE=.env.local npm test`.

## Changing the schema (every future change)

1. Edit the model.
2. Add a migration named `YYYYMMDDHHMMSS-short-description.cjs` in `migrations/` (do **not** use
   `sequelize-cli migration:generate`: it writes `.js`, which fails in an ESM project).
   ```js
   'use strict';
   module.exports = {
     async up(queryInterface, Sequelize) {
       await queryInterface.addColumn('SPRAYING_ORDER', 'rating_note', { type: Sequelize.TEXT, allowNull: true });
     },
     async down(queryInterface) {
       await queryInterface.removeColumn('SPRAYING_ORDER', 'rating_note');
     },
   };
   ```
3. Never edit a migration that has been applied anywhere shared; add a new one.
4. `npm run db:migrate && npm run db:check && npm run db:rehearse`.
5. New columns on busy tables: add them nullable (or with a default), backfill in a later migration, add `NOT NULL` last.
   Create indexes with `CREATE INDEX CONCURRENTLY` (see `20261031000010`).

To ship a new admin privilege or role: edit `seeders/20261031000001-rbac-roles-and-privileges.cjs`, run `npm run db:seed`.
New privileges reach `super_admin` automatically; existing roles are granted them from the admin panel (a re-seed never
overwrites what an administrator configured).

## What the migrations contain

| # | Migration | Content |
|---|---|---|
| 01-07 | `create-*-tables` | All 75 model tables, by domain: RBAC/admin, users, location + catalog masters, drones, spraying orders, inventory/trade, vendors/maintenance. |
| 08 | `add-model-foreign-keys` | The 8 foreign keys declared in models, added after all tables exist (names = PostgreSQL defaults, as `sync()` gave them). |
| 09 | `data-integrity-constraints` | `db/sql/001` (unique e-mail/mobile/profile/role pairs, one booking per pilot/drone per day, 11 foreign keys, 3 order checks) + unique state name. |
| 10 | `performance-and-location-indexes` | `db/sql/003` + `005`: lookup indexes, unique `lgd_code` per level. |
| 11 | `rbac-unique-constraints` | One role per name (case-insensitive), one privilege per name, one mapping per (role, privilege). |

The baseline was generated from the models and **verified identical** to what `sequelize.sync()` builds (a
`pg_dump` diff of the two schemas differs only by a duplicate constraint that boot-time `sync({alter:true})` had been
adding to `warehouses` on every start).

## Go-live runbook

### A. New production database
```bash
# production environment variables set (docs/PRODUCTION_CHECKLIST.md section 2); NODE_ENV=production
npm run db:migrate           # 11 migrations
npm run db:seed              # roles + privileges (the Pilot role is REQUIRED: pilot sign-up returns 500 without it)
npm run db:seed:locations    # official locations
npm start                    # first boot creates the super admin from SUPER_ADMIN_EMAIL and mails the setup link
```
On Render: build `npm ci`, pre-deploy command `npm run db:migrate && npm run db:seed`, start `npm start`.
`sequelize-cli` is a normal dependency so it exists after `npm ci --omit=dev`.

### B. Existing database (built earlier by `sync()`, holds data)
The baseline migrations are written for this: a table that exists is **never altered or dropped**, only missing columns
and indexes are added; constraints that existing rows violate are added `NOT VALID` (enforced for new rows) and reported.
```bash
# 0. BACKUP FIRST (pg_dump), and rehearse on a restored copy if you can.
# 1. Read-only drift report: what differs between the live schema and the models?
ENV_FILE=<that database's env file> npm run db:check
# 2. Duplicates that would block unique indexes (e-mails, mobiles, double-booked pilots):
ENV_FILE=... npm run audit:data -- --details
# 3. If "Bihar" and "BIHAR" both exist in MASTER_STATE, review and run db/sql/manual/002_location_master_cleanup.sql.
# 4. Apply. Duplicates stop the migration with a message and roll that migration back; nothing is deleted for you.
ENV_FILE=... ALLOW_REMOTE_DB=true npm run db:migrate
ENV_FILE=... ALLOW_REMOTE_DB=true npm run db:seed
```
Type differences that `db:check` reports (for example `MASTER_CROP.price_per_acre` INTEGER vs DECIMAL(10,2)) are
**not** changed by the baseline; fix them with an explicit new migration after reviewing the data.

### Rollback
`npm run db:migrate:undo` reverts the last migration. The baseline `down` drops tables and is refused in production
(`ALLOW_DESTRUCTIVE_MIGRATION=true` overrides). In production, restore the backup instead of rolling the baseline back.

## Things this work found in the old setup
* `MasterGramPanchayat.js` defined its model under the name `MasterDistrict`, so on a **fresh** database `sync()` never
  created `MASTER_DISTRICT` (location dropdowns would have failed). Fixed.
* `MasterProperller.js` had a double arrow function, so the model was never defined. Fixed (table name
  `MASTER_PROPERLLER` kept, as the existing database may already have it; nothing in the code uses it).
* The seeders never created the `Pilot` role, which pilot registration requires. Now seeded.
* `sync({ alter: true })` on boot added a duplicate unique constraint to `warehouses` on every start. Boot-time sync is
  now off by default (`DB_SYNC`, `DB_SYNC_ALTER`, tests only).
* Root-level patch scripts (`add_columns.js`, `add_maintenance_log_id.js`, `add_usage_columns.js`, `fix_constraint.js`,
  `sync.js`) are superseded: every column they added is in the models and therefore in the migrations. `sync.js`
  (`sync({alter:true})`) should not be run against a real database; consider deleting these.
