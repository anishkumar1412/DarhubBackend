import AuditFields from './auditFields.js';

/**
 * PILOT_MAINTENANCE_CHECKLIST
 * ────────────────────────────
 * One row per component inspection within a PilotMaintenanceTask.
 * Typically 8 rows per task matching the UI checklist:
 *   1. Airframe & Structure
 *   2. Propulsion System
 *   3. Propellers
 *   4. Spray System
 *   5. Battery Health
 *   6. Electronics & Sensors
 *   7. Firmware & Calibration
 *   8. General Condition
 *
 * The actual_status value feeds into the parent task's health_score
 * calculation:
 *   Good / Updated         → 100 points
 *   Wear & Tear            → 70  points
 *   Damaged                → 30  points
 *   Needs Replacement      → 0   points
 *
 *   health_score = ROUND(AVG(all component points))
 */
const PilotMaintenanceChecklist = (sequelize, DataTypes) =>
  sequelize.define(
    'PilotMaintenanceChecklist',
    {
      task_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'FK → PILOT_MAINTENANCE_TASK.id',
      },
      component: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'e.g. Airframe & Structure',
      },
      component_description: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. Check frame, arms, landing gear',
      },
      expected_status: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'Good',
        comment: 'Expected status before inspection',
      },
      actual_status: {
        type: DataTypes.ENUM(
          'Good',
          'Wear & Tear',
          'Damaged',
          'Needs Replacement',
          'Updated'
        ),
        allowNull: true,
        defaultValue: 'Good',
        comment: 'Actual status after inspection',
      },
      remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Inspector's findings / notes",
      },

      ...AuditFields,
    },
    {
      tableName: 'PILOT_MAINTENANCE_CHECKLIST',
    }
  );

export default PilotMaintenanceChecklist;
