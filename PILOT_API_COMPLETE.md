# Pilot API Complete Documentation

**Backend:** DARHUB  
**Base URL:** `http://localhost:5678`  
**Verified:** 2026-09-06

This document covers pilot registration, profile, work execution, and maintenance APIs. It is based on the live route/controller implementation and includes curl commands used for local checks.

## 1. Authentication

Authenticated routes use:

```http
Authorization: Bearer <access_token>
```

The token is signed with `JWT_SECRET`. A missing token normally returns:

```json
{"success":false,"code":"NO_TOKEN","message":"No token provided. Unauthorized!"}
```

An invalid or expired token returns HTTP 401. Pilot-role authentication (`authenticatePilot`) additionally reloads the user and requires `user_type === 3`; however, several legacy pilot work routes currently do not apply any authentication middleware. See the route matrix below.

## 2. Route Matrix

| Method | Endpoint | Authentication | Purpose |
|---|---|---|---|
| POST | `/api/user/pilot-registration` | Optional Bearer | Create a pilot account with profile, address, bank, UPI, and documents. |
| PUT | `/api/user/pilot-edit` | Generic Bearer | Update the authenticated pilot, or an admin-authorized target user. Multipart supported. |
| GET | `/api/user/pilot/profile?tab=...` | Generic Bearer | Read `main`, `personal`, `address`, `bank`, or `documents`. |
| GET | `/api/pilot/work/orders/:pilot_user_id` | **None currently** | List orders assigned to a pilot ID. |
| POST | `/api/pilot/work/confirm-assignment` | Strict pilot Bearer | Confirm assigned dates for a booking. |
| GET | `/api/pilot/work/order-details/:booking_id` | **None currently** | Read a booking's work details. |
| POST | `/api/pilot/work/start-day` | **None currently** | Create or update a daily work log. |
| POST | `/api/pilot/work/update-work` | **None currently** | Save work quantities, notes, and times for a daily log. |
| POST | `/api/pilot/work/upload-field-image/:log_id` | Upload only | Upload a JPG/JPEG/PNG field image. |
| POST | `/api/pilot/work/end-day` | **None currently** | Close a daily work log and possibly complete the order. |
| POST | `/api/pilot/work/add-comment` | **None currently** | Add a pilot comment to a booking. |
| POST | `/api/pilot/maintenance` | Generic Bearer | Create and submit a maintenance task. |
| POST | `/api/pilot/maintenance/draft` | Generic Bearer | Save a maintenance task as a draft. |
| GET | `/api/pilot/maintenance/stats` | Generic Bearer | Get maintenance task statistics. |
| GET | `/api/pilot/maintenance` | Generic Bearer | List maintenance tasks with filters and pagination. |
| GET | `/api/pilot/maintenance/:id` | Generic Bearer | Get one maintenance task with checklist and attachments. |
| PUT | `/api/pilot/maintenance/:id` | Generic Bearer | Update a draft maintenance task. |
| PATCH | `/api/pilot/maintenance/:id/submit` | Generic Bearer | Submit a draft task. |
| DELETE | `/api/pilot/maintenance/:id` | Generic Bearer | Soft-delete a maintenance task. |
| POST | `/api/pilot/maintenance/:id/attachments` | Generic Bearer | Add maintenance attachments. |
| DELETE | `/api/pilot/maintenance/:id/attachments/:attachmentId` | Generic Bearer | Soft-delete one attachment. |

## 3. Pilot Registration

### `POST /api/user/pilot-registration`

Content type: `multipart/form-data`. Authorization is optional when an admin creates the pilot.

Required fields: `first_name`, `last_name`, `email`, `password`, `mobile_number`. At least one of `isverifyEmail` or `isMobileVerify` must be true. Mobile numbers are normalized to the last 10 digits and must validate as 10 digits. The current controller validates email with a `.com` suffix.

Optional text fields: `dob` (`DD/MM/YYYY` or ISO date), `aadhar_number`, `pan_card_number`, `upi_id`, `role`, `isverifyEmail`, `isMobileVerify`.

Structured fields can be JSON strings or individual form fields:

```text
address=[{"state":"1","district":"2","block":"3","lane1":"Road 1","lane2":"","village":"Aji","pincode":"360003","is_primary":true}]
bank_details=[{"bank_name":"SBI","acc_holder_name":"Ramesh","acc_number":"12345","ifsc_code":"SBIN0001","is_primary":true}]
```

Upload fields: `profile_image` (JPG/JPEG/PNG), `aaddhar_image`, `pan_card_image`, `dcga_pilot_cert`, `dcga_pilot_license`, `medical_certificate`, and `insurance_doc` (JPG/JPEG/PNG/PDF), plus `passbook_image` (JPG/JPEG/PNG). Each file is limited to 5 MB and each field accepts up to 5 files.

Success is HTTP 201:

```json
{"success":true,"message":"Pilot registered successfully","user_id":123,"token":"<access_token>"}
```

Common errors: 400 validation/duplicate data, 401 invalid optional creator token, and 500 registration failure.

