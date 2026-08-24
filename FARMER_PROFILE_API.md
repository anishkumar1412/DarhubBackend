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
