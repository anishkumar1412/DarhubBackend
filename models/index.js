import Sequelize, { DataTypes, QueryTypes } from 'sequelize';
import db1 from '../config/db.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

// ── Existing models ───────────────────────────────────────────────
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
import ColumnSettings from './ColumnSettings.js';
import MasterCupon from './MasterCupon.js';
import MasterDistrict from './MasterDistrict.js';
import MasterGramPanchayat from './MasterGramPanchayat.js';
import MasterLandingGear from './MasterLandingGear.js';
import MasterMotor from './MasterMotor.js';

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
import SprayingOrderTimeline from './SprayingOrderTimeline.js';
import SprayingOrderExtras from './SprayingOrderExtras.js';
import MasterWorkingDays from './MasterWorkingdays.js';
import Fertilizer from './Fertilizer.js';
import UserUpiDetails from './UserUpiDetails.js';
import UserBankDetails from './UserBankDetails.js';
import UserDocuments from './UserDocuments.js';
import OtpVerification from './OtpVerification.js';
import IdempotencyKey from './IdempotencyKey.js';
import DeviceToken from './DeviceToken.js';
import Notification from './Notification.js';
import NotificationDelivery from './NotificationDelivery.js';
import NotificationPreference from './NotificationPreference.js';

// ── Inventory & Sales/Purchase Order models (NEW) ───────────────────
import Category from './Category.js';
import Product from './Product.js';
import Supplier from './Supplier.js';
import Customer from './Customer.js';
import Warehouse from './Warehouse.js';
import WarehouseLocation from './WarehouseLocation.js';
import WarehouseAdditional from './WarehouseAdditional.js';
import Stock from './Stock.js';
import PurchaseOrder from './PurchaseOrder.js';
import PurchaseOrderItem from './PurchaseOrderItem.js';
import SalesOrder from './SalesOrder.js';
import SalesOrderItem from './SalesOrderItem.js';
import StockTransaction from './StockTransaction.js';

// ── Admin auth models (NEW) ───────────────────────────────────────
import AdminProfile from './AdminProfile.js';
import MasterRole from './MasterRole.js';
import MasterPrivilage from './MasterPrivilage.js';
import MasterRolePrivilage from './MasterRolePrivilage.js';

// ── Inventory dashboard models ────────────────────────────────────
import InventoryAccessory from './InventoryAccessory.js';
import InventoryDrone from './InventoryDrone.js';
import InventoryShipment from './InventoryShipment.js';
import MaintenanceLog from './MaintenanceLog.js';
import Vendor from './Vendor.js';

import VendorAddress from './VendorAddress.js';
import VendorBusinessKyc from './VendorBusinessKyc.js';
import VendorBankDetails from './VendorBankDetails.js';


// ── Pilot maintenance models ─────────────────────────────────────
import PilotMaintenanceTask from './PilotMaintenanceTask.js';
import PilotMaintenanceChecklist from './PilotMaintenanceChecklist.js';
import PilotMaintenanceAttachment from './PilotMaintenanceAttachment.js';

