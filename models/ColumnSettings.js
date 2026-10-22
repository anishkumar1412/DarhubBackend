import AuditFields from './auditFields.js';

/**
 * Admin table column settings (label, width, sorting/filtering per module). Column.controller.js used this model,
 * but it was never defined, so every /admin/*Col endpoint answered 500. Maps the existing COLUMN_SETTINGS table.
 */
const ColumnSettings = (sequelize, DataTypes) => sequelize.define('ColumnSettings', {
  module: { type: DataTypes.INTEGER, allowNull: false },
  label: { type: DataTypes.STRING, allowNull: false },
  key: { type: DataTypes.STRING, allowNull: false, unique: true },
  characters: { type: DataTypes.INTEGER, defaultValue: 20 },
  is_sortable: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_filterable: { type: DataTypes.BOOLEAN, defaultValue: false },
  filter_type: { type: DataTypes.ENUM('Text Box', 'Calendar'), defaultValue: 'Text Box' },
  ...AuditFields,
}, {
  tableName: 'COLUMN_SETTINGS',
  timestamps: false,
});

export default ColumnSettings;
