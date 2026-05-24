import AuditFields from './auditFields.js';

/**
 * AdminProfile — linked 1:1 to User (user_type = 2)
 * Stores admin-specific info: full_name, setup/reset token, verification status
 */
const AdminProfile = (sequelize, DataTypes) =>
  sequelize.define(
    'AdminProfile',
    {
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
      },

      full_name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },

      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },

      // false until admin completes first-time password setup
      is_verified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      last_login: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      // SHA256-hashed token — raw token is emailed, hash is stored
      setup_token: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      setup_token_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      ...AuditFields,
    },
    {
      tableName: 'ADMIN_PROFILE',
      indexes: [
        { fields: ['email'] },
        { fields: ['user_id'] },
        { fields: ['setup_token'] },
      ],
    }
  );

export default AdminProfile;