// ── Initialize Sequelize ──────────────────────────────────────────
const sequelize = new Sequelize(
  db1.DATABASE,
  db1.USER,
  db1.PASSWORD,
  {
    host: db1.HOST,
    dialect: db1.DIALECT,
    port: db1.port,
    logging: false,
    dialectOptions: db1.SSL === false ? {} : {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
    pool: {
      max: 40,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

// ── Test connection ───────────────────────────────────────────────
try {
  await sequelize.authenticate();
  logger.info('✅ Connection has been established successfully.');
} catch (err) {
  logger.error('❌ Unable to connect to the database:', err);
}

// ── Register all models ───────────────────────────────────────────
const db = {
  Sequelize,
  sequelize,
  DataTypes,
  QueryTypes,
  Op: Sequelize.Op,

  // Drone models
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

  // User models
  User: User(sequelize, DataTypes),
  UserAddress: UserAddress(sequelize, DataTypes),
  UserProfile: UserProfile(sequelize, DataTypes),
  UserRole: UserRole(sequelize, DataTypes),

  // Master models
  MasterPropeller: MasterPropeller(sequelize, DataTypes),
  MasterArms: MasterArms(sequelize, DataTypes),
  MasterBattery: MasterBattery(sequelize, DataTypes),
  MasterBlock: MasterBlock(sequelize, DataTypes),
  MasterBolt: MasterBolt(sequelize, DataTypes),
  MasterCharger: MasterCharger(sequelize, DataTypes),
  MasterCrop: MasterCrop(sequelize, DataTypes),
  ColumnSettings: ColumnSettings(sequelize, DataTypes),
  MasterCupon: MasterCupon(sequelize, DataTypes),
  MasterDistrict: MasterDistrict(sequelize, DataTypes),
  MasterGramPanchayat: MasterGramPanchayat(sequelize, DataTypes),
  MasterLandingGear: MasterLandingGear(sequelize, DataTypes),
  MasterMotor: MasterMotor(sequelize, DataTypes),
  MasterTransmitter: MasterTransmitter(sequelize, DataTypes),
  MasterReceiver: MasterReceiver(sequelize, DataTypes),
  MasterState: MasterState(sequelize, DataTypes),
  MasterWorkingDays: MasterWorkingDays(sequelize, DataTypes),

  // Role & permission models (NOW REGISTERED)
  MasterRole: MasterRole(sequelize, DataTypes),
  MasterPrivilage: MasterPrivilage(sequelize, DataTypes),
  MasterRolePrivilage: MasterRolePrivilage(sequelize, DataTypes),

  // Admin auth models (NEW)
  AdminProfile: AdminProfile(sequelize, DataTypes),

  // Drone address & location
  DroneAddress: DroneAddress(sequelize, DataTypes),

  // Order models
  SprayingOrder: SprayingOrder(sequelize, DataTypes),
  SprayingOrderAddress: SprayingOrderAddress(sequelize, DataTypes),
  SprayingWorkAssignee: SprayingWorkAssignee(sequelize, DataTypes),
  SprayingDailyLogs: SprayingDailyLogs(sequelize, DataTypes),
  AuditLog: AuditLog(sequelize, DataTypes),
  SprayingOrderComment: SprayingOrderComment(sequelize, DataTypes),
  SprayingOrderTimeline: SprayingOrderTimeline(sequelize, DataTypes),
  SprayingOrderExtras: SprayingOrderExtras(sequelize, DataTypes),

  // Inventory & Orders models
  Category: Category(sequelize, DataTypes),
  Product: Product(sequelize, DataTypes),
  Supplier: Supplier(sequelize, DataTypes),
  Customer: Customer(sequelize, DataTypes),
  Warehouse: Warehouse(sequelize, DataTypes),
  WarehouseLocation: WarehouseLocation(sequelize, DataTypes),
  WarehouseAdditional: WarehouseAdditional(sequelize, DataTypes),
  Stock: Stock(sequelize, DataTypes),
  PurchaseOrder: PurchaseOrder(sequelize, DataTypes),
  PurchaseOrderItem: PurchaseOrderItem(sequelize, DataTypes),
  SalesOrder: SalesOrder(sequelize, DataTypes),
  SalesOrderItem: SalesOrderItem(sequelize, DataTypes),
  StockTransaction: StockTransaction(sequelize, DataTypes),
  Fertilizer: Fertilizer(sequelize, DataTypes),
  UserUpiDetails: UserUpiDetails(sequelize, DataTypes),
  UserBankDetails: UserBankDetails(sequelize, DataTypes),
  UserDocuments: UserDocuments(sequelize, DataTypes),
  OtpVerification: OtpVerification(sequelize, DataTypes),
  IdempotencyKey: IdempotencyKey(sequelize, DataTypes),
  // Push notifications (docs/PUSH_NOTIFICATIONS.md)
  DeviceToken: DeviceToken(sequelize, DataTypes),
  Notification: Notification(sequelize, DataTypes),
  NotificationDelivery: NotificationDelivery(sequelize, DataTypes),
  NotificationPreference: NotificationPreference(sequelize, DataTypes),
  // Inventory dashboard models
  InventoryAccessory: InventoryAccessory(sequelize, DataTypes),
  InventoryDrone: InventoryDrone(sequelize, DataTypes),
  InventoryShipment: InventoryShipment(sequelize, DataTypes),
  MaintenanceLog: MaintenanceLog(sequelize, DataTypes),
  Vendor: Vendor(sequelize, DataTypes),
  VendorAddress: VendorAddress(sequelize, DataTypes),
  VendorBusinessKyc: VendorBusinessKyc(sequelize, DataTypes),
  VendorBankDetails: VendorBankDetails(sequelize, DataTypes),
  SalesOrder: SalesOrder(sequelize, DataTypes),

  // Pilot maintenance models
  PilotMaintenanceTask: PilotMaintenanceTask(sequelize, DataTypes),
  PilotMaintenanceChecklist: PilotMaintenanceChecklist(sequelize, DataTypes),
  PilotMaintenanceAttachment: PilotMaintenanceAttachment(sequelize, DataTypes),
};

// 🪛 Pilot Maintenance Associations 🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛🪛
// Push notifications: an inbox row has one delivery per device; a device belongs to a user
db.Notification.hasMany(db.NotificationDelivery, { foreignKey: 'notification_id', as: 'deliveries' });
db.NotificationDelivery.belongsTo(db.Notification, { foreignKey: 'notification_id', as: 'notification' });
db.DeviceToken.hasMany(db.NotificationDelivery, { foreignKey: 'device_token_id', as: 'deliveries' });
db.NotificationDelivery.belongsTo(db.DeviceToken, { foreignKey: 'device_token_id', as: 'device' });

db.PilotMaintenanceTask.hasMany(db.PilotMaintenanceChecklist, {
  foreignKey: 'task_id',
  as: 'checklist',
});
db.PilotMaintenanceChecklist.belongsTo(db.PilotMaintenanceTask, {
  foreignKey: 'task_id',
  as: 'task',
});

db.PilotMaintenanceTask.hasMany(db.PilotMaintenanceAttachment, {
  foreignKey: 'task_id',
  as: 'attachments',
});
db.PilotMaintenanceAttachment.belongsTo(db.PilotMaintenanceTask, {
  foreignKey: 'task_id',
  as: 'task',
});

db.MaintenanceLog.belongsTo(db.PilotMaintenanceTask, {
  foreignKey: 'pilot_task_id',
  as: 'pilot_task',
});
db.PilotMaintenanceTask.hasOne(db.MaintenanceLog, {
  foreignKey: 'pilot_task_id',
  as: 'maintenance_log',
});

db.PilotMaintenanceTask.belongsTo(db.Drone1, {
  foreignKey: 'drone_id',
  as: 'drone',
});

db.PilotMaintenanceTask.belongsTo(db.User, {
  foreignKey: 'pilot_id',
  as: 'pilotUser',
});

db.PilotMaintenanceTask.belongsTo(db.User, {
  foreignKey: 'engineer_id',
  as: 'engineerUser',
});

// Spraying Order Timeline Associations
db.SprayingOrder.hasMany(db.SprayingOrderTimeline, {
  foreignKey: 'booking_id',
  as: 'timelines',
});
db.SprayingOrderTimeline.belongsTo(db.SprayingOrder, {
  foreignKey: 'booking_id',
  as: 'order',
});

// SprayingOrderExtras — one-to-one extension for farmer-app data
db.SprayingOrder.hasOne(db.SprayingOrderExtras, {
  foreignKey: 'booking_id',
  as: 'extras',
});
db.SprayingOrderExtras.belongsTo(db.SprayingOrder, {
  foreignKey: 'booking_id',
  as: 'order',
});

// The database schema is created and changed ONLY by migrations (`npm run db:migrate`, see docs/DATABASE.md).
// Creating tables from the models on boot is opt-in (DB_SYNC=true) and meant for throwaway databases such as the
// e2e tests: sync() cannot add a column to, or drop one from, an existing table, so a model change would silently
// diverge from the live schema without a migration to review.
// server.js and the scripts await this promise before they touch the database.
export const syncPromise = env.DB_SYNC
  ? sequelize
    .sync({ alter: false })
    .then(() => {
      logger.info('✅ All models were synchronized successfully (DB_SYNC=true).');
    })
    .catch((err) => {
      logger.error('❌ Sync error', err);
      throw err;
    })
  : Promise.resolve();

export default db;


// this is the comment to chekc the 