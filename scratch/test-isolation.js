import jwt from 'jsonwebtoken';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'darhub_jwt_secret_change_me';
const token172 = jwt.sign({ id: 172, user_type: 1 }, JWT_SECRET);

console.log('Testing Farmer 172 accessing Farmer 30 booking:');
const cmd = `curl.exe -s -X GET "http://localhost:5678/api/farmer/bookings/d3abeebe-62ec-43bc-b9c0-26538fd06f5f" -H "Authorization: Bearer ${token172}"`;
const out = execSync(cmd, { encoding: 'utf-8' });
console.log(out);
