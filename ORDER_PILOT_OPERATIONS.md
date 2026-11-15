# Farmer → Booking → Drone/Pilot → Accept → Start Day: Operations Guide

Complete flow as implemented after the order-flow fixes. Every call below was exercised end to end
(58 automated checks against the dev DB, all passing).

```bash
BASE=http://localhost:5678
```

## Conventions

- **Dates** are calendar dates sent as `YYYY-MM-DD` and stored as UTC midnight. "Today" is always the
  **India date** (Asia/Kolkata), independent of the server timezone. Helpers: [utils/dateUtils.js](utils/dateUtils.js).
- **Day lifecycle** (per working day): `scheduled → confirmed → started → completed`.
  `started` / `completed` are kept in `SPRAYING_DAILY_LOGS.verification_comment` (JSON, `day_status`).
- **Order status lifecycle**

| Step | Order status | Farmer app tab |
|---|---|---|
| Booking created | `ORDER_PLACED` | PENDING |
| OTP verified (or logged-in farmer booking, no OTP) | `WAITING_FOR_CONFIRMATION` | PENDING |
| Pilot accepts | `ORDER_ACCEPTED` | UPCOMING |
| Pilot starts a day | `JOB_STARTED` | ONGOING |
| Pilot ends a day (more days left) | `JOB_ENDED` | ONGOING |
| Pilot ends the last day | `ORDER_COMPLETED` | COMPLETED |
| Farmer cancels | `ORDER_CANCELLED` | CANCELLED |

## 1. Register a farmer
`POST /api/user/farmer-registration` (multipart)
```bash
curl -X POST $BASE/api/user/farmer-registration \
  -F first_name=Fresh -F last_name=Farmer -F email=farmer@example.com -F password='Farmer@123' \
  -F mobile_number=9000020041 -F dob=1985-05-05 -F isverifyEmail=true -F isMobileVerify=true
```
→ `{ success, user_id, token }`

## 2. Register a pilot
`POST /api/user/pilot-registration` (multipart). Creates a `user_type = 2` user.
```bash
curl -X POST $BASE/api/user/pilot-registration \
  -F first_name=Fresh -F last_name=Pilot -F email=pilot@example.com -F password='Pilot@123' \
  -F mobile_number=9000030041 -F dob=1990-01-01 -F aadhar_number=123456789077 \
  -F isverifyEmail=true -F isMobileVerify=true \
  -F 'address=[{"state":"7","district":"16","block":"83","lane1":"Pilot Street 1","village":"Aji","pincode":"440016","is_primary":true}]' \
  -F 'bank_details=[{"bank_name":"SBI","acc_holder_name":"Fresh Pilot","acc_number":"123456789077","ifsc_code":"SBIN0001","is_primary":true}]'
```
→ `{ success, user_id, token }`

## 3. Create a drone and attach the pilot
`POST /admin/drones` (JSON). The drone carries its crew (`pilot_user_id`, `co_pilot_user_id`);
`assign-work` reads them from here. Default capacity is 5 acres/day.
```bash
curl -X POST $BASE/admin/drones -H "Content-Type: application/json" \
  -d '{"model":"DJI Agras T40","name":"Fresh Pilot Drone","range":5,"speed":10,"weight":40,"pilot_user_id":204,"owner_id":204}'
```
→ `{ success, droneId }`. Attach a pilot to an existing drone: `PUT /admin/update-drone/:id` (Bearer token).

## 4. Reference data (for the booking form)
```bash
curl $BASE/order/crops/list              # crop ids and price_per_acre
curl $BASE/api/locations/states          # numeric state ids
curl $BASE/api/locations/districts/7     # numeric district ids
curl $BASE/api/locations/blocks/16       # numeric block ids
```

## 5. Farmer creates the booking
`POST /order/create-order`
```bash
curl -X POST $BASE/order/create-order -H "Authorization: Bearer <FARMER_TOKEN>" -H "Content-Type: application/json" \
  -d '{"start_date":"2026-10-04","crop_type_id":5,"land_in_acers":10,"user_id":203,
       "address":{"state":"7","district":"16","block":"83","lane1":"Main Road","lane2":"Near Temple","village":"Wagholi","pincode":"440016"}}'
```
→ `201 { booking_id, order_status, otp_required, dev_otp? }`

