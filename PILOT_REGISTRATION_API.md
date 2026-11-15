# Pilot Registration API Documentation

This document outlines the API structure for registering a new pilot.

## Register Pilot
Registers a new pilot account, creates their profile, addresses, bank details, and uploads their documents.

**Endpoint**
```http
POST /api/user/pilot-registration
```

**Content-Type**
`multipart/form-data` (Required because of file uploads)

**Headers**
- `Authorization: Bearer <token>` (Optional, if created by an admin)

### Request Payload (Form Data)

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `first_name` | text | **Yes** | Pilot's first name |
| `last_name` | text | **Yes** | Pilot's last name |
| `email` | text | **Yes** | Valid email ending in `.com` |
| `password` | text | **Yes** | Account password |
| `mobile_number` | text | **Yes** | Exactly 10 digits |
| `dob` | text | No | Date of birth (Format: `DD/MM/YYYY` or `YYYY-MM-DD`) |
| `aadhar_number` | text | No | Aadhar card number |
| `pan_card_number` | text | No | PAN card number |
| `upi_id` | text | No | Valid UPI ID format (e.g. `user@bank`) |
| `isverifyEmail` | text/boolean| No | `"true"` or `"false"`. At least one verification must be true. |
| `isMobileVerify` | text/boolean| No | `"true"` or `"false"`. At least one verification must be true. |

#### Structured Data Fields
These can be sent either as **JSON stringified arrays** or as individual form fields.

**1. Address (`address`)**
Send as a JSON string: `[{"state": "1", "district": "2", "block": "3", "lane1": "Road 1", "village": "Aji", "pincode": "360003", "is_primary": true}]`
Or as individual form fields: `state`, `district`, `block`, `lane1`, `lane2`, `village`, `pincode`, `is_primary`.

**2. Bank Details (`bank_details`)**
Send as a JSON string: `[{"bank_name": "SBI", "acc_holder_name": "Ramesh", "acc_number": "12345", "ifsc_code": "SBIN0001", "is_primary": true}]`
Or as individual form fields: `bank_name`, `acc_holder_name`, `acc_number`, `ifsc_code`, `is_primary`.

### File Upload Fields
All files have a maximum size limit of **5MB** each. You can upload multiple files per field (up to 5).

| Field Name | Allowed Types | Description |
| :--- | :--- | :--- |
| `profile_image` | `jpg`, `jpeg`, `png` | Profile photo |
| `aaddhar_image` | `jpg`, `jpeg`, `png`, `pdf` | Aadhar Card document |
| `pan_card_image` | `jpg`, `jpeg`, `png`, `pdf` | PAN Card document |
| `dcga_pilot_cert` | `jpg`, `jpeg`, `png`, `pdf` | DGCI Pilot Certificate |
| `dcga_pilot_license` | `jpg`, `jpeg`, `png`, `pdf` | DGCI License |
| `medical_certificate` | `jpg`, `jpeg`, `png`, `pdf` | Medical Certificate |
| `insurance_doc` | `jpg`, `jpeg`, `png`, `pdf` | Insurance Document |
| `passbook_image` | `jpg`, `jpeg`, `png` | Bank Passbook photo |

---

### Responses

**Success (201 Created)**
```json
{
  "success": true,
  "message": "Pilot registered successfully",
  "user_id": 123,
  "token": "eyJhbGciOiJIUzI1NiIsInR..."
}
```

**Validation Error (400 Bad Request)**
```json
{
  "success": false,
  "error": "Mobile number must be exactly 10 digits"
}
```

**Server Error (500 Internal Server Error)**
```json
{
  "success": false,
  "message": "Pilot registration failed",
  "error": "..."
}
```

---

## Get Pilot Profile
Returns the pilot's profile information segmented by tabs, similar to the farmer profile API.

**Endpoint**
```http
GET /api/user/pilot/profile?tab=<tab_name>
```

**Query Parameters**
- `tab` (Required): Determines which section of the profile to fetch. Valid options are:
  - `main`: High-level summary of the pilot, verification status, and work summary (assigned/active orders).
  - `personal`: Detailed personal information (DOB, Aadhar, PAN, etc.) and primary address.
  - `address`: List of all addresses (primary and secondary).
  - `bank`: Bank accounts and UPI details.
  - `documents`: List of all uploaded certifications and documents (DGCA, medical, etc.).

**Headers**
- `Authorization: Bearer <token>` (Required)

**Response Example (tab=main)**
```json
{
  "success": true,
  "data": {
    "user_info": {
      "name": "Rahul FullPilot",
      "verified": true,
      "mobile_number": "9876500003",
      "email": "rahul.fullpilot3@example.com",
      "member_since": "2026-08-19T17:55:04.799Z",
      "account_type": "Pilot",
      "profile_image": "https://res.cloudinary.com/...",
      "location": "AeroCity, 2"
    },
    "work_summary": {
      "total_orders_assigned": 0,
      "active_orders": 0
    }
  }
}
```
