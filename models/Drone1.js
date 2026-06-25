import AuditFields from "./auditFields.js";

/*
  DRONE table — updated to own its assigned pilot + co-pilot.

  Why pilot_user_id / co_pilot_user_id here?
  ─────────────────────────────────────────────
  A physical drone is always operated by a fixed crew.
  When admin assigns a drone to a booking, the system
  automatically knows which pilot and co-pilot come with it.
  This removes the need for the admin to pick crew separately.

  acres_per_day:
  ─────────────
  How many acres this drone can spray in one working day.
  Used to auto-calculate estimated_days = ceil(land_in_acers / acres_per_day).
  Example: 20 acres ÷ 5 acres/day = 4 days.

  daily_status (NEW):
  ────────────────────
  Boolean field representing whether the drone is marked as ACTIVE
  for the current day. Resets to FALSE automatically at midnight via a
  scheduled job (see controllers/droneStatus.controller.js).
  The assigned pilot must manually set this to TRUE each morning
  to indicate the drone is operational and available for that day.

  daily_status_date (NEW):
  ─────────────────────────
  Stores the date when daily_status was last set to TRUE. Used by the
  reset job to detect stale activations and zero them out.
*/
const Drone = (sequelize, DataTypes) =>
  sequelize.define(
    "Drone",
    {
      owner_id:           DataTypes.INTEGER,
      model:              DataTypes.STRING,
      name:               DataTypes.STRING,
      range:              DataTypes.FLOAT,
      speed:              DataTypes.FLOAT,
      weight:             DataTypes.FLOAT,
      is_level_sensor:    DataTypes.BOOLEAN,
      level_sensor_id:    DataTypes.INTEGER,
      is_allen_key:       DataTypes.BOOLEAN,
      allen_key_id:       DataTypes.INTEGER,
      water_pump_id:      DataTypes.INTEGER,
      is_extension_board: DataTypes.BOOLEAN,
      extension_board_id: DataTypes.INTEGER,

      /* ── EXISTING FIELDS ───────────────────────────────── */
      pilot_user_id: {
        type:      DataTypes.INTEGER,
        allowNull: true,
        comment:   "User assigned as the primary pilot for this drone",
      },
      co_pilot_user_id: {
        type:      DataTypes.INTEGER,
        allowNull: true,
        comment:   "User assigned as the co-pilot for this drone",
      },
      acres_per_day: {
        type:         DataTypes.FLOAT,
        allowNull:    true,
        defaultValue: 5,
        comment:      "How many acres this drone can spray per working day. Default 5.",
      },

      /* ── NEW: DAILY ACTIVATION STATUS ──────────────────── */
      daily_status: {
        type:         DataTypes.BOOLEAN,
        allowNull:    false,
        defaultValue: false,
        comment:
          "TRUE = pilot has marked this drone as active for today. " +
          "Resets to FALSE automatically at midnight each day.",
      },
      daily_status_date: {
        type:      DataTypes.DATEONLY,
        allowNull: true,
        comment:
          "The calendar date (YYYY-MM-DD) on which daily_status was last set to TRUE. " +
          "Used by the nightly reset job to identify stale activations.",
      },
      /* ─────────────────────────────────────────────────── */

      ...AuditFields,
    },
    {
      tableName: "DRONE",
    }
  );

export default Drone;