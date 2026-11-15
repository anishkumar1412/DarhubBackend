# Deploying the Darhub backend on Render (fresh database)

A step-by-step runbook. It assumes a **new, empty PostgreSQL database** and the code on GitHub.

## 0. What you need first
- The code pushed to GitHub (section 1).
- A Render account with a payment method. **Use a paid instance (Starter or higher)** for the web service:
  the notification delivery worker and the 07:00 pilot reminder run inside the server, and a free instance sleeps
  (no worker, no cron) and blocks outbound SMTP. Free is fine only for a throwaway test.
- Cloudinary account (file storage; Render's disk is erased on every deploy): cloud name, API key, API secret.
- The Firebase service-account key (`*-firebase-adminsdk-*.json`), see `docs/PUSH_NOTIFICATIONS.md` section 11.
- An SMTP account (Gmail App Password or an email provider) for the super-admin setup e-mail and password resets.

## 1. Put the code on GitHub
```bash
git status                       # nothing secret must be listed (.env*, *firebase-adminsdk*.json are git-ignored)
git add -A && git commit -m "Release: notifications, pricing, validation fixes"
git push origin <branch>         # the branch you will deploy
```
Never commit `.env*`, the Firebase key, or `lgd-data/`.

## 2. Create the database
Render dashboard -> **New +** -> **PostgreSQL**. Name `darhub-db`, same **region** as the web service, PostgreSQL 14+.
After it is created open it and copy from the **Connections** panel:
- **Internal Database URL** parts (host starting `dpg-...`, port, database, user, password) -> used by the web service.
- **External Database URL** -> used from your own computer to run the one-time seed (section 4).

## 3. Create the web service
New + -> **Web Service** -> connect the GitHub repo and branch (or **Blueprint** to use `render.yaml`).
- Runtime Node, Build `npm ci`, Start `npm start`, Health check path `/health`, Plan Starter or higher.
- Pre-Deploy Command: `npm run db:migrate && npm run db:seed`
- Environment variables (values you type in the dashboard; see `render.yaml` for the full list):

| Variable | Value |
|---|---|
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` (hides OTPs and error details, enables the migration check) |
| `TRUST_PROXY` | `1` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_DIALECT` | from the **Internal** database URL; `DB_DIALECT=postgres` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | two different long random strings (`openssl rand -hex 48`) |
| `ADMIN_PANEL_URL`, `CORS_ORIGINS` | the real admin panel URL / origin |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_NAME` | who gets the first admin account |
| `NOTIFICATION_PROVIDER` | `fcm` |
| `FCM_SERVICE_ACCOUNT_JSON` | `base64 -w0 your-key.json` output (never the file itself) |
| `STORAGE_PROVIDER`, `CLOUD_NAME`, `CLOUD_KEY`, `CLOUD_SECRET` | `cloudinary` + your Cloudinary values |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | your mail server (Gmail: port 587 + 16-character App Password) |
| `REDIS_URL` (optional) | Render Key Value (Redis) `rediss://` URL; shares OTP limits across instances (`docs/REDIS.md`) |

`DB_SSL` is on by default, which is what Render expects: do not set it to `false`.

## 4. One-time reference data (new database)
The pre-deploy command creates the tables and the roles/privileges. A brand-new database also needs the official
location directory (about 260,000 rows). Run it **once from your computer** against the External Database URL:
```bash
cd DarhubBackend && npm ci
export NODE_ENV=production DB_HOST=<external host> DB_PORT=5432 DB_NAME=<db> DB_USER=<user> DB_PASSWORD=<password> DB_DIALECT=postgres
npm run db:migrate && npm run db:seed          # safe to repeat; the deploy runs them too
npm run db:seed:locations                      # downloads the LGD directory and imports it (~1-2 minutes)
```
Never run `npm run db:seed:demo` in production.

## 5. First start and admin account
Deploy (or **Manual Deploy**). In **Logs** you should see: migrations applied, `Server running`, `[push:fcm]` appears on the
first push, and `Super admin account created for <SUPER_ADMIN_EMAIL>`. The setup link is e-mailed; if SMTP is not
configured it is printed in the logs. Open it, set the password, log into the admin panel.
Then in the admin panel create the master data the apps need: **crops with prices**, **working-days bands** (acre
range -> days), **drones**, and add pilots. Without crops a farmer cannot book.

## 6. Verify
```bash
curl https://<service>.onrender.com/health                    # 200 and {"status":"ok"}
```
- Log in from the Farmer app and the Pilot app (rebuild both with `darhub.api.baseUrl=https://<service>.onrender.com/`
  in their `local.properties`; release builds require HTTPS).
- Open an app, allow notifications, then as admin `POST /api/notifications/admin/send` to that user: the response should
  show `status: sent`. Check the `[push]` lines in the Render logs.
- Book as a farmer, assign work in the admin panel: the pilot phone should get "New work assigned".

## 7. After go-live
- Point an uptime monitor at `/health`.
- Alerts: failed or long-pending `NOTIFICATION_DELIVERY` rows, 5xx rate, DB connections.
- Every release: push to GitHub; Render builds, runs the pre-deploy migrations, then starts. A failed migration aborts the
  deploy and keeps the old version running.
- Backups: enable Render Postgres backups before real data arrives.

## Troubleshooting
| Symptom | Cause |
|---|---|
| Deploy fails: "migration(s) not applied" | pre-deploy did not run; run `npm run db:migrate` (section 4 commands) |
| `Database settings are missing` | `DB_HOST/DB_USER/DB_NAME` not set |
| `no pg_hba.conf entry` / SSL error | `DB_SSL` was set to false, or wrong host; remove it |
| Pushes stay `pending` | worker not running (instance asleep / `NOTIFICATION_WORKER_ENABLED=false`) |
| `messaging/third-party-auth-error` | wrong `FCM_SERVICE_ACCOUNT_JSON` (not base64 of the whole file) or key from another Firebase project |
| Uploaded photos vanish after a deploy | `STORAGE_PROVIDER` still using the local disk: set Cloudinary |
| Emails never arrive | free tier blocks SMTP, or wrong SMTP values; the setup link is in the logs |
