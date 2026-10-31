import { randomUUID } from 'crypto';
import {
  S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from '../utils/logger.js';

/**
 * S3 file storage. The same code talks to Floci (local AWS emulator) and to real AWS S3:
 *   - Floci / any emulator: set S3_ENDPOINT (e.g. http://localhost:4566); path-style addressing is switched on.
 *   - Real AWS: leave S3_ENDPOINT empty; credentials come from S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY or, better,
 *     from the server's IAM role (leave both empty).
 * Selected with STORAGE_PROVIDER=s3 (default is cloudinary, see middleware/upload.js).
 */

const cfg = () => ({
  bucket: process.env.S3_BUCKET || 'darhub-uploads',
  region: process.env.S3_REGION || process.env.AWS_REGION || 'ap-south-1',
  endpoint: process.env.S3_ENDPOINT || undefined,
  publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || '',
});

let client;
const getClient = () => {
  if (client) return client;
  const { region, endpoint } = cfg();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  client = new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  });
  return client;
};

/** Public URL base: CloudFront/custom domain if given, else the bucket address (path-style for an emulator). */
export const publicBaseUrl = () => {
  const { bucket, region, endpoint, publicBaseUrl: custom } = cfg();
  if (custom) return custom.replace(/\/+$/, '');
  if (endpoint) return `${endpoint.replace(/\/+$/, '')}/${bucket}`;
  return `https://${bucket}.s3.${region}.amazonaws.com`;
};

/** File type from the first bytes, so a renamed/forged file cannot be stored as something it is not. */
export const sniffContentType = (buf) => {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: 'image/png', ext: 'png' };
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return { type: 'application/pdf', ext: 'pdf' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
};

/**
 * Stores a file. Returns { public_id, secure_url } (the shape the Cloudinary helper returned, so the controllers and
 * the *_new_name / *_url columns need no change): public_id is the object key, secure_url the public address.
 */
export const putFile = async (buffer, folder = 'users') => {
  const detected = sniffContentType(buffer);
  if (!detected) {
    const err = new Error('Unsupported file content. Allowed: JPG, PNG, WEBP, PDF.');
    err.status = 400;
    err.statusCode = 400;
    throw err;
  }
  const { bucket } = cfg();
  const key = `${String(folder).replace(/^\/+|\/+$/g, '')}/${randomUUID()}.${detected.ext}`;
  await getClient().send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: buffer, ContentType: detected.type, CacheControl: 'public, max-age=31536000, immutable',
  }));
  return { public_id: key, secure_url: `${publicBaseUrl()}/${key}`, bucket };
};

/** Removes an object by key. Never throws (a missing object is already the wanted end state). */
export const deleteFile = async (key) => {
  if (!key) return;
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: cfg().bucket, Key: key }));
  } catch (err) {
    logger.warn(`Could not delete ${key} from storage: ${err.message}`);
  }
};

/** Temporary link to a private object (for KYC documents once the bucket is not public). */
export const signedUrl = (key, expiresInSeconds = 300) =>
  getSignedUrl(getClient(), new GetObjectCommand({ Bucket: cfg().bucket, Key: key }), { expiresIn: expiresInSeconds });

/** True when `url` points into our bucket (used to accept only photos this server stored). */
export const isOwnFileUrl = (url) => typeof url === 'string' && url.startsWith(`${publicBaseUrl()}/`);

/** Creates the bucket (and CORS) when missing. Used by scripts/init-storage.js and the emulator, not by production. */
export const ensureBucket = async ({ corsOrigins = ['*'] } = {}) => {
  const { bucket, region } = cfg();
  const s3 = getClient();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return { bucket, created: false };
  } catch {
    await s3.send(new CreateBucketCommand({
      Bucket: bucket,
      ...(region !== 'us-east-1' ? { CreateBucketConfiguration: { LocationConstraint: region } } : {}),
    }));
  }
  await s3.send(new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: { CORSRules: [{ AllowedMethods: ['GET', 'HEAD'], AllowedOrigins: corsOrigins, AllowedHeaders: ['*'], MaxAgeSeconds: 3600 }] },
  })).catch((err) => logger.warn(`Could not set bucket CORS: ${err.message}`));
  return { bucket, created: true };
};

export const storageHealth = async () => {
  await getClient().send(new HeadBucketCommand({ Bucket: cfg().bucket }));
  return { ok: true, bucket: cfg().bucket };
};
