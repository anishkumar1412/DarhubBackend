import AuditFields from './auditFields.js';

const InventoryDrone = (sequelize, DataTypes) =>
  sequelize.define(
    'InventoryDrone',
    {
      drone_code: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'e.g. DRN-001',
      },
      drone_type: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'e.g. (EFT E416P)',
      },
      pilot: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'Unassigned',
      },
      location: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      current_mission: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Active (Flying), Idle (On Site), In Maintenance',
      },
      attached_parts: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Summary text of attached components',
      },
      ...AuditFields,
    },
    {
      tableName: 'INVENTORY_DRONE',
    }
  );

export default InventoryDrone;
