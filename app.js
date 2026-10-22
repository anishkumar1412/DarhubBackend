import express from "express";
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import helmet from 'helmet';
import { randomUUID } from 'crypto';
import logger from './utils/logger.js';
import env from './config/env.js';
import { errorHandler, notFoundHandler, hideServerErrorDetails } from './middleware/errorHandler.js';
import { createApiLimiter, createAuthLimiter } from './middleware/rateLimiters.js';
import { authenticateAdmin } from './middleware/adminAuth.middleware.js';
import { checkRouteParams } from './middleware/params.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Models ────────────────────────────────────────────────────────
// dotenv is loaded inside config/env.js using an absolute path,
// which is imported first by models/index.js → config/db.js → config/env.js.
// No dotenv.config() call needed here.
import db from './models/index.js';
import { getRateStore } from './services/rateStore.js';

// ── Route imports ─────────────────────────────────────────────────
import router from "./routes/adminRoutes.js";
import userRouter from "./routes/user.routes.js";
import locationRoutes from "./routes/locationRoutes.js";
import orderRouter from "./routes/orderRoutes.js";
import cropRouter from "./routes/cropRoutes.js";
import workingDaysRouter from "./routes/workingDaysRoutes.js";
import fertilizerRouter from "./routes/fertilizerRoutes.js";
import warehouseRouter from "./routes/warehouseRoutes.js";

// Admin auth + management
import adminAuthRouter from "./routes/adminAuthRoutes.js";
import adminAccountRouter from "./routes/adminAccountRoutes.js";
import rolesRouter from "./routes/rolesRoutes.js";
import privilegesRouter from "./routes/privilegesRoutes.js";
import rolePrivilegesRouter from "./routes/rolePrivilegesRoutes.js";
import userRolesRouter from "./routes/userRolesRoutes.js";

// Inventory dashboard
import inventoryRouter from "./routes/inventoryRoutes.js";

// ── Routers that need no service bootstrap ─────────────────────────
import droneStatusRouter from "./routes/droneStatus.routes.js";   // ← NEW

// Pilot maintenance
import pilotMaintenanceRouter from "./routes/pilotMaintenanceRoutes.js";
import vendorRouter from "./routes/vendorRoutes.js";

// Pilot work updates
import pilotWorkRouter from "./routes/pilotWork.routes.js";

// Farmer-facing booking API
import farmerRouter from "./routes/farmerRoutes.js";

const app = express();
const isProduction = env.NODE_ENV === 'production';

// Behind a reverse proxy (Render, nginx, a load balancer) every request would otherwise appear to come from the
// proxy's own address: all users would share ONE rate-limit bucket and req.ip would be useless.
app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by');

// ── Middlewares ───────────────────────────────────────────────────
// Every request gets an id, returned in the X-Request-Id header and in error bodies, so a failure reported by a
// pilot can be found in the logs.
app.use((req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w.-]{1,64}$/.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
});

// Log failures and slow calls (not every request)
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    if (res.statusCode >= 500 || ms > 3000) {
      logger.warn(`[${req.method}] ${req.originalUrl} -> ${res.statusCode} in ${ms}ms (request ${req.id})`);
    }
  });
  next();
});

app.use(hideServerErrorDetails);
app.use(helmet());

// CORS before the rate limiters: a 429 without CORS headers shows up in the browser as a confusing CORS error.
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5174",
  "https://darhubfrontend.onrender.com",
  "https://darhubadmin.onrender.com",
  ...env.CORS_ORIGINS,
];
// Browsers may only read these response headers when they are listed (request id for support, idempotent replays)
app.use(cors({ origin: allowedOrigins, credentials: true, exposedHeaders: ['X-Request-Id', 'Idempotency-Key', 'Idempotent-Replayed', 'Retry-After'] }));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
// Express 5 leaves req.body undefined when a request has no body, and handlers written as `const { x } = req.body`
// then crash with a 500 (e.g. POST /order/update-work/:id without a form). An empty object is what they expect.
// (multer replaces it with the form fields on multipart routes.)
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// ── Rate Limiting ─────────────────────────────────────────────────
// General API: generous and counted per signed-in user; sign-in/OTP/password routes: strict and counted per IP.
const apiLimiter = createApiLimiter(env.RATE_LIMIT_MAX);
const authLimiter = createAuthLimiter(30);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(['/api/login', '/api/otp', '/admin/auth/login', '/admin/auth/forgot-password',
  '/admin/auth/reset-password', '/admin/auth/setup-password'], authLimiter);

