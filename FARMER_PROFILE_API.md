# Farmer Profile API Documentation

This document outlines the exact request and response structures for the new `GET /api/farmer/profile` endpoint, enabling the mobile UI to integrate with it seamlessly and efficiently.

All requests require the Farmer's JWT token in the `Authorization: Bearer <token>` header.

---

## 1. Main Profile Screen
Used for the home tab of the profile section to show a quick summary.

**Request**
```http
GET /api/farmer/profile?tab=main
Authorization: Bearer <token>
```

**Response**
```json
{
  "success": true,
  "data": {
    "user_info": {
      "name": "Ramesh Yadav",
      "verified": true,
      "mobile_number": "9876543210",
      "email": "ramesh@example.com",
      "member_since": "2024-03-12T10:00:00.000Z",
      "account_type": "Farmer",
      "profile_image": "https://url-to-image.com/profile.jpg",
      "location": "Gondal, Rajkot"
    },
    "farm_summary": {
      "total_acres": "35.6",
      "active_crops": 4,
      "total_fields": 4,
      "upcoming_bookings": 2
    }
  }
}
```

---

## 2. Personal Information Screen
Used for viewing and editing personal details.

**Request**
```http
GET /api/farmer/profile?tab=personal
Authorization: Bearer <token>
```

**Response**
```json
{
  "success": true,
  "data": {
    "personal_info": {
      "first_name": "Ramesh",
      "last_name": "Yadav",
      "mobile_number": "9876543210",
      "email": "ramesh@example.com",
      "dob": "1990-05-12T00:00:00.000Z",
      "profile_image": "https://url-to-image.com/profile.jpg",
      "gender": "Male",
      "marital_status": "Married",
      "education": "Graduate",
      "occupation": "Farmer"
    },
    "address_details": {
      "lane_1": "Main Road",
      "lane_2": "",
      "state": 1,
      "district": 5,
      "block": 12,
      "village": "Gondal",
      "pincode": "360311"
    }
  }
}
```

---

## 3. Farm Information Screen
Used for the farm details page. Since the backend maps non-primary addresses to farms, it returns an array of farms.

**Request**
```http
GET /api/farmer/profile?tab=farm
Authorization: Bearer <token>
```

**Response**
```json
{
  "success": true,
  "data": {
    "farms": [
      {
        "id": 102,
        "farm_name": "Yadav Farm",
        "farm_type": "Owner",
        "total_land_owned": 35.6,
        "irrigation_type": "Borewell",
        "primary_soil_type": "Clay Loam",
        "water_source": "Borewell",
        "description": "Agricultural farm focused on essential crops.",
        "address": {
          "lane_1": "Gondal Road",
          "lane_2": "",
          "state": 1,
          "district": 5,
          "block": 12,
          "village": "Gondal",
          "pincode": "360311"
        },
        "fields": [
          {
            "name": "Field A",
            "acres": 12.5,
            "soil_type": "Clay Loam",
            "irrigation": "Borewell"
          },
          {
            "name": "Field B",
            "acres": 10.0,
            "soil_type": "Sandy Loam",
            "irrigation": "Drip"
          }
        ]
      }
    ]
  }
}
```

---

## 4. Address Management Screen
Used for the addresses list.

**Request**
```http
GET /api/farmer/profile?tab=address
Authorization: Bearer <token>
```

**Response**
```json
{
  "success": true,
  "data": {
    "addresses": [
      {
        "id": 101,
        "is_primary": true,
        "type": "Home",
        "lane_1": "House No 5, Gondal",
        "lane_2": "",
        "state": 1,
        "district": 5,
        "block": 12,
        "village": "Gondal",
        "pincode": "360001"
      },
      {
        "id": 102,
        "is_primary": false,
        "type": "Farm/Warehouse",
        "lane_1": "Aji GIDC",
        "lane_2": "",
        "state": 1,
        "district": 5,
        "block": 12,
        "village": "Gondal",
        "pincode": "360003"
      }
    ]
  }
}
```

---

## 5. Bank & Payment Details Screen
Used for bank accounts and UPI IDs.

**Request**
```http
GET /api/farmer/profile?tab=bank
Authorization: Bearer <token>
```

**Response**
```json
{
  "success": true,
  "data": {
    "bank_accounts": [
      {
        "id": 15,
        "bank_name": "State Bank of India",
        "acc_holder_name": "Ramesh Yadav",
        "acc_number": "XXXX XXXX 1234",
        "ifsc_code": "SBIN0001234",
        "is_primary": true
      }
    ],
    "upi_details": [
      {
        "id": 8,
        "upi_id": "rameshyadav@sbi"
      }
    ]
  }
}
```

