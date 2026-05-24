import express from "express";
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Models ────────────────────────────────────────────────────────
// dotenv is loaded inside config/env.js using an absolute path,
// which is imported first by models/index.js → config/db.js → config/env.js.
// No dotenv.config() call needed here.
import db, { syncPromise } from './models/index.js';

// ── Route imports ─────────────────────────────────────────────────
import router              from "./routes/adminRoutes.js";
import userRouter          from "./routes/user.routes.js";
import locationRoutes      from "./routes/locationRoutes.js";
import orderRouter         from "./routes/orderRoutes.js";
import cropRouter          from "./routes/cropRoutes.js";
import workingDaysRouter   from "./routes/workingDaysRoutes.js";

// Admin auth + management
import adminAuthRouter     from "./routes/adminAuthRoutes.js";
import adminAccountRouter  from "./routes/adminAccountRoutes.js";
import rolesRouter         from "./routes/rolesRoutes.js";
import privilegesRouter    from "./routes/privilegesRoutes.js";
import rolePrivilegesRouter from "./routes/rolePrivilegesRoutes.js";
import userRolesRouter     from "./routes/userRolesRoutes.js";

// ── Services / bootstrap ──────────────────────────────────────────
import { verifyEmailConnection } from "./services/email.service.js";
import { bootstrapSuperAdmin }   from "./bootstrap/superAdmin.bootstrap.js";

const app  = express();
const PORT = process.env.PORT || 5678;
const HOST = "0.0.0.0";

// ── Middlewares ───────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// ── Swagger ───────────────────────────────────────────────────────
const swaggerDocument = yaml.load(
  fs.readFileSync(path.join(__dirname, 'swagger.yaml'), 'utf8')
);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ── Health ────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Welcome to DARHUB Backend"));

// ── Routes ────────────────────────────────────────────────────────

// Existing routes
app.use('/admin',         router);
app.use('/api',           userRouter);
app.use('/api/locations', locationRoutes);
app.use('/order',         orderRouter);
app.use('/crops',         cropRouter);
app.use('/working-days',  workingDaysRouter);

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

// ── Global error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success:  false,
    message:  err.message || 'Internal Server Error',
    errors:   err.errors  || [],
  });
});

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, HOST, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await verifyEmailConnection();
  await syncPromise;
  await bootstrapSuperAdmin();
});
