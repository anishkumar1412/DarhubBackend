import AuditFields from './auditFields.js';

const SalesOrder = (sequelize, DataTypes) =>
  sequelize.define(
    'SalesOrder',
    {
      sales_order_no: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: 'Auto-generated sales order number',
      },
      customer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'FK to User (Pilot or Owner raising complaint)',
      },
      maintenance_task_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'FK to PilotMaintenanceTask if created from a maintenance form',
      },
      order_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('Pending', 'Approved', 'Shipped', 'Delivered', 'Cancelled'),
        allowNull: false,
        defaultValue: 'Pending',
      },
      total_amount: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
      },
      ...AuditFields,
    },
    {
      tableName: 'SALES_ORDER',
    }
  );

export default SalesOrder;
