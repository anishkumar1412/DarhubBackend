import AuditFields from './auditFields.js';

/**
 * PILOT_MAINTENANCE_TASK
 * ──────────────────────
 * Main record for a pilot-submitted maintenance task form.
 * Maps to the "Maintenance Task Form" UI.
 *
 * health_score is CALCULATED from the associated checklist items:
 *   Good / Updated  = 100
 *   Wear & Tear     = 70
 *   Damaged         = 30
 *   Needs Replacement = 0
 *   health_score = ROUND(AVG(component_scores))
 *
 * engineer_id is a FK → USER.id (the engineer assigned to the task).
 */
const PilotMaintenanceTask = (sequelize, DataTypes) =>
  sequelize.define(
    'PilotMaintenanceTask',
    {
      // ── Reference ────────────────────────────────────────
      task_ref: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: 'Auto-generated reference e.g. MNT-TASK-1718972400000',
      },

      // ── Drone info (snapshot at time of logging) ─────────
      drone_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'FK → DRONE.id',
      },
      drone_code: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. DRN-217-A (snapshot)',
      },
      drone_name: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. DJI Agras T30 (snapshot)',
      },
      drone_model: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Model name (snapshot)',
      },
      drone_status: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'Active',
        comment: 'Active, Inactive, Under Maintenance',
      },
      total_flight_time: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. 142 hrs 30 mins',
      },
      total_flights: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Total number of flights',
      },
      last_maintenance_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'Date of previous maintenance',
      },

      // ── Health Score (CALCULATED from checklist) ─────────
      health_score: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment:
          'Calculated: avg of checklist component scores. ' +
          'Good/Updated=100, Wear&Tear=70, Damaged=30, NeedsReplacement=0',
      },

      // ── Pilot ────────────────────────────────────────────
      pilot_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'FK → USER.id (logged-in pilot)',
      },

      // ── Task metadata ────────────────────────────────────
      maintenance_type: {
        type: DataTypes.ENUM(
          'Scheduled Maintenance',
          'Unscheduled Maintenance',
          'Emergency'
        ),
        allowNull: false,
        defaultValue: 'Scheduled Maintenance',
      },
      task_name: {
        type: DataTypes.ENUM(
          'Routine Inspection',
          'Component Replacement',
          'Firmware Update',
          'Deep Cleaning',
          'Repair'
        ),
        allowNull: false,
        defaultValue: 'Routine Inspection',
      },
      scheduled_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'Planned maintenance date',
      },
      actual_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: 'Actual execution date',
      },

      // ── Engineer (FK to USER) ────────────────────────────
      engineer_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'FK → USER.id (assigned engineer)',
      },

      // ── Overall status ───────────────────────────────────
      overall_status: {
        type: DataTypes.ENUM('Good', 'Minor Issues', 'Major Issues', 'Critical'),
        allowNull: true,
        comment: 'Overall maintenance status selected by pilot',
      },

      // ── Engineer notes ───────────────────────────────────
      engineer_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Free text, max 500 chars',
      },

      // ── Form workflow ────────────────────────────────────
      form_status: {
        type: DataTypes.ENUM('draft', 'submitted'),
        allowNull: false,
        defaultValue: 'draft',
        comment: 'draft = Save Draft, submitted = Submit Report',
      },

      ...AuditFields,
    },
    {
      tableName: 'PILOT_MAINTENANCE_TASK',
    }
  );

export default PilotMaintenanceTask;
