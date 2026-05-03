import express from "express"
// const router = express.Router();
// const { Drone, DroneArms, DronePropeller, MasterArms, MasterPropeller } = require('../models'); // Adjust path to your models
// const { Sequelize } = require('sequelize');
// const { Op } = require('sequelize');
// const { Parser } = require('json2csv');

// // POST endpoint to create a drone with arms and propellers
// router.post('/drones', async (req, res) => {
//   const transaction = await Drone.sequelize.transaction();

//   try {
//     const {
//       owner_id,
//       model,
//       name,
//       range,
//       speed,
//       weight,
//       is_level_sensor,
//       level_sensor_id,
//       is_allen_key,
//       allen_key_id,
//       water_pump_id,
//       is_extension_board,
//       extension_board_id,
//       drone_arms,
//       drone_propellers
//     } = req.body;

//     // Validate required fields
//     if (!owner_id || !model || !name) {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'owner_id, model, and name are required'
//       });
//     }

//     // Validate drone_arms and drone_propellers
//     if (!Array.isArray(drone_arms) || !Array.isArray(drone_propellers)) {
//       await transaction.rollback();
//       return res.status(400).json({
//         success: false,
//         message: 'drone_arms and drone_propellers must be arrays'
//       });
//     }

//     // Validate master_arm_id and count in drone_arms
//     for (const arm of drone_arms) {
//       if (!arm.master_arm_id || !arm.count || arm.count <= 0) {
//         await transaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Each drone_arm must have a valid master_arm_id and count greater than 0'
//         });
//       }
//       // Verify master_arm_id exists
//       const masterArm = await MasterArms.findByPk(arm.master_arm_id);
//       if (!masterArm) {
//         await transaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: `Master arm with ID ${arm.master_arm_id} does not exist`
//         });
//       }
//     }

//     // Validate master_propeller_id and count in drone_propellers
//     for (const propeller of drone_propellers) {
//       if (!propeller.master_propeller_id || !propeller.count || propeller.count <= 0) {
//         await transaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: 'Each drone_propeller must have a valid master_propeller_id and count greater than 0'
//         });
//       }
//       // Verify master_propeller_id exists
//       const masterPropeller = await MasterPropeller.findByPk(propeller.master_propeller_id);
//       if (!masterPropeller) {
//         await transaction.rollback();
//         return res.status(400).json({
//           success: false,
//           message: `Master propeller with ID ${propeller.master_propeller_id} does not exist`
//         });
//       }
//     }

//     // Create the drone
//     const drone = await Drone.create({
//       owner_id,
//       model,
//       name,
//       range,
//       speed,
//       weight,
//       is_level_sensor,
//       level_sensor_id,
//       is_allen_key,
//       allen_key_id,
//       water_pump_id,
//       is_extension_board,
//       extension_board_id
//     }, { transaction });

//     // Create drone arms
//     const droneArmsData = drone_arms.map(arm => ({
//       drone_id: drone.id,
//       arms_id: arm.master_arm_id,
//       arms_qty: arm.count
//     }));
//     await DroneArms.bulkCreate(droneArmsData, { transaction });

//     // Create drone propellers
//     const dronePropellersData = drone_propellers.map(propeller => ({
//       drone_id: drone.id,
//       propeller_id: propeller.master_propeller_id,
//       propeller_qty: propeller.count
//     }));
//     await DronePropeller.bulkCreate(dronePropellersData, { transaction });

//     // Commit the transaction
//     await transaction.commit();

//     // Fetch the created drone with associations for response
//     const createdDrone = await Drone.findByPk(drone.id, {
//       include: [
//         {
//           model: DroneArms,
//           as: 'droneArms',
//           attributes: ['arms_id', 'arms_qty'],
//           include: [{ model: MasterArms, as: 'masterArm', attributes: ['name', 'brand_name', 'desc'] }]
//         },
//         {
//           model: DronePropeller,
//           as: 'dronePropellers',
//           attributes: ['propeller_id', 'propeller_qty'],
//           include: [{ model: MasterPropeller, as: 'masterPropeller', attributes: ['name', 'brand_name', 'desc'] }]
//         }
//       ]
//     });

//     // Format the response
//     const formattedDrone = {
//       ...createdDrone.toJSON(),
//       drone_arms: createdDrone.droneArms.map(arm => ({
//         master_arm_id: arm.arms_id,
//         count: arm.arms_qty,
//         details: arm.masterArm
//       })),
//       drone_propellers: createdDrone.dronePropellers.map(propeller => ({
//         master_propeller_id: propeller.propeller_id,
//         count: propeller.propeller_qty,
//         details: propeller.masterPropeller
//       }))
//     };

