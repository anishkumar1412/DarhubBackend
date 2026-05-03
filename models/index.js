import Sequelize, { DataTypes, QueryTypes } from 'sequelize';
import db1 from '../config/db.js';

// Import all models
import Drone from './Drone1.js';
import DroneArms from './DroneArms.js';
import DroneBattery from './DroneBattery.js';
import DroneCharger from './DroneCharger.js';
import DroneController from './DroneController.js';
import DroneLandingGear from './DroneLandingGear.js';
import DroneMotor from './DroneMotor.js';
import DroneNozzel from './DroneNozzel.js';
import DroneNutBolt from './DroneNutBolt.js';
import DronePipe from './DronePipe.js';
import DronePropeller from './DronePropeller.js';

import MasterArms from './MasterArms.js';
import MasterBattery from './MasterBattery.js';
import MasterBlock from './MasterBlock.js';
import MasterBolt from './MasterBolt.js';
import MasterCharger from './MasterCharger.js';
import MasterCrop from './MasterCrop.js';
import MasterCupon from './MasterCupon.js';
import MasterDistrict from './MasterDistrict.js';
import MasterGramPanchayat from './MasterGramPanchayat.js';
import MasterLandingGear from './MasterLandingGear.js';
import MasterMotor from './MasterMotor.js';
// import MasterNozzle from './MasterNozzle.js';

import auditFields from './auditFields.js';
import MasterPropeller from './MasterProperller.js';
import User from './User.js';
import UserAddress from './UserAddress.js';
import UserProfile from './UserProfile.js';
import UserRole from './UserRole.js';
import MasterTransmitter from './MasterTransmitter.js';
import MasterReceiver from './MasterReceiver.js';
import DroneAddress from './DroneAddress.js';
import MasterState from './MasterState.js';
import SprayingOrder from './SprayingOrder.js';
import SprayingOrderAddress from './SprayingOrderAddress.js';
import SprayingWorkAssignee from './SprayingWorkAsignee.js';
import SprayingDailyLogs from './SprayingDailyLogs.js';
import AuditLog from './AuditLog.js';
import SprayingOrderComment from './SprayingOrderComment.js';
// import controll from './controll.js';

// Initialize Sequelize
const sequelize = new Sequelize(
  db1.DATABASE,
  db1.USER,
  db1.PASSWORD,
  {
    host: db1.HOST,
    dialect: db1.DIALECT,
    port: db1.port,
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    pool: {
      max: 40,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Test connection
try {
  await sequelize.authenticate();
  console.log("✅ Connection has been established successfully.");
} catch (err) {
  console.error("❌ Unable to connect to the database:", err);
}

// Add models to db object
const db = {
  Sequelize,
  sequelize,
  DataTypes,
  QueryTypes,

  Drone1: Drone(sequelize, DataTypes),
  DroneArms: DroneArms(sequelize, DataTypes),
  DroneBattery: DroneBattery(sequelize, DataTypes),
  DroneCharger: DroneCharger(sequelize, DataTypes),
  DroneController: DroneController(sequelize, DataTypes),
  DroneLandingGear: DroneLandingGear(sequelize, DataTypes),
  DroneMotor: DroneMotor(sequelize, DataTypes),
  DroneNozzel: DroneNozzel(sequelize, DataTypes),
  DroneNutBolt: DroneNutBolt(sequelize, DataTypes),
  DronePipe: DronePipe(sequelize, DataTypes),
  DronePropeller: DronePropeller(sequelize, DataTypes),

  User:User(sequelize,DataTypes),
UserAddress:UserAddress(sequelize,DataTypes),
UserProfile:UserProfile(sequelize,DataTypes),
UserRole:UserRole(sequelize,DataTypes),
MasterPropeller: MasterPropeller(sequelize,DataTypes),




  

  MasterArms: MasterArms(sequelize, DataTypes),
  MasterBattery: MasterBattery(sequelize, DataTypes),
  MasterBlock: MasterBlock(sequelize, DataTypes),
  MasterBolt: MasterBolt(sequelize, DataTypes),
  MasterCharger: MasterCharger(sequelize, DataTypes),
  MasterCrop: MasterCrop(sequelize, DataTypes),
  MasterCupon: MasterCupon(sequelize, DataTypes),
  MasterDistrict: MasterDistrict(sequelize, DataTypes),
  MasterGramPanchayat: MasterGramPanchayat(sequelize, DataTypes),
  MasterLandingGear: MasterLandingGear(sequelize, DataTypes),
  MasterMotor: MasterMotor(sequelize, DataTypes),
  MasterTransmitter:MasterTransmitter(sequelize,DataTypes),
  MasterReceiver:MasterReceiver(sequelize,DataTypes),
  DroneAddress:DroneAddress(sequelize,DataTypes),
  MasterDistrict:MasterDistrict(sequelize,DataTypes),
  MasterBlock:MasterBlock(sequelize,DataTypes),
  MasterState:MasterState(sequelize,DataTypes),
  SprayingOrder:SprayingOrder(sequelize,DataTypes),
  SprayingOrderAddress:SprayingOrderAddress(sequelize,DataTypes),
  SprayingWorkAssignee:SprayingWorkAssignee(sequelize,DataTypes),
  SprayingDailyLogs:SprayingDailyLogs(sequelize,DataTypes),
  AuditLog:AuditLog(sequelize,DataTypes),
  SprayingOrderComment: SprayingOrderComment(sequelize,DataTypes)



  // MasterNozzle: MasterNozzle(sequelize, DataTypes),

  
  // controll: controll(sequelize, DataTypes)
};

sequelize.sync({alter:false})
    .then(() =>{
        console.log("✅All models were synchronized successfully.")
    })
    .catch((err) =>{
        console.log("❌Sync error",err);
    })

export default db;
