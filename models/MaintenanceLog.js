import AuditFields from './auditFields.js';

const MaintenanceLog = (sequelize, DataTypes) =>
  sequelize.define(
    'MaintenanceLog',
    {
      date: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      log_ref: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'e.g. #MNT-892',
      },
      drone_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      drone_type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      component: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Affected component name',
      },
      component_sku: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      reason: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Root cause description',
      },
      action_taken: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      cost: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Display cost string e.g. ₹9,800',
      },
      cost_value: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
        comment: 'Numeric cost for aggregation',
      },
      status: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Resolved, In Progress, Pending Stock',
      },
      flight_hours: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      pilot: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      location: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      incident_date: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      pilot_statement: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      // Telemetry snapshot
      telemetry_batt: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      telemetry_rpm: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      telemetry_fc: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // Damaged component
      damaged_sku: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      damaged_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // Replacement part
      replacement_sku: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      replacement_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      replacement_serial: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // Financial audit
      original_cost: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
      },
      replacement_cost: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
      },
      labor_hours: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
      },
      total_impact: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // Approval
      approved_by: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      digital_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // Part inventory snapshot (at time of log)
      part_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      part_sku: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      current_stock: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      min_stock: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      unit_price: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      sales_order_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Manual linkage to SalesOrder',
      },
      pilot_task_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Manual linkage to PilotMaintenanceTask',
      },

      ...AuditFields,
    },
    {
      tableName: 'MAINTENANCE_LOG',
    }
  );

export default MaintenanceLog;
