# Farmer Bookings API Documentation

This document outlines the request and response structures for fetching a farmer's bookings list.

All requests require the Farmer's JWT token in the `Authorization: Bearer <token>` header.

---

## 1. Get Farmer Bookings List
Used to fetch a paginated list of bookings (cards) for the farmer. You can filter the list by booking status.

**Endpoint**
```http
GET /api/farmer/bookings
```

**Query Parameters**
- `status` (string, optional): Filter by booking status. Valid values: `PENDING`, `UPCOMING`, `ONGOING`, `COMPLETED`, `CANCELLED`. If omitted, returns all bookings.
- `page` (number, optional): Page number for pagination. Default is `1`.
- `limit` (number, optional): Number of records per page. Default is `10`, at most `50` (a larger value is reduced to 50).

**Request Example**
```http
GET /api/farmer/bookings?status=UPCOMING&page=1&limit=10
Authorization: Bearer <token>
```

**Response Example**
```json
{
  "success": true,
  "page": 1,
  "limit": 10,
  "total": 24,
  "total_pages": 3,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Wheat Spraying",
      "status": "UPCOMING",
      "scheduled_date": "11 May 2026",
      "scheduled_time_window": "10:00 AM - 12:00 PM",
      "location": "Gondal • 35 Acres",
      "pilot_name": "Ramesh Pilot",
      "drone_name": "AgriDrone X1",
      "total_amount_formatted": "₹3,500",
      "payment_status": "Pending",
      "created_at": "10 May 2026, 09:15 AM"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "title": "Cotton Spraying",
      "status": "UPCOMING",
      "scheduled_date": "12 May 2026",
      "scheduled_time_window": null,
      "location": "Aji GIDC • 12 Acres",
      "pilot_name": "To be assigned",
      "drone_name": null,
      "total_amount_formatted": "₹1,200",
      "payment_status": "Paid",
      "created_at": "10 May 2026, 10:20 AM"
    }
  ]
}
```

### Response Field Descriptions

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string (UUID) | The unique booking ID (used to fetch full details). |
| `title` | string | The service title (e.g. "Wheat Spraying"). |
| `status` | string | The mapped app status (`PENDING`, `UPCOMING`, `ONGOING`, `COMPLETED`, `CANCELLED`). |
| `scheduled_date` | string | The start date formatted as `DD MMM YYYY`. |
| `scheduled_time_window` | string/null | The time window for the booking (from extras), if set. |
| `location` | string | Formatted string showing `Village/Field • Acres`. |
| `pilot_name` | string | Pilot's name. Defaults to "To be assigned" if not yet assigned. |
| `drone_name` | string/null | Name of the assigned drone. Null if not assigned. |
| `total_amount_formatted` | string | Formatted price string (e.g., `₹3,500`). |
| `payment_status` | string | Either `"Paid"` or `"Pending"`. |
| `created_at` | string | The datetime when the booking was placed. |

---

## 2. Get Booking Statuses (Tabs)
Returns the canonical list of booking status tabs the Android app should render.

**Endpoint**
```http
GET /api/farmer/bookings/statuses
```

**Request Example**
```http
GET /api/farmer/bookings/statuses
Authorization: Bearer <token>
```

**Response Example**
```json
{
  "success": true,
  "data": [
    { "key": "PENDING",   "label": "Pending",   "order": 1 },
    { "key": "UPCOMING",  "label": "Upcoming",  "order": 2 },
    { "key": "ONGOING",   "label": "Ongoing",   "order": 3 },
    { "key": "COMPLETED", "label": "Completed", "order": 4 },
    { "key": "CANCELLED", "label": "Cancelled", "order": 5 }
  ]
}
```

## Rules (latest)
- A farmer sees only bookings made for or by their own account (bookings of other accounts that share the same mobile
  number are no longer included).
- `booking_id` must be a UUID (`400` otherwise). Another farmer's booking returns `404`.
- `PATCH .../rate`: `rating` is a whole number 1-5, and only completed bookings can be rated (it can be changed later).
- `POST .../cancel`: `cancellation_reason` is optional, at most 500 characters.
- `PATCH .../reschedule`: `new_date` (`YYYY-MM-DD`) today or later in India and at most a year ahead; `new_time_window`
  at most 50 characters.
