import express from "express";
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Models ────────────────────────────────────────────────────────
// dotenv is loaded inside config/env.js using an absolute path,
// which is imported first by models/index.js → config/db.js → config/env.js.
// No dotenv.config() call needed here.
import db, { syncPromise } from './models/index.js';

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

// ── Services / bootstrap ──────────────────────────────────────────
import { verifyEmailConnection } from "./services/email.service.js";
import { bootstrapSuperAdmin } from "./bootstrap/superAdmin.bootstrap.js";
import droneStatusRouter from "./routes/droneStatus.routes.js";   // ← NEW

// Pilot maintenance
import pilotMaintenanceRouter from "./routes/pilotMaintenanceRoutes.js";


const app = express();
const PORT = process.env.PORT || 5678;
const HOST = "0.0.0.0";

// ── Middlewares ───────────────────────────────────────────────────
app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Rate Limiting ─────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5174",
    "https://darhubfrontend.onrender.com",
    "https://darhubadmin.onrender.com"
  ],
  credentials: true,
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Apply the rate limiter to all api routes
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

// ── Routes ────────────────────────────────────────────────────────

// Existing routes
app.use('/admin', router);
app.use('/api', userRouter);
app.use('/api/locations', locationRoutes);
app.use('/order', orderRouter);
app.use('/crops', cropRouter);
app.use('/working-days', workingDaysRouter);
app.use('/api/fertilizers', fertilizerRouter);
app.use('/api/warehouses', warehouseRouter);

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
app.use('/inventory', inventoryRouter);

app.use('/api/inventory', inventoryRouter);

app.use('/api/inventory', droneStatusRouter);

// Pilot maintenance task form
app.use('/api/pilot/maintenance', pilotMaintenanceRouter);

// ── Global error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  logger.error(`[${req.method}] ${req.url} - ${err.message}`, { stack: err.stack });

  const isProduction = process.env.NODE_ENV === 'production';
  return res.status(statusCode).json({
    success: false,
    message: isProduction && statusCode === 500 ? 'Internal Server Error' : err.message,
    errors: isProduction ? undefined : (err.errors || []),
  });
});

// ── Uncaught Exception / Rejection Handlers ───────────────────────
process.on('uncaughtException', (err) => {
  logger.error(`UNCAUGHT EXCEPTION: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`UNHANDLED REJECTION: ${reason}`);
});

// ── Start ─────────────────────────────────────────────────────────
const server = app.listen(PORT, HOST, async () => {
  logger.info(`🚀 Server running on http://${HOST}:${PORT}`);
  await verifyEmailConnection();
  await syncPromise;
  try {
    await db.Fertilizer.sync({ alter: true });
    console.log("✅ Fertilizer table synchronized successfully.");
    await db.Warehouse.sync({ alter: true });
    await db.WarehouseLocation.sync({ alter: true });
    await db.WarehouseAdditional.sync({ alter: true });
    console.log("✅ Warehouse, WarehouseLocation, and WarehouseAdditional tables synchronized successfully.");
    await db.User.sync({ alter: true });
    await db.UserProfile.sync({ alter: true });
    await db.UserAddress.sync({ alter: true });
    await db.UserUpiDetails.sync({ alter: true });
    await db.UserBankDetails.sync({ alter: true });
    await db.UserDocuments.sync({ alter: true });
    await db.OtpVerification.sync({ alter: true });
    console.log("✅ User profile, address, bank, UPI, Document, and OTP verification tables synchronized successfully.");
  } catch (syncErr) {
    console.error("❌ Failed to synchronize database tables:", syncErr);
  }
  await bootstrapSuperAdmin();

  // ── Self-Ping to Keep Render Free Tier Awake ───────────────────────
  if (process.env.NODE_ENV === 'development') {
    const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes
    const PING_URL = 'https://darhubbackend.onrender.com';

    setInterval(async () => {
      try {
        const response = await fetch(PING_URL);
        console.log(`[Self-Ping] Successfully pinged ${PING_URL}. Status: ${response.status}`);
      } catch (err) {
        console.error(`[Self-Ping] Failed to ping ${PING_URL}:`, err.message);
      }
    }, PING_INTERVAL);
  }
});

// ── Graceful Shutdown ─────────────────────────────────────────────
const shutdown = () => {
  logger.info('SIGTERM/SIGINT received. Shutting down gracefully.');
  server.close(() => {
    logger.info('HTTP server closed.');
    // db.sequelize.close() could be called here if db was imported
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
