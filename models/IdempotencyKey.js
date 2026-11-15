/**
 * One row per Idempotency-Key a client sent (see middleware/idempotency.js).
 * The key is unique per user and per endpoint, so two users (or two endpoints) can never collide.
 */
const IdempotencyKey = (sequelize, DataTypes) => sequelize.define('IdempotencyKey', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  scope: {
    type: DataTypes.STRING(120),          // "POST /order/create-order"
    allowNull: false,
  },
  idem_key: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  request_hash: {
    type: DataTypes.STRING(64),           // sha256 of method + path + body: the same key may not be reused for another request
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING(20),           // processing | completed
    allowNull: false,
    defaultValue: 'processing',
  },
  response_status: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  response_body: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  locked_until: {
    type: DataTypes.DATE,                 // a request still "processing" after this moment crashed; a retry may take over
    allowNull: true,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  created_on: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  modified_on: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'IDEMPOTENCY_KEY',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['user_id', 'scope', 'idem_key'], name: 'idempotency_key_user_scope_key_uq' },
    { fields: ['expires_at'], name: 'idempotency_key_expires_at_idx' },
  ],
});

export default IdempotencyKey;
