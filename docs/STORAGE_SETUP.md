# File storage setup sheet (photos & documents → S3)

The backend stores every photo/document through **one switch**: `STORAGE_PROVIDER`.

| Where | `STORAGE_PROVIDER` | Backend talks to |
|---|---|---|
| Today / fallback | `cloudinary` (default) | Cloudinary |
| Local dev | `s3` + `S3_ENDPOINT` | **Floci** (free AWS emulator, port 4566) |
| Production | `s3`, no `S3_ENDPOINT` | **Real AWS S3** |

> Floci is an *emulator*. It is for development and tests only. **Production uses real AWS S3 with the same code**;
> only the environment variables change. Never point production at Floci.

## 1. What the backend already had / what was added

| Area | Before | Now |
|---|---|---|
| Upload helper `middleware/upload.js` | Cloudinary only | `uploadToCloudinary()` routes to S3 when `STORAGE_PROVIDER=s3` (same `{public_id, secure_url}` result, so DB columns and controllers are unchanged); new `destroyUpload()` |
| S3 client | none | `services/storage.service.js` (put, delete, signed URL, ensure bucket, content sniffing) |
| Pilot daily-log field photo (`/upload-field-image`) | saved on local disk `uploads/` (lost on every redeploy on Render) | stored via the provider |
| Admin `update-work` photo | **bug**: read `file.filename`, which memory storage never sets, so the URL was `/uploads/undefined` | uploads via the provider |
| Deleting crop/fertilizer/vendor/pilot files | Cloudinary calls spread over 4 files | `destroyUpload()` |
| Farmer profile photo URL check | only `res.cloudinary.com` | also accepts our own bucket URL |
| Bucket bootstrap | none | `npm run storage:init`, `docker-compose.floci.yml` |

Folders (object key prefixes): `farmers/`, `pilots/` (Aadhaar, PAN, licence, passbook), `crops/`, `fertilizers/`,
`vendors/…`, `pilot-maintenance/`, `field-images/`. Keys are `<folder>/<uuid>.<ext>`; the extension and `Content-Type`
come from the file's real bytes (JPG/PNG/WEBP/PDF only), not from the client's claim.

**Not changed:** existing rows still hold Cloudinary URLs and keep working. Only new uploads go to S3.
Old `/uploads/<file>` local files are still served by `app.js`.

## 2. Local development with Floci

```bash
# 1. start Floci (data kept in ./.floci-data)
docker compose -f docker-compose.floci.yml up -d

# 2. .env
STORAGE_PROVIDER=s3
S3_BUCKET=darhub-uploads
S3_REGION=ap-south-1
S3_ENDPOINT=http://localhost:4566
S3_ACCESS_KEY_ID=test
S3_SECRET_ACCESS_KEY=test

# 3. create the bucket + CORS and verify upload / public read / delete
npm run storage:init
```

Expected: `bucket darhub-uploads: created`, `upload ok -> …(public GET: HTTP 200)`.

Testing from a **phone or Android emulator**: `localhost` is the device itself. Set
`S3_PUBLIC_BASE_URL=http://<your-LAN-IP>:4566/darhub-uploads` (Android emulator: `http://10.0.2.2:4566/darhub-uploads`),
otherwise saved image URLs will not open in the app.

Handy: `aws --endpoint-url http://localhost:4566 s3 ls s3://darhub-uploads --recursive` (any dummy keys),
`docker logs -f darhub-floci`, `docker compose -f docker-compose.floci.yml down` (delete `.floci-data` to wipe the files).

## 3. Production on real AWS S3 (checklist)

**A. Bucket**
1. S3 → Create bucket `darhub-prod-uploads` in `ap-south-1` (Mumbai: closest to farmers).
2. Object Ownership: *Bucket owner enforced*. Versioning: **on**. Default encryption: SSE-S3.
3. Lifecycle rule: delete noncurrent versions after 30 days (keeps cost down).

**B. Public access: pick one**
- **Recommended: CloudFront + private bucket.** Keep *Block all public access* **on**; create a CloudFront
  distribution with Origin Access Control; set `S3_PUBLIC_BASE_URL=https://cdn.yourdomain.com`.
  Gives HTTPS, caching, a custom domain, and the bucket is never exposed.