## 4. Pilot Profile

### `GET /api/user/pilot/profile?tab={tab}`

Valid tabs: `main`, `personal`, `address`, `bank`, `documents`. Successful responses use `{ "success": true, "data": { ... } }`.

- `main`: `user_info` plus `work_summary.total_orders_assigned` and `work_summary.active_orders`.
- `personal`: names, mobile, email, DOB, Aadhar, PAN, profile image, and primary address.
- `address`: all addresses; type is `Home` for primary and `Secondary` otherwise.
- `bank`: `bank_accounts` and `upi_details`.
- `documents`: active documents with ID, type ID/name, original filename, URL, and upload time.

Missing `tab` or an unknown tab returns 400. A missing user returns 404.

### `PUT /api/user/pilot-edit`

Content type: `multipart/form-data`; generic Bearer required. Updates the logged-in user by default. `user_id` may target another user only when the caller is a superuser/admin. Supported profile fields include `first_name`, `last_name`, `dob`, `password`, `username`, `email`, `mobile_number`, `aadhar_number`, `pan_card_number`, `upi_id`, address data, bank data, and the same document upload fields as registration. Address and bank data replace the existing sets when supplied.

## 5. Pilot Work

### `GET /api/pilot/work/orders/:pilot_user_id`

Returns `{ success, orders }`. An unassigned pilot returns HTTP 200 with an empty `orders` array. Order items include booking ID, dates, duration, crop, acreage, price, status, payment flag, address, log counts, and drone ID.

### `POST /api/pilot/work/confirm-assignment`

Strict pilot authentication is applied. JSON body:

```json
{"booking_id":123,"accepted_dates":["2026-09-07","2026-09-08"]}
```

The handler verifies the assignment and updates date confirmations/order status. It returns 200 on success; 400 for invalid input, 401/403 for auth or assignment access, 404 for missing booking, and 500 for server errors.

### `POST /api/pilot/work/start-day`

JSON body:

```json
{"booking_id":123,"pilot_user_id":45,"co_pilot_user_id":46,"drone_id":7,"working_date":"2026-09-07"}
```

`booking_id`, `pilot_user_id`, and `working_date` are required. Returns 201 for a new daily log or 200 when an existing date is updated. Missing order returns 404.

### `POST /api/pilot/work/update-work`

JSON body:

```json
{"booking_id":123,"working_date":"2026-09-07","completed_acres":8.5,"fertilizer_used":"20 kg","pesticide_used":"2 L","water_used":"100 L","notes":"North field completed","start_time":"08:00","end_time":"12:30"}
```

`booking_id` and `working_date` are required. A daily log must already exist. Missing order or daily log returns 404.

### `POST /api/pilot/work/upload-field-image/:log_id`

Content type: `multipart/form-data`; field name `land_image`; JPG/JPEG/PNG only. The upload middleware stores the file in `uploads/`.

### `POST /api/pilot/work/end-day`

Uses the same core body as `update-work` and records completed-day data. Depending on all daily logs, it may transition the order to completed.

### `POST /api/pilot/work/add-comment`

JSON body:

```json
{"booking_id":123,"pilot_user_id":45,"comment":"Weather delay at north field","comment_type":"work_update","working_date":"2026-09-07"}
```

`booking_id`, `pilot_user_id`, and `comment` are required. Returns 201 with the created comment.

## 6. Pilot Maintenance

Maintenance routes use generic Bearer authentication and scope records through the authenticated user in the controller.

### Create or save a task

`POST /api/pilot/maintenance` submits immediately. `POST /api/pilot/maintenance/draft` saves `form_status=draft`. JSON or multipart is accepted. `drone_id` is required.

Example JSON:

```json
{
  "drone_id":7,
  "maintenance_type":"Scheduled Maintenance",
  "task_name":"Routine Inspection",
  "scheduled_date":"2026-09-07",
  "actual_date":"2026-09-07",
  "engineer_id":12,
  "drone_status":"Active",
  "total_flight_time":"42:30",
  "total_flights":120,
  "overall_status":"Good",
  "engineer_notes":"No issues found",
  "checklist":[{"component":"Propellers","expected_status":"Good","actual_status":"Good","remarks":"No cracks"}]
}
```

If no checklist is supplied, the controller creates its default eight-component checklist. Status scores are `Good/Updated=100`, `Wear & Tear=70`, `Damaged=30`, and `Needs Replacement=0`; the average becomes `health_score`. `drone_id` or `engineer_id` that does not exist returns 404.

Multipart attachments use dynamic fields such as `attachments_0`, `attachments_1`, or `attachments`; the controller associates component files when a complaint is raised. Cloudinary configuration must be available for attachment uploads.

### Other maintenance routes

