import AuditFields from './auditFields.js';

/**
 * MAINTENANCE_ITEM
 * ─────────────────
 * Line items belonging to a MaintenanceLog. Multiple items can belong
 * to one maintenance log (replacement parts, damaged parts, etc.)
 *
 * amount = quantity * price  (calculated, not stored as user input —
 * but persisted here for fast aggregation / historical snapshot).
 *
 * total_amount on MAINTENANCE_LOG = SUM(amount) across all items
 * belonging to that log.
 */
const MaintenanceItem = (sequelize, DataTypes) =>
  sequelize.define(
    'MaintenanceItem',
    {
      maintenance_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'FK -> MAINTENANCE_LOG.id',
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'FK -> INVENTORY_ACCESSORY.id (the product/part used)',
      },
      type: {
        type: DataTypes.ENUM('replacement', 'damaged'),
        allowNull: false,
        defaultValue: 'replacement',
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      price: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Price per unit at time of logging',
      },
      amount: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Calculated: quantity * price',
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      ...AuditFields,
    },
    {
      tableName: 'MAINTENANCE_ITEM',
    }
  );

export default MaintenanceItem;