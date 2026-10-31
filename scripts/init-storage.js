// Creates the S3 bucket (+ CORS) if missing and runs a write/read/delete round trip.
//   Floci:  docker compose -f docker-compose.floci.yml up -d && npm run storage:init
//   AWS:    create the bucket in the console/Terraform (see docs/STORAGE_SETUP.md); this script only verifies it
import '../config/env.js';
import { ensureBucket, putFile, deleteFile, publicBaseUrl } from '../services/storage.service.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const emulator = !!process.env.S3_ENDPOINT;
if (emulator) {
  const r = await ensureBucket({ corsOrigins: (process.env.CORS_ORIGINS || '*').split(',') });
  console.log(`bucket ${r.bucket}: ${r.created ? 'created' : 'already exists'}`);
}
const saved = await putFile(PNG, 'healthcheck');
const res = await fetch(saved.secure_url);
console.log(`upload ok -> ${saved.secure_url} (public GET: HTTP ${res.status})`);
await deleteFile(saved.public_id);
console.log(`public base url: ${publicBaseUrl()}`);
if (res.status !== 200) console.log('NOTE: objects are not publicly readable (fine for a private bucket; use signed URLs or CloudFront).');
