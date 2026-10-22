# Farmer Order Creation API Guide

This document outlines the complete sequence of APIs required to build the "Create Booking / Order" flow in the mobile app.

---

## Step 1: Fetch Available Crops
Before creating an order, you need to let the user select a crop. This API returns a list of crops and their per-acre pricing.

**Endpoint:** `GET /order/crops/list`  
*(Note: No authentication is strictly required for this endpoint, but attaching the token is fine).*

**Success Response (200 OK)**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Cotton",
      "price_per_acre": "500.00"
    },
    {
      "id": 2,
      "name": "Paddy (Rice)",
      "price_per_acre": "600.00"
    }
  ]
}
```

---

## Step 2: Fetch Farm Details (Addresses)
When creating an order, you can let the user pick one of their existing farms/addresses.

**Endpoint:** `GET /api/farmer/profile?tab=address`  
**Headers:** `Authorization: Bearer <accessToken>` (Required)

*(Note: You can also use `?tab=farm` if you want the enriched "Farms" UI structure, but the `address` tab directly gives you the address components needed for order creation).*

**Success Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "addresses": [
      {
        "id": 4,
        "is_primary": true,
        "type": "Home",
        "lane_1": "Main Road",
        "lane_2": "Near Temple",
        "state": "Maharashtra",
        "district": "Pune",
        "block": "Haveli",
        "village": "Wagholi",
        "pincode": "412207"
      }
    ]
  }
}
```

---

## Step 3: Create the Order
Once the farmer selects the Date, Crop, Land size, and Address, you submit the order.

**Endpoint:** `POST /order/create-order`  
**Headers:** `Authorization: Bearer <accessToken>` (Required to map the order correctly if `user_id` is passed, though the backend can also auto-map using `farmer_details`).

**Request Body (JSON):**
```json
{
  "start_date": "2026-08-30",
  "crop_type_id": 1,
  "land_in_acers": 5,
  "user_id": 123, 
  "farmer_details": {
    "name": "Anish",
    "mobile": "9876543210"
  },
  "address": {
    "state": "Maharashtra",
    "district": "Pune",
    "block": "Haveli",
    "lane1": "Main Road",
    "lane2": "Near Temple",
    "village": "Wagholi",
    "pincode": "412207"
  }
}
```

### Payload Breakdown:
- **`start_date`** (Required): Date the spraying should start (`YYYY-MM-DD`).
- **`crop_type_id`** (Required): The `id` from the Crops API (Step 1).
- **`land_in_acers`** (Required): Decimal or Integer representing land size (e.g., `5.5`).
- **`user_id`** (Optional but Recommended): Pass the `user.id` you got from the Login or `/me` API.
- **`farmer_details`** (Optional if `user_id` is passed): Used as a fallback to auto-detect the account by mobile number.
- **`address`** (Optional but Recommended): Pass the address object where the work will happen. The backend automatically links this address to the newly created order.

**Success Response (201 Created)**
```json
{
  "message": "Order placed successfully",
  "booking_id": "8b9e6f3d-abcd-4123-1234-90abcde12345"
}
```
*Note: The new booking will instantly appear in `GET /api/farmer/bookings?status=PENDING` after creation!*

### Number of days
The server decides `num_of_days` from the admin's working-days bands (`/working-days`); the response returns it with
`start_date` and `end_date`. Acreage between two bands (5.5 acres, or a gap such as 20 to 24) takes the next band up;
acreage above the largest band is extrapolated from it. A booking that would need more than 60 working days is refused:

```json
{ "success": false, "code": "BOOKING_TOO_LARGE", "message": "1000 acres needs 229 working days, more than the 60-day maximum for one booking. ..." }
```

### Idempotency-Key (send it from every client)
Send a random UUID in the `Idempotency-Key` header. Re-send the **same key** when you retry the **same booking**
(double tap, timeout, dropped connection); create a **new key** for a new or changed booking.

| Situation | Response |
|---|---|
| First request | Runs normally (201). The response is kept for 24 h. |
| Same key, same body | The first response again, with header `Idempotent-Replayed: true`. No second booking. |
| Same key while the first copy is still running | `409` `IDEMPOTENCY_REQUEST_IN_PROGRESS` with `Retry-After` (seconds): wait and resend. |
| Same key, different body | `422` `IDEMPOTENCY_KEY_REUSED`: use a new key. |
| Invalid key (not 8-255 of `A-Z a-z 0-9 - _ . :`) | `400` `INVALID_IDEMPOTENCY_KEY` |

Keys are per user and per endpoint. A `5xx` (and a retryable `408/409/425/429`) is not kept, so the same key can be
retried. The same header is accepted by `POST /api/farmer/bookings/:id/cancel`, `PATCH /api/farmer/bookings/:id/reschedule`
and `POST /order/assign-work/:id`. Requests without the header still work; set `IDEMPOTENCY_KEY_REQUIRED=true` on the
server to make it mandatory for create-order once every app version in use sends it.
