import AuditFields from './auditFields.js';

/**
 * PILOT_MAINTENANCE_ATTACHMENT
 * ─────────────────────────────
 * Photo / file attachments linked to a PilotMaintenanceTask.
 * Files are uploaded to Cloudinary; this table stores the URL + metadata.
 * Max 10 MB per file (enforced at route level via multer).
 */
const PilotMaintenanceAttachment = (sequelize, DataTypes) =>
  sequelize.define(
    'PilotMaintenanceAttachment',
    {
      task_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'FK → PILOT_MAINTENANCE_TASK.id',
      },
      file_url: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: 'Cloudinary URL of the uploaded file',
      },
      file_name: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Original filename',
      },
      file_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'File size in bytes',
      },

      ...AuditFields,
    },
    {
      tableName: 'PILOT_MAINTENANCE_ATTACHMENT',
    }
  );

export default PilotMaintenanceAttachment;
