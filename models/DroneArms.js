import { DataTypes } from "sequelize";
import sequelize from "./index.js"


import AuditFields from "./auditFields.js";


// const DroneArms  = (sequelize, DataTypes) => sequelize.define('DroneArms', {
//   drone_id: DataTypes.INTEGER,
//   arms_id: DataTypes.INTEGER,
//   arms_qty: DataTypes.INTEGER,
//   ...AuditFields,
// }, {
//   tableName: 'DRONE_ARMS',
// });

// export default DroneArms;

export default (sequelize, DataTypes) => {
  const DroneArms = sequelize.define("DroneArms", {
    // define fields
     drone_id: DataTypes.INTEGER,
     arms_id: DataTypes.INTEGER,
     arms_qty: DataTypes.INTEGER,
  ...AuditFields,
  }, {});

  return DroneArms;
};