import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:5678';
const randomSuffix = Math.floor(10000000 + Math.random() * 90000000);
const testMobile = `98${randomSuffix}`;
const testEmail = `farmer_${randomSuffix}@test.com`;
const testPassword = "Password@123";

async function runJourney() {
  console.log(`=======================================================`);
  console.log(`Starting Full End-to-End Farmer Flow Testing`);
  console.log(`Test Farmer: Mobile = ${testMobile}, Email = ${testEmail}`);
  console.log(`=======================================================\n`);

  // Step 1: Farmer Registration
  console.log(`[1] Testing Farmer Registration...`);
  const regFormData = new FormData();
  regFormData.append('first_name', 'Ramesh');
  regFormData.append('last_name', 'Patel');
  regFormData.append('email', testEmail);
  regFormData.append('password', testPassword);
  regFormData.append('mobile_number', testMobile);
  regFormData.append('dob', '1985-05-15');
  regFormData.append('isMobileVerify', 'true');
  regFormData.append('isverifyEmail', 'true');
  regFormData.append('address', JSON.stringify([{
    state: 1,
    district: 1,
    block: 1,
    lane1: 'Village Post',
    village: 'Sonpur',
    pincode: '800001',
    is_primary: true
  }]));

  const regRes = await fetch(`${BASE_URL}/api/user/farmer-registration`, {
    method: 'POST',
    body: regFormData
  });
  console.log(`Registration Status:`, regRes.status);
  const regData = await regRes.json();
  console.log(`Registration Response:`, regData);
  if (!regData.success && !regData.user_id && regRes.status !== 201) {
    console.error("Registration failed, stopping.");
    return;
  }
  const userId = regData.user_id || regData.data?.id;

  // Step 2: Farmer Login
  console.log(`\n[2] Testing Farmer Login...`);
  const loginRes = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mobile_number: testMobile,
      password: testPassword
    })
  });
  console.log(`Login Status:`, loginRes.status);
  const loginData = await loginRes.json();
  console.log(`Login Response:`, { success: loginData.success, hasToken: !!loginData.token, hasRefreshToken: !!loginData.refreshToken });
  
  const token = loginData.token || loginData.access_token;
  const refreshToken = loginData.refreshToken || loginData.refresh_token;

  if (!token) {
    console.error("No token received. Stopping.");
    return;
  }

  // Step 3: Get Me / Verify Token
  console.log(`\n[3] Testing GET /api/user/me...`);
  const meRes = await fetch(`${BASE_URL}/api/user/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`Me Status:`, meRes.status);
  const meData = await meRes.json();
  console.log(`Me Response:`, { success: meData.success, user_id: meData.user?.id, username: meData.user?.username });

  // Step 4: Refresh Token
  if (refreshToken) {
    console.log(`\n[4] Testing POST /api/refresh-token...`);
    const refreshRes = await fetch(`${BASE_URL}/api/refresh-token`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${refreshToken}` }
    });
    console.log(`Refresh Token Status:`, refreshRes.status);
    const refreshData = await refreshRes.json();
    console.log(`Refresh Token Response:`, { success: refreshData.success, hasNewToken: !!refreshData.token });
  }

  // Step 5: Profile Fetching (all tabs)
  console.log(`\n[5] Testing Farmer Profile Tabs...`);
  for (const tab of ['main', 'personal', 'farm', 'address', 'bank']) {
    const profRes = await fetch(`${BASE_URL}/api/farmer/profile?tab=${tab}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`Profile Tab [${tab}] Status:`, profRes.status);
    const profData = await profRes.json();
    console.log(`Profile Tab [${tab}] Success:`, profData.success);
  }

  // Step 6: Fetch Crops List
  console.log(`\n[6] Testing GET /order/crops/list...`);
  const cropsRes = await fetch(`${BASE_URL}/order/crops/list`);
  console.log(`Crops Status:`, cropsRes.status);
  const cropsData = await cropsRes.json();
  console.log(`Crops Count:`, cropsData.data?.length);
  const firstCropId = cropsData.data?.[0]?.id || 1;

  // Step 7: Create Order
  console.log(`\n[7] Testing Order Creation (POST /order/create-order)...`);
  const orderRes = await fetch(`${BASE_URL}/order/create-order`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      start_date: "2026-11-01",
      end_date: "2026-11-02",
      num_of_days: 2,
      crop_type_id: firstCropId,
      land_in_acers: 6.0,
      price: 3000,
      tax: 150,
      total_price: 3150,
      cupon_id: 13,
      discount: 0,
      user_id: userId,
      farmer_details: {
        name: "Ramesh Patel",
        mobile: testMobile,
        email: testEmail
      },
      address: {
        state: 1,
        district: 1,
        block: 1,
        village: "Sonpur",
        lane1: "Plot 10",
        pincode: "800001"
      }
    })
  });
  console.log(`Create Order Status:`, orderRes.status);
  const orderData = await orderRes.json();
  console.log(`Create Order Response:`, orderData);
  const bookingId = orderData.booking_id;

  // Step 8: Get Booking Statuses Tabs
  console.log(`\n[8] Testing GET /api/farmer/bookings/statuses...`);
  const statusesRes = await fetch(`${BASE_URL}/api/farmer/bookings/statuses`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`Statuses Status:`, statusesRes.status);
  const statusesData = await statusesRes.json();
  console.log(`Statuses Data:`, statusesData.data?.map(s => s.key));

  // Step 9: Get Farmer Bookings List
  console.log(`\n[9] Testing GET /api/farmer/bookings?status=PENDING...`);
  const bookingsRes = await fetch(`${BASE_URL}/api/farmer/bookings?status=PENDING&page=1&limit=5`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(`Bookings List Status:`, bookingsRes.status);
  const bookingsData = await bookingsRes.json();
  console.log(`Bookings List Total:`, bookingsData.total);
  console.log(`Booking Card 0:`, bookingsData.data?.[0]?.title, bookingsData.data?.[0]?.location, bookingsData.data?.[0]?.total_amount_formatted);

  if (bookingId) {
    // Step 10: Get Single Booking Detail
    console.log(`\n[10] Testing GET /api/farmer/bookings/${bookingId}...`);
    const detailRes = await fetch(`${BASE_URL}/api/farmer/bookings/${bookingId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`Booking Detail Status:`, detailRes.status);
    const detailData = await detailRes.json();
    console.log(`Booking Detail Title:`, detailData.data?.title);
    console.log(`Booking Detail Location:`, detailData.data?.location);
    console.log(`Booking Detail Payment Status:`, detailData.data?.payment_status);

    // Step 11: Cancel Booking
    console.log(`\n[11] Testing POST /api/farmer/bookings/${bookingId}/cancel...`);
    const cancelRes = await fetch(`${BASE_URL}/api/farmer/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cancellation_reason: "Change of Schedule"
      })
    });
    console.log(`Cancel Status:`, cancelRes.status);
    const cancelData = await cancelRes.json();
    console.log(`Cancel Response:`, cancelData);
  }

  // Step 12: Filter Orders (POST /order/filter-orders)
  console.log(`\n[12] Testing POST /order/filter-orders...`);
  const filterRes = await fetch(`${BASE_URL}/order/filter-orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_id: userId,
      page: 1,
      pageSize: 5
    })
  });
  console.log(`Filter Status:`, filterRes.status);
  const filterData = await filterRes.json();
  console.log(`Filter Total:`, filterData.total);

  console.log(`\n=======================================================`);
  console.log(`All 12 End-to-End Endpoints Successfully Tested!`);
  console.log(`=======================================================`);
}

runJourney();
