// routes/drones.js
import express from 'express';
const router = express.Router();
import { createDrone, deleteDrone, filterDrones, filterDronesByArms, getDroneById, getDrones, updateDrone, filterDronesByDate, filterDronesByBattery, filterDronesByCharger, filterDronesByController, filterDronesByLandingGear, filterDronesByMotors, filterDronesUniversal, getDroneByIds } from '../models/pr.js';
import DroneBattery from '../models/DroneBattery.js';
import DroneCharger from '../models/DroneCharger.js';
import DroneController from '../models/DroneController.js';
import DroneLandingGear from '../models/DroneLandingGear.js';
import DroneMotor from '../models/DroneMotor.js';
import DroneNozzel from '../models/DroneNozzel.js';
import DroneNutBolt from '../models/DroneNutBolt.js';
import DronePipe from '../models/DronePipe.js';
import DronePropeller from '../models/DronePropeller.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { createComment, deleteComment, filterComments, getAllComments, getCommentById, SprayingDailyLogsFilter, updateComment, updateOrder } from '../controllers/Booking.controller.js';
import { auditLogger } from '../middleware/AuditLogger.js';
import { createColumn, deleteColumn, filterColumns, getAllColumns, getColumnById, updateColumn } from '../controllers/Column.controller.js';


router.post('/drones',createDrone);
//authenticate
router.get('/get-drones', getDrones);
router.get('/get-drone/:id', getDroneByIds);
router.put('/update-drone/:id',authenticate, updateDrone);
router.delete('/delete-drone/:id', authenticate, deleteDrone);
router.post("/filter-drone", filterDronesUniversal);
router.post("/update-order",auditLogger,updateOrder);
// authenticate,
router.post("/create-comment", authenticate, createComment);
router.get("/getAllcomments", getAllComments);
router.get("/get-comment-byId/:id", getCommentById);
router.put("/update-comment/:id", authenticate, updateComment);
router.delete("/delete-comment/:id", authenticate, deleteComment);
router.post("/filter-comments", authenticate, filterComments);
router.post(
  "/spraying-daily-logs/filter",
  SprayingDailyLogsFilter
);
router.post("/createCol", createColumn);
router.get("/getCol", getAllColumns); // supports ?module=Freight etc.
router.get("/getCol/:id", getColumnById);
router.put("/updateCol/:id",authenticate, updateColumn);
router.delete("/deleteCol/:id", deleteColumn);
router.post("/filter-col",filterColumns)
// ,authenticate,




export default router;