// Apply the general limiter to all api routes
app.use('/api', apiLimiter);
app.use('/admin', apiLimiter);
app.use('/order', apiLimiter);
app.use('/crops', apiLimiter);
app.use('/inventory', apiLimiter);

// ── Swagger ───────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  const swaggerDocument = yaml.load(
    fs.readFileSync(path.join(__dirname, 'swagger.yaml'), 'utf8')
  );
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

// ── Health ────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Welcome to DARHUB Backend"));

// For load balancers / uptime monitors: 200 only when the database answers too
app.get("/health", async (req, res) => {
  try {
    await Promise.race([
      db.sequelize.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('database timeout')), 3000)),
    ]);
    // Redis is reported but does not fail the check: OTP limits fall back to memory when it is down
    res.status(200).json({ status: 'ok', redis: await getRateStore().status(), uptime_seconds: Math.round(process.uptime()) });
  } catch (err) {
    logger.error(`Health check failed: ${err.message}`);
    res.status(503).json({ status: 'unavailable' });
  }
});

// ── Routes ────────────────────────────────────────────────────────

// Malformed ids in the URL ("abc" for a number, "123" for a booking UUID) are a 400 before any handler runs
[router, userRouter, locationRoutes, orderRouter, cropRouter, workingDaysRouter, fertilizerRouter, warehouseRouter,
  adminAuthRouter, adminAccountRouter, rolesRouter, privilegesRouter, rolePrivilegesRouter, userRolesRouter,
  inventoryRouter, droneStatusRouter, pilotMaintenanceRouter, vendorRouter, pilotWorkRouter, farmerRouter,
].forEach(checkRouteParams);

// Existing routes
app.use('/api', userRouter);
app.use('/api/locations', locationRoutes);
app.use('/api/pilot/work', pilotWorkRouter);

// ── Who may call what ─────────────────────────────────────────────
// These areas are the admin panel's back office (catalogues, inventory, vendors, pricing rules). They used to be
// open to anyone who knew the URL: anybody could read, change or delete them. Routes that farmers or pilots use
// (orders, users, locations, registration) are protected route by route in their own files.
const adminOnly = authenticateAdmin;
app.use('/order', orderRouter);
app.use('/crops', adminOnly, cropRouter);
app.use('/working-days', adminOnly, workingDaysRouter);
app.use('/api/fertilizers', adminOnly, fertilizerRouter);
app.use('/api/warehouses', adminOnly, warehouseRouter);

// Admin auth (login, setup-password, forgot-password, reset-password, me, create-admin)
app.use('/admin/auth', adminAuthRouter);

// Admin account (change-password, profile, list/delete admins, resend-setup)
app.use('/admin/account', adminAccountRouter);

// Roles CRUD
app.use('/admin/roles', rolesRouter);

// Privileges CRUD
app.use('/admin/privileges', privilegesRouter);

// Role ↔ Privilege assignments
app.use('/admin/role-privileges', rolePrivilegesRouter);

// User ↔ Role assignments
app.use('/admin/user-roles', userRolesRouter);

// Inventory dashboard
app.use('/inventory', adminOnly, inventoryRouter);

app.use('/api/inventory', adminOnly, inventoryRouter);

app.use('/api/inventory', adminOnly, droneStatusRouter);

// Generic admin routes (drones, comments, columns, logs). Mounted after the /admin/* sub-routers above so the
// public login/setup/reset routes under /admin/auth are not caught by this guard.
app.use('/admin', adminOnly, router);

// Pilot maintenance task form
app.use('/api/pilot/maintenance', pilotMaintenanceRouter);

// Vendor management
app.use('/api/vendors', adminOnly, vendorRouter);

// Farmer-facing booking API
app.use('/api/farmer', farmerRouter);

// ── 404 + global error handler (must be last) ─────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
