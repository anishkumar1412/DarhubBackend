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
