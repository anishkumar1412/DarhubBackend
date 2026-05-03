import { DataTypes } from 'sequelize';
import sequelize from "./index.js"

import AuditFields from './auditFields.js';
// const DronePropeller =(sequelize, DataTypes) => sequelize.define('DronePropeller', {
//   drone_id: DataTypes.INTEGER,
//   propeller_id: DataTypes.INTEGER,
//   propeller_qty: DataTypes.INTEGER,
//   ...AuditFields,
// }, {
//   tableName: 'DRONE_PROPELLER',
// });

// export default DronePropeller;

export default (sequelize, DataTypes) => {
  const DronePropeller = sequelize.define("DronePropeller", {
    // define fields
     drone_id: DataTypes.INTEGER,
  propeller_id: DataTypes.INTEGER,
  propeller_qty: DataTypes.INTEGER,
  ...AuditFields,
  }, {});

  return DronePropeller;
};