- `GET /api/pilot/maintenance/stats` returns totals, draft/submitted counts, status counts, and average health score.
- `GET /api/pilot/maintenance` accepts `search`, `form_status`, `overall_status`, `maintenance_type`, `page`, and `limit` query parameters and returns paginated tasks.
- `GET /api/pilot/maintenance/:id` returns the task with checklist, attachments, pilot, and engineer associations.
- `PUT /api/pilot/maintenance/:id` updates a draft; submitted tasks cannot be edited.
- `PATCH /api/pilot/maintenance/:id/submit` submits a draft; `overall_status` is required.
- `DELETE /api/pilot/maintenance/:id` soft-deletes the task, checklist, and attachments.
- `POST /api/pilot/maintenance/:id/attachments` adds multipart attachments and returns 201.
- `DELETE /api/pilot/maintenance/:id/attachments/:attachmentId` soft-deletes one attachment.

## 7. Curl Cookbook

Set the base URL and token in PowerShell:

```powershell
$BASE="http://localhost:5678"
$TOKEN="<access_token>"

# Health
curl.exe -i "$BASE/"

# Login
curl.exe -i -X POST "$BASE/api/login" -H "Content-Type: application/json" -d '{"identifier":"pilot@example.com","password":"your-password"}'

# Profile
curl.exe -i "$BASE/api/user/pilot/profile?tab=main" -H "Authorization: Bearer $TOKEN"
curl.exe -i "$BASE/api/user/pilot/profile?tab=personal" -H "Authorization: Bearer $TOKEN"
curl.exe -i "$BASE/api/user/pilot/profile?tab=address" -H "Authorization: Bearer $TOKEN"
curl.exe -i "$BASE/api/user/pilot/profile?tab=bank" -H "Authorization: Bearer $TOKEN"
curl.exe -i "$BASE/api/user/pilot/profile?tab=documents" -H "Authorization: Bearer $TOKEN"

# Work
curl.exe -i "$BASE/api/pilot/work/orders/45"
curl.exe -i -X POST "$BASE/api/pilot/work/confirm-assignment" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"booking_id":123,"accepted_dates":["2026-09-07"]}'
curl.exe -i -X POST "$BASE/api/pilot/work/start-day" -H "Content-Type: application/json" -d '{"booking_id":123,"pilot_user_id":45,"working_date":"2026-09-07"}'
curl.exe -i -X POST "$BASE/api/pilot/work/update-work" -H "Content-Type: application/json" -d '{"booking_id":123,"working_date":"2026-09-07","completed_acres":8.5,"notes":"Completed"}'
curl.exe -i -X POST "$BASE/api/pilot/work/upload-field-image/789" -F "land_image=@C:\path\field.jpg"
curl.exe -i -X POST "$BASE/api/pilot/work/end-day" -H "Content-Type: application/json" -d '{"booking_id":123,"working_date":"2026-09-07","completed_acres":8.5}'
curl.exe -i -X POST "$BASE/api/pilot/work/add-comment" -H "Content-Type: application/json" -d '{"booking_id":123,"pilot_user_id":45,"comment":"Completed"}'

# Maintenance
curl.exe -i "$BASE/api/pilot/maintenance/stats" -H "Authorization: Bearer $TOKEN"
curl.exe -i "$BASE/api/pilot/maintenance?page=1&limit=10" -H "Authorization: Bearer $TOKEN"
curl.exe -i -X POST "$BASE/api/pilot/maintenance/draft" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"drone_id":7,"task_name":"Routine Inspection","overall_status":"Good"}'
curl.exe -i -X POST "$BASE/api/pilot/maintenance" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"drone_id":7,"maintenance_type":"Scheduled Maintenance","overall_status":"Good"}'
curl.exe -i -X GET "$BASE/api/pilot/maintenance/10" -H "Authorization: Bearer $TOKEN"
curl.exe -i -X PUT "$BASE/api/pilot/maintenance/10" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"task_name":"Updated inspection"}'
curl.exe -i -X PATCH "$BASE/api/pilot/maintenance/10/submit" -H "Authorization: Bearer $TOKEN"
curl.exe -i -X DELETE "$BASE/api/pilot/maintenance/10" -H "Authorization: Bearer $TOKEN"
curl.exe -i -X POST "$BASE/api/pilot/maintenance/10/attachments" -H "Authorization: Bearer $TOKEN" -F "attachments=@C:\path\photo.jpg"
curl.exe -i -X DELETE "$BASE/api/pilot/maintenance/10/attachments/20" -H "Authorization: Bearer $TOKEN"
```

## 8. Local Curl Verification

Checks run against `http://localhost:5678` after the server finished booting:

| Check | Result |
|---|---|
| `GET /` | HTTP 200, `Welcome to DARHUB Backend` |
| `GET /api/user/pilot/profile?tab=main` without token | HTTP 401, `code: NO_TOKEN` |
| `GET /api/pilot/maintenance/stats` without token | HTTP 401, `code: NO_TOKEN` |
| `POST /api/pilot/work/confirm-assignment` without token | HTTP 401, `No token provided. Unauthorized.` |
| `GET /api/pilot/work/orders/999999` | HTTP 200, empty `orders` array |
| Invalid pilot registration | HTTP 400, `Mobile number must be exactly 10 digits` |

The work routes returning 200 without authentication are an implementation/security gap and should be reviewed before production exposure.
