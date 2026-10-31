import app from './app.js';
import db, { syncPromise } from './models/index.js';
import env from './config/env.js';
import logger from './utils/logger.js';
import { initCronJobs } from './cron/jobs.js';
import { verifyEmailConnection } from './services/email.service.js';
import { bootstrapSuperAdmin } from './bootstrap/superAdmin.bootstrap.js';
import { closeRateStore, logRateStoreStatus } from './services/rateStore.js';
import { pendingMigrations } from './utils/migrationStatus.js';

const PORT = env.PORT || 5678;
const HOST = "0.0.0.0";
const isProduction = env.NODE_ENV === 'production';

// ── Graceful Shutdown ─────────────────────────────────────────────
let shuttingDown = false;
const shutdown = (reason, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${reason}. Shutting down gracefully.`);

  // Never hang forever on a stuck connection
  setTimeout(() => {
    logger.error('Graceful shutdown timed out; forcing exit.');
    process.exit(exitCode || 1);
  }, 10_000).unref();

  server.close(async () => {
    logger.info('HTTP server closed.');
    try {
      await closeRateStore();
      await db.sequelize.close();
      logger.info('Database and Redis connections closed.');
    } catch (err) {
      logger.error(`Error closing database connections: ${err.message}`);
    }
    process.exit(exitCode);
  });
};

// ── Uncaught Exception / Rejection Handlers ───────────────────────
// After an uncaught exception the process state is unknown: log it, finish what can be finished, and exit so the
// platform restarts a clean instance.
process.on('uncaughtException', (err) => {
  logger.error(`UNCAUGHT EXCEPTION: ${err.message}`, { stack: err.stack });
  shutdown('Uncaught exception', 1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`UNHANDLED REJECTION: ${reason instanceof Error ? reason.stack : reason}`);
});

process.on('SIGTERM', () => shutdown('SIGTERM received'));
process.on('SIGINT', () => shutdown('SIGINT received'));

// ── Start ─────────────────────────────────────────────────────────
// The schema comes from the migrations (`npm run db:migrate`). On boot we only check that none is pending: serving
// traffic against an older schema fails request by request, so a production start with pending migrations stops here.
// `sync({ alter: true })` below is opt-in (DB_SYNC_ALTER=true) and meant for throwaway databases only: it rewrites
// table definitions to match the models, and every run can add duplicate constraints.
const ALTER_SYNC_MODELS = [
  'Fertilizer',
  'Warehouse', 'WarehouseLocation', 'WarehouseAdditional',
  'User', 'UserProfile', 'UserAddress', 'UserUpiDetails', 'UserBankDetails', 'UserDocuments', 'OtpVerification',
  'SprayingOrderExtras', 'SprayingOrderAddress',
];

const server = app.listen(PORT, HOST, async () => {
  logger.info(`🚀 Server running on http://${HOST}:${PORT}`);
  initCronJobs();

  // Not awaited: an unreachable mail server or Redis must not delay startup
  verifyEmailConnection();
  logRateStoreStatus().catch(() => {});

  try {
    await syncPromise;

    const pending = await pendingMigrations(db.sequelize);
    if (pending.length) {
      const message = `${pending.length} database migration(s) not applied (first: ${pending[0]}). Run \`npm run db:migrate\` before starting the server.`;
      if (isProduction && !env.SKIP_MIGRATION_CHECK) {
        logger.error(`❌ ${message}`);
        shutdown('Pending database migrations', 1);
        return;
      }
      logger.warn(`⚠️  ${message}`);
    }

    if (env.DB_SYNC_ALTER) {
      for (const name of ALTER_SYNC_MODELS) {
        await db[name].sync({ alter: true });
      }
      logger.info('✅ Tables synchronized (alter) successfully (DB_SYNC_ALTER=true).');
    }
  } catch (syncErr) {
    logger.error(`❌ Failed to check/synchronize database tables: ${syncErr.message}`, { stack: syncErr.stack });
  }

  try {
    await bootstrapSuperAdmin();
  } catch (bootErr) {
    logger.error(`❌ Super-admin bootstrap failed: ${bootErr.message}`, { stack: bootErr.stack });
  }

  // ── Self-Ping to Keep Render Free Tier Awake ───────────────────────
  // Runs where the server is hosted on Render (Render sets RENDER_EXTERNAL_URL to the service's own address), or
  // wherever SELF_PING_URL is set. It used to run whenever NODE_ENV was "development", i.e. on every developer
  // machine, pinging the production URL, and never on a production instance.
  const PING_URL = process.env.SELF_PING_URL || process.env.RENDER_EXTERNAL_URL;
  if (PING_URL) {
    const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes

    setInterval(async () => {
      try {
        const response = await fetch(PING_URL);
        logger.info(`[Self-Ping] Pinged ${PING_URL}. Status: ${response.status}`);
      } catch (err) {
        logger.error(`[Self-Ping] Failed to ping ${PING_URL}: ${err.message}`);
      }
    }, PING_INTERVAL).unref();
  }
});

// Slightly above common load-balancer idle timeouts (60s), so a keep-alive connection is never reset mid-request
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
