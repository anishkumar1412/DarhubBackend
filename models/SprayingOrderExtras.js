import { DataTypes } from 'sequelize';
import AuditFields from './auditFields.js';

/**
 * SprayingOrderExtras
 * ───────────────────
 * One-to-one extension table for SprayingOrder.
 * Stores farmer-app–specific data that would pollute the core order row:
 *   • Payment breakdown (invoice, online/cash split, refund)
 *   • Service metadata (spray solution, application rate, duration)
 *   • Live-snapshot (pilot location, progress % during ONGOING jobs)
 *   • Company support info (fetched once and cached per order)
 *   • Farmer rating submitted after COMPLETED jobs
 *   • Cancellation reason
 *   • Scheduled time window ("08:30 AM - 10:30 AM")
 */
const SprayingOrderExtras = (sequelize, DataTypes) =>
  sequelize.define(
    'SprayingOrderExtras',
    {
      // FK back to SPRAYING_ORDER
      booking_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        primaryKey: true,
      },

      // ── Scheduled Time Window ──────────────────────────────────
      scheduled_time: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. "08:30 AM - 10:30 AM"',
      },

      // ── Cancellation ───────────────────────────────────────────
      cancellation_reason: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // ── Farmer rating (after job is COMPLETED) ─────────────────
      farmer_rating: {
        type: DataTypes.INTEGER,   // 1–5; null = not yet rated
        allowNull: true,
      },

      // ── Service Details ────────────────────────────────────────
      service_title: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. "Rice Spraying Service"',
      },
      service_sub_category: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. "Aero Mark - Rice Spraying"',
      },
      spray_solution: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. "Recommended Mix"',
      },
      application_rate: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. "0.8 L/acre"',
      },
      rate_per_acre: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      service_duration_mins: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Total job duration in minutes',
      },

      // ── Payment Breakdown ──────────────────────────────────────
      invoice_no: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. "INV2505222001045"',
      },
      invoice_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      payment_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      payment_status_label: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. "Paid in Full"',
      },
      payment_method: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. "UPI", "Cash", "Online"',
      },
      base_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      discount_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },
      total_payable: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      online_amount_paid: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },
      online_txn_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      cash_amount_paid: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },
      cash_confirmation_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      refund_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      refund_status: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. "Refund Processed", "Pending"',
      },

      // ── Farmer billing address (for invoice) ──────────────────
      farmer_billing_address: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Full billing address string for invoice display',
      },

      // ── Pilot extra info (augments SprayingWorkAssignee) ──────
      pilot_rating: {
        type: DataTypes.DECIMAL(3, 1),
        allowNull: true,
        comment: 'e.g. 4.8',
      },
      pilot_review_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      pilot_experience_years: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      pilot_eta_minutes: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Only relevant for UPCOMING status',
      },
      pilot_distance_km: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: true,
        comment: 'Only relevant for UPCOMING status',
      },

      // ── Live snapshot (ONGOING jobs only) ─────────────────────
      live_progress_percentage: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '0–100',
      },
      live_est_completion_mins: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      live_area_completed_acres: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
      },
      live_remaining_area_acres: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
      },
      live_drone_distance_m: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      live_drone_speed_kmh: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      live_drone_altitude_m: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      live_last_updated_time: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Human-readable e.g. "10:45 AM"',
      },

      // ── Company support info ──────────────────────────────────
      company_support_phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      company_support_email: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // ── Post-job usage data (COMPLETED jobs) ─────────────────
      // When set by the admin/pilot after job completion these values
      // are used directly. The controller falls back to aggregating
      // SprayingDailyLogs.verification_comment JSON when these are null.
      usage_total_acres_covered: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
        comment: 'Total acres actually sprayed across all days',
      },
      usage_fertilizer_kg: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
        comment: 'Total fertilizer consumed (kg)',
      },
      usage_pesticide_ltr: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
        comment: 'Total pesticide consumed (litres)',
      },
      usage_water_ltr: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
        comment: 'Total water consumed (litres)',
      },

      ...AuditFields,
    },
    {
      tableName: 'SPRAYING_ORDER_EXTRAS',
    }
  );

export default SprayingOrderExtras;
