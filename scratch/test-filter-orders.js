import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'darhub_jwt_secret_change_me';
const token30 = jwt.sign({ id: 30, user_type: 1 }, JWT_SECRET);

async function testFilter() {
  const res = await fetch('http://localhost:5678/order/filter-orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token30}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      page: 1,
      pageSize: 5,
      orderBy: 'created_on',
      orderType: 'DESC'
    })
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

testFilter();