---

## Additions (latest)

**Location names.** Every address object (`personal.address_details`, `farm.address`, `address.addresses[]`) now also
carries `state_name`, `district_name` and `block_name` next to the numeric `state` / `district` / `block` ids, so the app
never has to map ids itself. `main.user_info.location` is now `"<village>, <district name>"` (it used to end with the
district id).

**Bank tab.** `acc_number` is masked (`"XXXX XXXX 9012"`); the full number is never returned. Each account also returns
`passbook_image_url`.

---

## Profile management endpoints (JWT required; always act on the logged-in farmer)

A farmer can only read or change their own rows; another farmer's id returns `404`. Only farmer accounts may call
`/api/farmer/*` (a pilot or admin token gets `403`; a deactivated account `401`). Errors are
`{ "success": false, "message": "..." }` with `400` (validation), `404`, `409` (duplicate) or `401`.
A validation `400` also has `"code": "VALIDATION_ERROR"` and `"errors": [{ "field": "pincode", "message": "..." }]`
listing every problem; `message` is the first one. An `:id` that is not a number (or a `booking_id` that is not a UUID)
is a `400`. Successful writes return `{ "success": true, "message": "...", "data": { ... } }`.

### Updating personal details: `PATCH /api/farmer/profile?tab=personal`
Body `{ "personal_info": { ... }, "address_details": { ... } }` (or the same fields flat). Only fields that are sent change.
- `first_name` / `last_name`: up to 60 characters. `dob`: `dd/mm/yyyy` or `yyyy-mm-dd`, a real date, not in the future.
- `email` / `mobile_number`: normalised (lower-case e-mail, 10-digit mobile) and must not belong to another account
  (`409`). A **new** e-mail must first be verified with `POST /api/otp/send-otp` + `verify-otp` (`purpose` other than
  `registration`); so must a new mobile number whenever SMS is available. Sending the current value is not a change.
- `whatsapp_number`: 10 digits. `profile_image`: only a photo URL from this app's Cloudinary account.
- `address_details`: the primary address; `state` / `district` / `block` must exist and belong together, `pincode` 6 digits.

### Addresses
| Method | Path | Body |
|---|---|---|
| POST | `/api/farmer/addresses` | `lane_1`, `lane_2?`, `state`, `district`, `block`, `village`, `pincode` (6 digits), `is_primary?` |
| PATCH | `/api/farmer/addresses/:id` | any of the above; `{ "is_primary": true }` makes it the primary address |
| DELETE | `/api/farmer/addresses/:id` | - |

- `state` / `district` / `block` must exist and belong to each other (taluka in district, district in state).
- The first address is always primary. Setting another one primary demotes the previous primary.
- The primary address cannot be unset directly or deleted while other addresses exist; make another one primary first.
- `data` is the address with `state_name`, `district_name`, `block_name` and `type` (`Home` for the primary, otherwise `Farm/Warehouse`).

### Bank accounts
| Method | Path | Body |
|---|---|---|
| POST | `/api/farmer/bank-accounts` | `bank_name`, `acc_holder_name`, `acc_number` (9-18 digits), `ifsc_code` (e.g. `SBIN0001234`, upper-cased), `is_primary?` |
| PATCH | `/api/farmer/bank-accounts/:id` | any of the above; `{ "is_primary": true }` makes it the primary account |
| DELETE | `/api/farmer/bank-accounts/:id` | - |

- The same account number cannot be added twice (`409`). The first account is primary; the same primary rules as addresses apply.
- Responses and the bank tab only ever contain the masked number (`XXXX XXXX 9012`).

### UPI IDs
`POST /api/farmer/upi`, `PATCH /api/farmer/upi/:id`, `DELETE /api/farmer/upi/:id` with `{ "upi_id": "name@bank" }`.
Duplicates return `409`.

**Still not available (no backend support):** profile photo upload, account type / branch details for bank accounts,
and real farm records (the farm tab is derived from non-primary addresses with placeholder acreage and fields).
The older unauthenticated `POST /api/users/:user_id/address` still exists for admin use; the farmer app no longer calls it.

---

## Admin-only: booking extras

`PATCH /api/farmer/bookings/:booking_id/extras` is **not** a farmer endpoint. It needs an activated admin account
(`/admin/auth/login` token) with the `orders:edit` or `payments:manage` permission; farmer and pilot tokens get `401` / `403`.
The body may contain only editable `SprayingOrderExtras` columns (payment, service, live-snapshot, pilot-rating and usage
fields). Unknown or protected fields (`booking_id`, audit columns, ...) return `400` with the list of `editable_fields`.