- **Quick start:** turn off Block Public Access and allow `GetObject` on the public prefixes only:
  ```json
  { "Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":"*","Action":"s3:GetObject",
    "Resource":["arn:aws:s3:::darhub-prod-uploads/crops/*","arn:aws:s3:::darhub-prod-uploads/fertilizers/*",
                "arn:aws:s3:::darhub-prod-uploads/farmers/*","arn:aws:s3:::darhub-prod-uploads/field-images/*"]}]}
  ```
  Do **not** make `pilots/` or `vendors/` public (see section 5).

**C. CORS** (only if browsers, e.g. the admin panel, load images directly): allow `GET, HEAD` from
`https://<admin-domain>`.

**D. IAM** (least privilege). Create a policy and attach it to the server's role, or to a dedicated IAM user if the host
cannot use roles:
```json
{ "Version":"2012-10-17","Statement":[
  {"Effect":"Allow","Action":["s3:PutObject","s3:GetObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::darhub-prod-uploads/*"},
  {"Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::darhub-prod-uploads"}]}
```
On EC2/ECS/Lambda use the role and leave the key variables empty. On Render (no AWS role) create an IAM user with
only this policy and put its keys in the Render environment, never in git.

**E. Production environment variables**
```
STORAGE_PROVIDER=s3
S3_BUCKET=darhub-prod-uploads
S3_REGION=ap-south-1
S3_PUBLIC_BASE_URL=https://cdn.yourdomain.com     # or https://darhub-prod-uploads.s3.ap-south-1.amazonaws.com
S3_ACCESS_KEY_ID=…        # empty when using an IAM role
S3_SECRET_ACCESS_KEY=…
# S3_ENDPOINT must NOT be set
```

**F. Verify:** run `npm run storage:init` with the production variables (it only writes/reads/deletes one test file;
it does not create the bucket). Then register a test farmer with a photo and open the returned URL.

## 4. Go-live checklist

- [ ] Floci flow tested locally (farmer photo, pilot documents, crop/fertilizer image, field photo, maintenance attachments)
- [ ] Bucket, IAM policy, CloudFront (or public prefixes policy) created
- [ ] Production env vars set; `S3_ENDPOINT` absent
- [ ] `npm run storage:init` passes against production
- [ ] AWS Budget alert set (e.g. ₹500/month) and S3 access logging or CloudTrail data events on
- [ ] Mobile apps: images load over HTTPS (CloudFront), not plain `http://`
- [ ] Decision made on migrating old Cloudinary files (section 6)

## 5. Known gap: identity documents

Pilot Aadhaar, PAN, licence and passbook scans and vendor KYC are personal data. They currently get a plain URL like
every other image (same as with Cloudinary today). With CloudFront-private or the prefix-limited policy above they are
not browsable by listing, but anyone with the URL can open them. `signedUrl(key, seconds)` already exists in
`services/storage.service.js` for the follow-up: make `pilots/` and `vendors/` private and return short-lived signed
links from the admin endpoints that display them. Not done yet because it changes API responses the apps and admin
panel consume.

## 6. Moving existing Cloudinary files (optional, not done)

Old rows keep working as long as the Cloudinary account stays alive. To retire Cloudinary: write a one-off script that
downloads each `*_url` from the tables (`MasterCrop`, `Fertilizer`, `UserProfile`, `UserDocuments`, `UserBankDetails`,
`Vendor*`, `PilotMaintenanceAttachment`, `SprayingDailyLogs`), uploads with `putFile`, and updates the url/new_name
columns. Ask if you want it.

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `connect ECONNREFUSED :4566` | Floci not running: `docker compose -f docker-compose.floci.yml up -d` |
| `NoSuchBucket` | run `npm run storage:init` (Floci) / create the bucket (AWS) |
| `AccessDenied` on AWS | IAM policy resource/ARN mismatch, or wrong region |
| Image URL opens on laptop, not on phone | set `S3_PUBLIC_BASE_URL` to the LAN IP |
| Image URL returns 403 on AWS | bucket private and no CloudFront / public-prefix policy |
| `Unsupported file content` (400) | file is not a real JPG/PNG/WEBP/PDF |
| Farmer `profile_image must be a photo uploaded through the app` | the URL's base differs from `S3_PUBLIC_BASE_URL`; keep it identical to what uploads return |
