import jwt from 'jsonwebtoken';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'darhub_jwt_secret_change_me';
const BASE_URL = 'http://localhost:5678';

// Create JWT tokens
const farmerToken = jwt.sign(
  { id: 30, email: 'a1@gmail.com', username: 'Farmer_30', user_type: 1 },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const otherFarmerToken = jwt.sign(
  { id: 33, email: 'a3@gmail.com', username: 'Farmer_33', user_type: 1 },
  JWT_SECRET,
  { expiresIn: '1h' }
);

console.log('Farmer Token:', farmerToken.slice(0, 30) + '...');
console.log('Other Farmer Token:', otherFarmerToken.slice(0, 30) + '...\n');

function runCurl(description, curlCmd) {
  console.log(`================================================================`);
  console.log(`TEST: ${description}`);
  console.log(`COMMAND:\n${curlCmd}`);
  try {
    const output = execSync(curlCmd, { encoding: 'utf-8' });
    console.log(`RESPONSE:`);
    try {
      const parsed = JSON.parse(output);
      console.log(JSON.stringify(parsed, null, 2));
      return parsed;
    } catch {
      console.log(output);
      return output;
    }
  } catch (err) {
    console.error(`ERROR (Status ${err.status}):`, err.stdout || err.message);
    if (err.stdout) {
      try {
        console.log(JSON.stringify(JSON.parse(err.stdout), null, 2));
      } catch {
        console.log(err.stdout);
      }
    }
    return null;
  }
}

async function runTests() {
  // Test 1: Get Statuses
  runCurl(
    '1. GET Booking Statuses Tabs',
    `curl.exe -s -X GET "${BASE_URL}/api/farmer/bookings/statuses" -H "Authorization: Bearer ${farmerToken}"`
  );

  // Test 2: Create a new booking for Farmer 30
  const createPayload = JSON.stringify({
    start_date: "2026-09-01",
    crop_type_id: 1,
    land_in_acers: 4.5,
    price: 2250,
    total_price: 2362,
    address: {
      state: 1,
      district: 1,
      block: 1,
      village: "Sonpur",
      lane1: "North Field",
      pincode: "800001"
    }
  }).replace(/"/g, '\\"');

  const createRes = runCurl(
    '2. POST Create Booking via /api/farmer/bookings',
    `curl.exe -s -X POST "${BASE_URL}/api/farmer/bookings" -H "Authorization: Bearer ${farmerToken}" -H "Content-Type: application/json" -d "${createPayload}"`
  );

  const bookingId = createRes?.booking_id;
  console.log('Created Booking ID:', bookingId);

  // Test 3: List Farmer 30's Bookings
  runCurl(
    '3. GET Farmer 30 Bookings List (Should contain new booking)',
    `curl.exe -s -X GET "${BASE_URL}/api/farmer/bookings?status=PENDING&page=1&limit=5" -H "Authorization: Bearer ${farmerToken}"`
  );

  if (bookingId) {
    // Test 4: Get Booking Detail for Farmer 30
    runCurl(
      `4. GET Booking Detail for Farmer 30 (${bookingId})`,
      `curl.exe -s -X GET "${BASE_URL}/api/farmer/bookings/${bookingId}" -H "Authorization: Bearer ${farmerToken}"`
    );

    // Test 5: Isolation Test - Other Farmer (ID 33) tries to access Farmer 30's booking
    runCurl(
      `5. ISOLATION CHECK: Other Farmer 33 tries to access Farmer 30's booking (Expect 404)`,
      `curl.exe -s -X GET "${BASE_URL}/api/farmer/bookings/${bookingId}" -H "Authorization: Bearer ${otherFarmerToken}"`
    );

    // Test 6: Cancel booking by Farmer 30
    const cancelPayload = JSON.stringify({
      cancellation_reason: "Heavy Monsoon Rain"
    }).replace(/"/g, '\\"');

    runCurl(
      `6. POST Cancel Booking by Farmer 30`,
      `curl.exe -s -X POST "${BASE_URL}/api/farmer/bookings/${bookingId}/cancel" -H "Authorization: Bearer ${farmerToken}" -H "Content-Type: application/json" -d "${cancelPayload}"`
    );

    // Test 7: Verify Booking Status is now CANCELLED in Farmer 30's list
    runCurl(
      '7. GET Farmer 30 CANCELLED Bookings List',
      `curl.exe -s -X GET "${BASE_URL}/api/farmer/bookings?status=CANCELLED&page=1&limit=5" -H "Authorization: Bearer ${farmerToken}"`
    );

    // Test 8: Legacy /order/get-order with Farmer Token - Scoped check
    runCurl(
      '8. GET /order/get-order with Farmer Token (Should return only Farmer 30 orders, NOT all orders)',
      `curl.exe -s -X GET "${BASE_URL}/order/get-order" -H "Authorization: Bearer ${farmerToken}"`
    );
  }
}

runTests();
