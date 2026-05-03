# 📦 Backend API Documentation

This project provides a set of API endpoints for managing users, authentication, and drones. Below are the detailed descriptions of each endpoint along with sample payloads for testing.

---

## 📌 Base URLs

- **User APIs:** `/api`
- **Admin/Drone APIs:** `/admin`

---

## ✅ User APIs (`/api`)

### 1. Register User
- **Method:** `POST`
- **URL:** `/api/register`
- **Description:** Register a new user with profile and addresses.
- **Sample Payload:**
```json
{
  "email": "abc@example.com",
  "password": "mypassword123",
  "username": "anishk",
  "mobile_number": "9876543210",
  "addresses": [
    {
      "lane_1": "Street 1",
      "lane_2": "Area 2",
      "state": 12,
      "district": 34,
      "block": 56,
      "village": "Village A",
      "pincode": "123456"
    }
  ],
  "first_name": "Anish",
  "last_name": "Kumar",
  "whatsapp_number": "9876543210",
  "user_image_original_filename": "profile.jpg",
  "user_image_new_filename": "profile_123.jpg",
  "user_image_url": "https://example.com/images/profile_123.jpg",
  "aadhar_number": "123456789012",
  "pan_card_number": "ABCDE1234F",
  "role_privilage_id": 2
}


2. Login User

Method: POST

URL: /api/login

Description: Authenticate a user and return access and refresh tokens.

Sample Payload:

{
  "email": "abc@example.com",
  "password": "mypassword123"
}

3. Delete User

Method: POST

URL: /api/deleteUser

Description: Delete an existing user by ID.

Sample Payload:

{
  "id": 1
}

4. Update User Profile

Method: PUT

URL: /api/updateprofile/:id

Description: Update a user’s profile and address details.

Sample Payload:

{
  "password": "newpassword",
  "username": "newusername",
  "mobile_number": "9999999999",
  "state": 12,
  "district": 34,
  "block": 56,
  "village": "Village A",
  "address1": "Street 1",
  "address2": "Area 2",
  "pincodde": "123456",
  "first_name": "Anish",
  "last_name": "Kumar",
  "whatsapp_number": "9876543210",
  "user_image_original_filename": "profile.jpg",
  "user_image_new_filename": "profile_123.jpg",
  "user_image_url": "https://example.com/images/profile_123.jpg",
  "aadhar_number": "123456789012",
  "pan_card_number": "ABCDE1234F",
  "role_privilage_id": 2
}

5. Refresh Token

Method: PUT

URL: /api/refresh-token

Description: Use this endpoint to get a new access token when the old one expires.

Sample Payload:

{
  "token": "<refresh_token>"
}

✅ Admin / Drone APIs (/admin)                        `11qqqqqqqqqqqqq1
1. Create Drone

Method: POST

URL: /admin/drones

Description: Create a new drone with detailed parts and configurations.

Sample Payload:

{
  "owner_id": 1,
  "model": "X100",
  "name": "DroneX",
  "range": 1000,
  "speed": 50,
  "weight": 10,
  "is_level_sensor": true,
  "level_sensor_id": 2,
  "is_allen_key": false,
  "allen_key_id": null,
  "water_pump_id": 3,
  "is_extension_board": true,
  "extension_board_id": 4,
  "drone_arms": [
    { "master_arm_id": 1, "count": 4 }
  ],
  "drone_propellers": [
    { "master_propeller_id": 2, "count": 4 }
  ],
  "drone_batteries": [
    { "master_battery_id": 1, "count": 2 }
  ],
  "drone_chargers": [
    { "master_charger_id": 1, "is_charger_cable": true, "ischarger_pcable": false }
  ],
  "drone_controllers": [
    { "transmitter_id": 1, "receiver_id": 2 }
  ],
  "drone_landing_gears": [
    { "master_landing_gear_id": 1, "count": 2 }
  ],
  "drone_motors": [
    { "master_motor_id": 1, "count": 4 }
  ],
  "drone_nozzels": [
    { "master_nozzel_id": 1, "count": 2 }
  ],
  "drone_nut_bolts": [
    { "master_bolt_id": 1, "master_nut_id": 2, "count": 8 }
  ],
  "drone_pipes": [
    { "master_pipe_id": 1, "count": 2 }
  ]
}

