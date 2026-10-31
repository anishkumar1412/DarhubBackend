// Calls every route with every kind of caller and junk input. Pass = no 5xx anywhere.
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const S = path.dirname(fileURLToPath(import.meta.url));
const { default: jwt } = await import('jsonwebtoken');
const BASE = 'http://localhost:5799';
const env = Object.fromEntries(fs.readFileSync(`${S}/.env.test`, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const routes = fs.readFileSync(`${S}/routes.txt`, 'utf8').trim().split('\n').map((l) => l.split(' '));
const [farmerId, pilotId] = process.argv.slice(2).map(Number);
let ip = 0;
const call = async (method, path, token, body) => {
  ip += 1;
  const headers = { 'X-Forwarded-For': `172.16.${(ip >> 8) & 255}.${ip & 255}` };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, text };
};
const login = await call('POST', '/admin/auth/login', null, { email: 'superadmin@example.com', password: 'Admin@12345' });
const admin = JSON.parse(login.text).data.token;
const tok = (id) => jwt.sign({ id, email: null }, env.JWT_SECRET, { expiresIn: '1h' });
const callers = { admin, farmer: tok(farmerId), pilot: tok(pilotId), anonymous: null };

const fails = []; const adminOk = []; let total = 0;
for (const [method, path] of routes) {
  for (const variant of ['999999', 'abc']) {
    const url = path.replace(/:[a-zA-Z_]+/g, variant);
    if (variant === 'abc' && url === path) continue;
    for (const [who, token] of Object.entries(callers)) {
      for (const body of method === 'GET' || method === 'DELETE' ? [undefined] : [undefined, {}, { id: 'abc', page: -1, limit: 'x', user_id: 'abc', booking_id: 'abc' }]) {
        total += 1;
        const r = await call(method, url, token, body);
        if (r.status >= 500) fails.push(`${r.status} ${who.padEnd(9)} ${method} ${url} body=${JSON.stringify(body)} -> ${r.text.slice(0, 200)}`);
        if (who === 'admin' && variant === '999999' && body === undefined && r.status < 300) adminOk.push(`${method} ${path}`);
      }
    }
  }
}
console.log(`requests: ${total}, 5xx: ${fails.length}, admin 2xx (no body): ${adminOk.length}`);
for (const f of fails) console.log(f);
