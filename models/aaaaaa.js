const DroneBattery = (sequelize, DataTypes) => sequelize.define('DroneBattery', {
  drone_id: DataTypes.INTEGER,
  battery_id: DataTypes.INTEGER,
  battery_qty: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_BATTERY',
});

const DroneCharger = (sequelize, DataTypes) => sequelize.define('DroneCharger', {
  drone_id: DataTypes.INTEGER,
  charger_id: DataTypes.INTEGER,
  is_charger_cable: DataTypes.BOOLEAN,
  ischarger_pcable: DataTypes.BOOLEAN,
  ...AuditFields,
}, {
  tableName: 'DRONE_CHARGER',
});


const DroneController = (sequelize, DataTypes) => sequelize.define('DroneController', {
  drone_id: DataTypes.INTEGER,
  transmitter_id: DataTypes.INTEGER,
  receiver_id: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_CONTROLLER',
});

const DroneLandingGear =  (sequelize, DataTypes) => sequelize.define('DroneLandingGear', {
  drone_id: DataTypes.INTEGER,
  landing_gear_id: DataTypes.INTEGER,
  landing_gear_qty: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_LANDING_GEAR',
});

const DroneMotor = (sequelize, DataTypes) => sequelize.define('DroneMotor', {
  drone_id: DataTypes.INTEGER,
  motor_id: DataTypes.INTEGER,
  motor_qty: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_MOTOR',
});

 const DroneNozzel = (sequelize, DataTypes) => sequelize.define('DroneNozzel', {
  drone_id: DataTypes.INTEGER,
  nozzel_id: DataTypes.INTEGER,
  nozzel_qty: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_NOZZEL',
});

const DroneNutBolt = (sequelize, DataTypes) => sequelize.define('DroneNutBolt', {
  drone_id: DataTypes.INTEGER,
  bolt_type_id: DataTypes.INTEGER,
  nut_type_id: DataTypes.INTEGER,
  bolt_qty: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_NUT_BOLT',
});
const DronePipe = (sequelize, DataTypes) => sequelize.define('DronePipe', {
  drone_id: DataTypes.INTEGER,
  pipe_id: DataTypes.INTEGER,
  pipe_qty: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'DRONE_PIPE',
});

const MasterBattery = (sequelize, DataTypes) => sequelize.define('MasterBattery', {
  name: DataTypes.STRING,
  brand_name: DataTypes.STRING,
  capacity: DataTypes.INTEGER,
  cell_number: DataTypes.INTEGER,
  desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_BATTERY',
});
const MasterBlock = (sequelize, DataTypes) => sequelize.define('MasterBlock', {
  block_name: DataTypes.STRING,
  district_id: DataTypes.INTEGER,
  ...AuditFields,
}, {
  tableName: 'MASTER_BLOCK',
});

const MasterBolt = (sequelize, DataTypes) => sequelize.define('MasterBolt', {
  name: DataTypes.STRING,
  brand_name: DataTypes.STRING,
  desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_BOLT',
});
const MasterCharger = (sequelize, DataTypes) => sequelize.define('MasterCharger', {
  name: DataTypes.STRING,
  brand_name: DataTypes.STRING,
  desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_CHARGER',
});
const MasterCrop =(sequelize, DataTypes) => sequelize.define('MasterCrop', {
  name: DataTypes.STRING,
  desc: DataTypes.STRING,
  crop_image_original_name: DataTypes.STRING,
  crop_image_new_name: DataTypes.STRING,
  crop_image_url: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_CROP',
});

const MasterCupon = (sequelize, DataTypes) =>sequelize.define('MasterCupon', {
  cupon_type: DataTypes.STRING,
  discount_percentage: DataTypes.FLOAT,
  discount_price: DataTypes.FLOAT,
  ...AuditFields,
}, {
  tableName: 'MASTER_CUPON',
});

const MasterMotor = (sequelize, DataTypes) => sequelize.define('MasterMotor', {
  name: DataTypes.STRING,
  brand_name: DataTypes.STRING,
  desc: DataTypes.STRING,
  ...AuditFields,
}, {
  tableName: 'MASTER_MOTOR',
});