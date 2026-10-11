# Production checklist

What must be true before real users use the system, and the one-time steps this release needs.

## 1. Deploy together
This release closes the open API: orders, users, inventory, crops, vendors, fertilizers, warehouses, working days and
location management now require a login. **Deploy the backend and the admin panel (DarhubAdmin) at the same time**: the
new admin panel attaches its token to every request; an old panel would get `401` everywhere.
Farmer and Pilot apps need no change to keep working, except the items in section 4.

## 2. Environment variables (Render / server)
| Variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | **OTPs are returned in API responses whenever this is `development`**; production hides them, hides internal error details, disables Swagger and skips `sync({alter})` on boot |
| `TRUST_PROXY` | `1` | per-user/IP rate limits behind Render's proxy |
| `ADMIN_PANEL_URL` | the real admin URL | links in invitation / reset emails (must not be `localhost`) |
| `SMTP_*` | see `.env.example` | Gmail needs a 16-character App Password |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | long random values, different from each other | token signing |
| `CORS_ORIGINS` | extra browser origins, comma separated | optional |
| `REDIS_URL` | managed Redis URL (`rediss://` with TLS) | OTP resend cooldowns and limits shared by all instances; see `docs/REDIS.md` |

## 3. Database (one time)
```bash
npm run audit:data            # read-only report of inconsistent rows (use --details for ids)
npm run db:integrity          # dry run: lists duplicates that block the unique indexes
npm run db:integrity -- --apply   # adds unique indexes, foreign keys (NOT VALID) and checks, in one transaction
```
Clean the duplicates first (the same email/mobile on two accounts, a pilot or drone booked twice on a date, several
assignee rows for one booking). Nothing is deleted automatically. Then `VALIDATE` the constraints (see the bottom of
`migrations/001_data_integrity.sql`). Take a backup before applying.

## 4. Decisions still open (need the client)
1. **SMS gateway.** None is connected. In production a farmer who gives an e-mail verifies by e-mail only (the Farmer
   app hides the mobile code box). The e-mail is optional for farmers, but a farmer **without** an e-mail can only
   register once a gateway (MSG91, Twilio, ...) is integrated in `services/sms.service.js`; until then the app tells
   them to sign up with an e-mail address.
2. **Email delivery on Render.** Render's free tier blocks outbound SMTP (ports 25/465/587). Use a paid instance or an
   email-API provider; the backend reports `EMAIL_CONNECTION_FAILED` with this hint when it cannot reach the mail server.
3. **Changing e-mail in the apps.** A user must now verify the *new* e-mail with an OTP before changing it
   (`/api/otp/send-otp` with `purpose: "email_change"`, then `/api/otp/verify-otp`). The apps have no such step yet.
4. **File storage.** Pilot field photos are saved to the server's `uploads/` folder, which is wiped on every Render
   deploy. Move them to Cloudinary (already used for profile photos).
5. **Coupons** are not implemented (orders used to carry a made-up coupon id).

## 5. Monitoring
- `GET /health` returns 200 only when the database answers: point the uptime monitor at it.
- Every error response carries `request_id` (also the `X-Request-Id` header); the same id is in the logs.
- `npm test` (unit) and `npm run test:integration` (access-control matrix against the real app) before each release.