//     res.status(201).json({
//       success: true,
//       data: formattedDrone
//     });
//   } catch (error) {
//     await transaction.rollback();
//     console.error('Error creating drone:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Internal server error'
//     });
//   }
// });

// // GET endpoint to fetch a specific drone by ID with arms and propellers
// router.get('/drones/:droneId', async (req, res) => {
//     const droneId = parseInt(req.params.droneId, 10);
  
//     if (isNaN(droneId)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid drone ID'
//       });
//     }
  
//     try {
//       // Fetch the drone (without associations)
//       const drone = await Drone.findByPk(droneId, {
//         attributes: [
//           'id',
//           'owner_id',
//           'model',
//           'name',
//           'range',
//           'speed',
//           'weight',
//           'is_level_sensor',
//           'level_sensor_id',
//           'is_allen_key',
//           'allen_key_id',
//           'water_pump_id',
//           'is_extension_board',
//           'extension_board_id',
//           'created_at',
//           'updated_at'
//         ]
//       });
  
//       if (!drone) {
//         return res.status(404).json({
//           success: false,
//           message: `Drone with ID ${droneId} not found`
//         });
//       }
  
//       // Fetch drone arms and propellers in parallel
//       const [droneArms, dronePropellers] = await Promise.all([
//         DroneArms.findAll({
//           where: { drone_id: drone.id },
//           attributes: ['arms_id', 'arms_qty'],
//           include: [
//             {
//               model: MasterArms,
//               as: 'masterArm',
//               attributes: ['name', 'brand_name', 'desc']
//             }
//           ]
//         }),
//         DronePropeller.findAll({
//           where: { drone_id: drone.id },
//           attributes: ['propeller_id', 'propeller_qty'],
//           include: [
//             {
//               model: MasterPropeller,
//               as: 'masterPropeller',
//               attributes: ['name', 'brand_name', 'desc']
//             }
//           ]
//         })
//       ]);
  
//       // Format the response
//       const formattedDrone = {
//         ...drone.toJSON(),
//         drone_arms: droneArms.map(arm => ({
//           master_arm_id: arm.arms_id,
//           count: arm.arms_qty,
//           details: arm.masterArm
//         })),
//         drone_propellers: dronePropellers.map(propeller => ({
//           master_propeller_id: propeller.propeller_id,
//           count: propeller.propeller_qty,
//           details: propeller.masterPropeller
//         }))
//       };
  
//       res.status(200).json({
//         success: true,
//         data: formattedDrone
//       });
  
//     } catch (error) {
//       console.error('Error fetching drone:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Internal server error'
//       });
//     }
//   });
  
//   router.post('/drones/filter', async (req, res) => {
//     try {
//       const {
//         order_by = 'created_at',
//         order_type = 'DESC',
//         page = 1,
//         page_size = 10,
//         export: isExport = false,
//         columns = [],
//         arms_id,
//         propeller_id,
//         ...filters
//       } = req.body;
  
//       const where = { ...filters };
  
//       const include = [];
  
//       // Add DroneArms filter if arms_id is present
//       if (arms_id !== undefined) {
//         include.push({
//           model: DroneArms,
//           as: 'droneArms',
//           where: { arms_id },
//           required: true
//         });
//       }
  
//       // Add DronePropeller filter if propeller_id is present
//       if (propeller_id !== undefined) {
//         include.push({
//           model: DronePropeller,
//           as: 'dronePropellers',
//           where: { propeller_id },
//           required: true
//         });
//       }
  
//       const queryOptions = {
//         where,
//         include,
//         order: [[order_by, order_type.toUpperCase()]],
//         distinct: true
//       };
  
//       if (!isExport) {
//         queryOptions.limit = parseInt(page_size);
//         queryOptions.offset = (parseInt(page) - 1) * parseInt(page_size);
//       }
  
//       const result = await Drone.findAndCountAll(queryOptions);
//       const drones = result.rows.map(drone => drone.toJSON());
  
//       if (isExport) {
//         const exportData = drones.map(drone => {
//           const filteredDrone = {};
//           (columns.length ? columns : Object.keys(drone)).forEach(col => {
//             filteredDrone[col] = drone[col];
//           });
//           return filteredDrone;
//         });
  
//         const parser = new Parser({ fields: columns.length ? columns : Object.keys(exportData[0] || {}) });
//         const csv = parser.parse(exportData);
  
//         res.header('Content-Type', 'text/csv');
//         res.attachment('DRONES.csv');
//         return res.send(csv);
//       }
  
//       res.status(200).json({
//         success: true,
//         total: result.count,
//         page: parseInt(page),
//         page_size: parseInt(page_size),
//         data: drones
//       });
  
//     } catch (error) {
//       console.error('Error filtering drones:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Internal server error'
//       });
//     }
//   });
  

// module.exports = router;