**OTP:** a farmer who is logged in and books for themselves (Bearer token whose user id equals `user_id`) needs **no OTP**:
the order is confirmed immediately (`order_status: WAITING_FOR_CONFIRMATION`, `otp_required: false`, no `dev_otp`).
Without a token, or with a token of someone else (for example an admin creating the order on a farmer's behalf), the order stays
`ORDER_PLACED` with `otp_required: true` (and `dev_otp` when `NODE_ENV != production`) until step 6. An invalid or expired token
returns `401`.

Server-side rules: `start_date` must be a valid date, not before today (IST); `land_in_acers > 0`;
`crop_type_id` must exist; `num_of_days` comes from the working-days rule (fallback `ceil(acres / 5)`);
`end_date = start_date + num_of_days - 1`; `price`/`total_price` are calculated from the crop rate when not sent.
`address` takes numeric `state` / `district` / `block` ids, `village`, `address1` (or `lane1`) and optionally `pincode`.

## 6. Verify the booking OTP (only when `otp_required` is true)
`POST /order/verify-otp` → `WAITING_FOR_CONFIRMATION`. Calling it for an order that is already confirmed returns
`200 { "message": "Order already confirmed" }`.
```bash
curl -X POST $BASE/order/verify-otp -H "Content-Type: application/json" -d '{"booking_id":"<BOOKING_ID>","otp":"<OTP>"}'
```

## 7. Admin assigns drone (and so pilot) to the working dates
`POST /order/assign-work/:booking_id`. `pilot` / `copilot` are optional (taken from the drone).
```bash
curl -X POST $BASE/order/assign-work/<BOOKING_ID> -H "Content-Type: application/json" \
  -d '{"drone_id":48,"working_date":["2026-10-04","2026-10-05"]}'
```
→ `200 { result:[{date,action}], pilot_user_id, co_pilot_user_id, drone_id, start_date, end_date, num_of_days }`

Rules enforced:
- invalid dates → 400; past dates → 400 (dates already on the booking are allowed);
- the drone **or** its pilot already booked on any of those dates for another booking → **409** with `conflicts[]`;
- closed bookings (cancelled/rejected/completed/paid) → 409;
- a different pilot on an existing day resets that day's confirmation; same pilot keeps it;
- days already `started`/`completed` are locked;
- order `start_date` / `end_date` / `num_of_days` are recomputed from **all** scheduled days;
- an already accepted order goes back to `WAITING_FOR_CONFIRMATION` when new/changed days need confirmation.

Related: `POST /order/calendar-availability`, `POST /order/drone-availability`,
`PATCH /order/daily-log/:log_id/drone` (same conflict + lock rules), `DELETE /order/daily-log/:log_id`,
`POST /order/updateOrder` (now keeps the pilot's confirmations and the address lane/pincode).

## 8. Pilot logs in
```bash
curl -X POST $BASE/api/login -H "Content-Type: application/json" -d '{"identifier":"pilot@example.com","password":"Pilot@123"}'
```

## 9. Pilot: assigned bookings ("requests" and "orders")
**Every pilot endpoint needs the pilot's login token** (`Authorization: Bearer <access token>`). The pilot is always the
token's user: no endpoint trusts a pilot id from the URL or body, and each one checks the work belongs to that pilot
(`401` no/invalid token, `403` not your work, `404` not assigned to you).

`GET /api/pilot/work/assignments` (optional filters `?request_status=` `&mission_state=`) returns every booking assigned
to the logged-in pilot:
```bash
curl $BASE/api/pilot/work/assignments -H "Authorization: Bearer <PILOT_TOKEN>"
```
Each item:

| Field | Meaning |
|---|---|
| `request_status` | what the pilot has answered: `PENDING` (new request), `ACCEPTED`, `DECLINED`, `CANCELLED` (booking cancelled) |
| `mission_state` | as soon as the pilot has accepted at least one day: `UPCOMING`, `ACTIVE` (a day is running), `PENDING_VERIFICATION` (all days finished, admin has not verified), `COMPLETED`, `CANCELLED`. It is independent of `request_status`: when the admin adds a day to an accepted booking the item is `PENDING` **and** `UPCOMING`/`ACTIVE`, so the pilot can still start and end the days already accepted while answering the new one |
| `crop_name`, `land_in_acers`, `total_price`, `is_paid` | the job |
| `start_date`, `end_date`, `num_of_days` | the pilot's days |
| `farmer.name`, `farmer.phone` | the phone is only shared after the pilot accepts |
| `address` | `lane_1`, `village`, `pincode`, names of state/district/block, and `full` |
| `drone`, `co_pilot` | assigned equipment/crew |
| `decline_reason` | why the pilot declined (when `DECLINED`) |
| `counts` | days by state: `pending`, `confirmed`, `started`, `completed`, `declined` |
| `days[]` | `log_id`, `date`, `day_status` (`scheduled`/`confirmed`/`started`/`completed`/`declined`), `is_today`, `can_start` (confirmed, due today or earlier, and the order status allows starting), `can_end`, `acres_completed`, `started_at`, `ended_at`, `decline_reason` |

`GET /api/pilot/work/assignments/:booking_id` is the same plus, per day, `work_details` (acres, fertilizer, pesticide,
water, notes), `land_image_url`, and the order `timeline`.

### Errors

Every error answers with the same JSON body: `{ "success": false, "message": "...", "error": "<same text>", "code": "...", "request_id": "..." }`
(`code` and `request_id` when available; quote the `request_id` when reporting a problem, it is also the `X-Request-Id` header).

| Status | Meaning for the app |
|---|---|
| `401` | `NO_TOKEN` / `INVALID_TOKEN` / `TOKEN_EXPIRED` / `USER_NOT_FOUND`: refresh the token or sign in again. A database or server failure is **never** a 401 |
| `403` | not a pilot, or the work belongs to someone else |
| `409` | the action is not allowed in the current state (e.g. day not accepted yet, order closed) |
| `429` | `RATE_LIMITED`: too many requests (counted per signed-in user; sign-in/OTP routes per IP); honour `Retry-After` |
| `503` | `DATABASE_UNAVAILABLE`: temporary, retry shortly |
| `5xx` | server fault; the message is generic in production |

## 10. Pilot accepts or declines
```bash
# accept every open day
curl -X POST $BASE/api/pilot/work/confirm-assignment -H "Authorization: Bearer <PILOT_TOKEN>" -H "Content-Type: application/json" \
  -d '{"booking_id":"<BOOKING_ID>","accept_all":true}'
# or only some days:   -d '{"booking_id":"<BOOKING_ID>","accepted_dates":["2026-10-04","2026-10-05"]}'

# decline, a reason (3-500 characters) is required; "dates" is optional (default: every day that has not started)
curl -X POST $BASE/api/pilot/work/reject-assignment -H "Authorization: Bearer <PILOT_TOKEN>" -H "Content-Type: application/json" \
  -d '{"booking_id":"<BOOKING_ID>","reason":"Drone under maintenance"}'
```
- **Accept:** the accepted days become `confirmed`; the order goes `WAITING_FOR_CONFIRMATION -> ORDER_ACCEPTED`. A day the
  pilot declined earlier can be accepted again.
- **Decline:** the days become `declined` with the reason; if nothing is left accepted the order goes back to
  `WAITING_FOR_CONFIRMATION` ("Pilot declined: <reason>" in the timeline) and the reason is added as an order comment
  (`comment_type: pilot_declined`) for the admin. The farmer sees "searching for pilot". Days that already started or
  finished cannot be declined (`409`); a cancelled booking cannot be declined (`409`).
- **Re-assigning:** when the admin runs `assign-work` again for a declined day (same or another pilot) it becomes a fresh
  request (`scheduled`, decline marks cleared).

## 11. Pilot starts a day
`POST /api/pilot/work/start-day` with `{ "booking_id", "working_date": "YYYY-MM-DD" }` and the pilot's token.
```bash
curl -X POST $BASE/api/pilot/work/start-day -H "Authorization: Bearer <PILOT_TOKEN>" -H "Content-Type: application/json" \
  -d '{"booking_id":"<BOOKING_ID>","working_date":"2026-10-04"}'
```
→ `201 { day_status:"started", order_status:"JOB_STARTED", day_number }`; again -> `200 { isNew:false }`.
A `pilot_user_id` in the body is not needed; if sent and different from the token's user the call is refused (`403`).
Refused with: 404 day not scheduled; 403 day belongs to another pilot; **409** day not accepted yet, date in the future,
day already completed, or order not in an accepted/running state; 400 bad date.

## 12. During and at the end of the day (token required)
```bash
# progress (day must be started). Only the fields you send are changed; earlier values are kept.
curl -X POST $BASE/api/pilot/work/update-work -H "Authorization: Bearer <PILOT_TOKEN>" -H "Content-Type: application/json" \
  -d '{"booking_id":"<BOOKING_ID>","working_date":"2026-10-04","completed_acres":3,"water_used":40,"notes":"wind"}'

curl -X POST $BASE/api/pilot/work/upload-field-image/<LOG_ID> -H "Authorization: Bearer <PILOT_TOKEN>" -F land_image=@field.jpg   # JPG/PNG, max 5 MB

curl -X POST $BASE/api/pilot/work/add-comment -H "Authorization: Bearer <PILOT_TOKEN>" -H "Content-Type: application/json" \
  -d '{"booking_id":"<BOOKING_ID>","comment":"Wind picked up","comment_type":"issue","working_date":"2026-10-04"}'

# end the day (keeps everything saved earlier). Last day -> ORDER_COMPLETED, otherwise JOB_ENDED
curl -X POST $BASE/api/pilot/work/end-day -H "Authorization: Bearer <PILOT_TOKEN>" -H "Content-Type: application/json" \
  -d '{"booking_id":"<BOOKING_ID>","working_date":"2026-10-04","completed_acres":5}'
```
Each of these checks that the day/booking is the logged-in pilot's (`403` otherwise). The 23:59 IST cron closes days that
were **started** but not ended; days never started are left untouched. The older `GET /orders/:pilot_user_id` and
`GET /order-details/:booking_id` still exist but are restricted the same way.

## 13. What the farmer sees
| Call | Purpose |
|---|---|
| `GET /api/farmer/bookings?status=PENDING\|UPCOMING\|ONGOING\|COMPLETED\|CANCELLED` | list cards (dates, `num_of_days`, `progress`, pilot, drone, price) |
| `GET /api/farmer/bookings/:booking_id` | full detail |
| `POST /api/farmer/bookings/:booking_id/cancel` | cancel; releases the drone/pilot for those days |
| `PATCH /api/farmer/bookings/:booking_id/reschedule` `{ "new_date" }` | move a not-yet-started booking |

Detail now includes: `status` / `order_status`, `date_range`, `num_of_days`, `progress`
(`total_days`, `completed_days`, `in_progress_days`, `percentage`), **`schedule[]`**
(per day: `date`, `status` = scheduled/confirmed/started/completed, `status_label`, `pilot_confirmed`, `drone_name`,
`acres_completed`), `pilot` (name, phone, drone, **`co_pilot`**) once the pilot has accepted,
`pilot_assignment_status` / `drone_assignment_status` text while PENDING ("Pilot assigned - awaiting pilot confirmation"),
`usage` and `daily_work_logs` while ONGOING and when COMPLETED, `payment`, `service`, `timeline`, `address` (with names).

Reschedule: allowed before any day has started; keeps the same number of days, clears the admin assignment and
puts the booking back to `WAITING_FOR_CONFIRMATION` so the admin re-assigns.

## Remaining notes
- All pilot endpoints now require the pilot's token. `assign-work`, `/admin/drones` and `verify-otp` are still
  unauthenticated (the admin panel would have to send its token first).
- Days a pilot never starts stay `confirmed` forever; the order stays open until the admin removes/reassigns that day.