2. Get All Drones

Method: GET

URL: /admin/get-drones

Description: Fetch all drones.

3. Get Drone By ID

Method: GET

URL: /admin/get-drone/:id

Description: Fetch details of a specific drone.

4. Update Drone

Method: PUT

URL: /admin/update-drone/:id

Description: Update drone details.

Sample Payload:

{
  "owner_id": 1,
  "model": "X200",
  "name": "DroneY",
  "range": 1200,
  "speed": 60,
  "weight": 12,
  "is_level_sensor": false,
  "level_sensor_id": null,
  "is_allen_key": true,
  "allen_key_id": 2,
  "water_pump_id": 4,
  "is_extension_board": false,
  "extension_board_id": null,
  "drone_arms": [
    { "master_arm_id": 2, "count": 6 }
  ],
  "drone_propellers": [
    { "master_propeller_id": 3, "count": 6 }
  ]
}


### 5. Filter Drones
- **Method:** GET
- **URL:** `/admin/filter-drones`
- **Description:** Filter and fetch drones based on criteria
- **Sample Response:**
```json
{
  "success": true,
  "count": 15,
  "page": 1,
  "page_size": 25,
  "total_pages": 1,
  "data": [
    {
      "id": 1,
      "owner_id": 1,
      "model": "X500-Pro",
      "name": "Sprayer Drone",
      "range": 1500,
      "speed": 75,
      "weight": 18,
      "is_level_sensor": true,
      "level_sensor_id": 2,
      "is_allen_key": true,
      "allen_key_id": 3,
      "water_pump_id": 4,
      "is_extension_board": false,
      "extension_board_id": null,
      "is_active": true,
      "created_on": "2025-08-30T18:10:42.188Z",
      "created_by": null,
      "modified_on": null,
      "modified_by": null,
      "arms": [
        {
          "master_arm_id": 3,
          "qty": 4,
          "master_arm_name": "XYZ"
        }
      ],
      "batteries": [],
      "chargers": [],
      "controllers": [],
      "landing_gears": [],
      "motors": [
        {
          "master_motor_id": 1,
          "motor_qty": 4,
          "master_motor_name": null,
          "brand_name": null,
          "description": null
        }
      ]
    }
  ]
}
```





Make sure to validate the payloads before sending requests to avoid errors.

📂 For any missing details, refer to the route files or contact the development team.



utility folder , qunatity of drones , reponse structure has been added 




INSERT INTO "MASTER_BLOCK" (id, block_name,district_id,is_active,created_on,"createdAt","updatedAt")
VALUES(56,'AGARPADA',34,true,now(),now(),now()); to insert into master_block


INSERT INTO "MASTER_STATE" (id, state_name,is_active,created_on,"createdAt","updatedAt")
VALUES(56,'JHARKHAND',true,now(),now(),now());


TASK 
get api user 



filter for block name , district name, state name, order by also , created by name , modified by name in reponse and also filter and ordering 

✅also in the updateuserprofile have to store modified by and modified on in that id should be stored


get user createdby modified by shoudl come in the response 


in the drone filter drone id and drone name, state_id , block_id, district_id and district name  should be come in the response , created by name, block_name , state_name

filter by block_name state_name 

date 13/10/25 task
filter created_by_name modified_by_name filter
 three letter word filter feature 

 hasAnyFilter 


 modified_by add karna hai spraying order ke liye 
 USER_ACTIVITY WHICH WILL STORE ALL THE 

 METHOD, API_ROUTE, IP_ADDRESS, USER_ID, AUDITFEILDS, PAYLOAD_HISTORY-> DATATYPE.STRING, RESPONSE_HISTORY->DATATYPE.STRING, RESPONSE_STATUS, RESPONSE_TIME  



 comment filter 
 booking_id, working_date, comment_type- iLike, created_on, modified_on start-date end-date



5/12/2025
// Login page, Signup Page 

SSO LOGIN 


# api for location to associate a drone to a specific location 