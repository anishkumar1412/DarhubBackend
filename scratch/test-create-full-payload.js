import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'darhub_jwt_secret_change_me';
const token30 = jwt.sign({ id: 30, user_type: 1 }, JWT_SECRET);

async function testCreateOrderFullPayload() {
  // Mobile app passes all existing fields including spoofed or old user_id: 999
  const existingFullPayload = {
    start_date: "2026-10-15",
    end_date: "2026-10-16",
    num_of_days: 2,
    crop_type_id: 1,
    land_in_acers: 7.5,
    price: 3750,
    tax: 187.5,
    total_price: 3937.5,
    cupon_id: 13,
    discount: 50,
    user_id: 999, // mobile app sent this, but token has 30!
    farmer_details: {
      name: "Anish Test",
      mobile: "09798297100",
      email: "test@darhub.com"
    },
    address: {
      state: 1,
      district: 1,
      block: 1,
      village: "Sonpur",
      lane1: "Line 1 Test",
      lane2: "Line 2 Test",
      address1: "Address 1 Test",
      address2: "Address 2 Test",
      pincode: "800001"
    }
  };

  const res = await fetch('http://localhost:5678/order/create-order', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token30}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(existingFullPayload)
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Response:', data);

  // Now verify that the order was created with user_id = 30 (enforced from token!), NOT 999!
  if (data.booking_id) {
    const detailRes = await fetch(`http://localhost:5678/api/farmer/bookings/${data.booking_id}`, {
      headers: { 'Authorization': `Bearer ${token30}` }
    });
    console.log('Detail Fetch Status for Farmer 30:', detailRes.status);
    const detailData = await detailRes.json();
    console.log('Farmer 30 can fetch it:', detailData.success);
  }
}

testCreateOrderFullPayload();
