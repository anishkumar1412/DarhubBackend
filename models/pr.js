import { Op, Sequelize } from 'sequelize';
import db from '../models/index.js';
import ExcelJS from "exceljs";

// import MasterPropeller from './MasterProperller.js';
// import MasterBattery from './MasterBattery.js';

const {
  Drone1,
  DroneArms,
  DronePropeller,
  DroneBattery,
  DroneCharger,
  DroneController,
  DroneLandingGear,
  DroneMotor,
  DroneNozzel,
  DroneNutBolt,
  DronePipe,
  MasterArms,

  MasterBattery,
  MasterBlock,
  MasterBolt,
  MasterCharger,
  MasterCrop,
  MasterCupon,
  MasterMotor,
  MasterLandingGear,
  MasterReceiver,
  MasterTransmitter,
  DroneAddress,
  MasterState,
  MasterDistrict,
  
} = db;

export const createDrone = async (req, res) => {
  const transaction = await Drone1.sequelize.transaction();

  try {
    const {
      owner_id,
      model,
      name,
      range,
      speed,
      weight,
      is_level_sensor,
      level_sensor_id,
      is_allen_key,
      allen_key_id,
      water_pump_id,
      is_extension_board,
      extension_board_id,

      // Arrays
      drone_arms,
      drone_propellers,
      drone_batteries,
      drone_chargers,
      drone_controllers,
      drone_landing_gears,
      drone_motors,
      drone_nozzels,
      drone_nut_bolts,
      drone_pipes
    } = req.body;

    console.log(drone_arms,
      drone_propellers,
      drone_batteries,
      drone_chargers,
      drone_controllers,
      drone_landing_gears,
      drone_motors,
      drone_nozzels,
      drone_nut_bolts,
      drone_pipes)

    // ----------------- Validation -----------------
    if (!owner_id || !model || !name) {
      return res.status(400).json({ success: false, message: "owner_id, model, and name are required" });
    }

    const arrayChecks = [
      { key: "drone_arms", value: drone_arms },
      { key: "drone_propellers", value: drone_propellers },
      { key: "drone_batteries", value: drone_batteries },
      { key: "drone_chargers", value: drone_chargers },
      { key: "drone_controllers", value: drone_controllers },
      { key: "drone_landing_gears", value: drone_landing_gears },
      { key: "drone_motors", value: drone_motors },
      { key: "drone_nozzels", value: drone_nozzels },
      { key: "drone_nut_bolts", value: drone_nut_bolts },
      { key: "drone_pipes", value: drone_pipes }
    ];

    for (const check of arrayChecks) {
      if (check.value && !Array.isArray(check.value)) {
        return res.status(400).json({ success: false, message: `${check.key} must be an array` });
      }
    }

    // ----------------- Create Drone -----------------
    const drone = await Drone1.create(
      {
        owner_id,
        model,
        name,
        range,
        speed,
        weight,
        is_level_sensor,
        level_sensor_id,
        is_allen_key,
        allen_key_id,
        water_pump_id,
        is_extension_board,
        extension_board_id,
      },
      { transaction }
    );

    if (!drone) {
      await transaction.rollback();
      return res.status(500).json({ success: false, message: "Failed to create drone" });
    }

    // ----------------- Create Related Tables -----------------
    // Arms
    if (drone_arms?.length > 0) {
      const data = drone_arms.map(arm => ({
        drone_id: drone.id,
        arms_id: arm.master_arm_id,
        arms_qty: arm.count
      }));
      await DroneArms.bulkCreate(data, { transaction });
    }

    // Propellers
    if (drone_propellers?.length > 0) {
      const data = drone_propellers.map(propeller => ({
        drone_id: drone.id,
        propeller_id: propeller.master_propeller_id,
        propeller_qty: propeller.count
      }));
      await DronePropeller.bulkCreate(data, { transaction });
    }

    // Batteries
    if (drone_batteries?.length > 0) {
      const data = drone_batteries.map(b => ({
        drone_id: drone.id,
        battery_id: b.master_battery_id,
        battery_qty: b.count
      }));
      await DroneBattery.bulkCreate(data, { transaction });
    }

    // Chargers
    if (drone_chargers?.length > 0) {
      const data = drone_chargers.map(c => ({
        drone_id: drone.id,
        charger_id: c.master_charger_id,
        is_charger_cable: c.is_charger_cable ?? false,
        ischarger_pcable: c.ischarger_pcable ?? false
      }));
      await DroneCharger.bulkCreate(data, { transaction });
    }

    // Controllers
    if (drone_controllers?.length > 0) {
      const data = drone_controllers.map(ctrl => ({
        drone_id: drone.id,
        transmitter_id: ctrl.transmitter_id,
        receiver_id: ctrl.receiver_id
      }));
      await DroneController.bulkCreate(data, { transaction });
    }

    // Landing Gear
    if (drone_landing_gears?.length > 0) {
      const data = drone_landing_gears.map(lg => ({
        drone_id: drone.id,
        landing_gear_id: lg.master_landing_gear_id,
        landing_gear_qty: lg.count
      }));
      await DroneLandingGear.bulkCreate(data, { transaction });
    }

    // Motors
    if (drone_motors?.length > 0) {
      const data = drone_motors.map(m => ({
        drone_id: drone.id,
        motor_id: m.master_motor_id,
        motor_qty: m.count
      }));
      await DroneMotor.bulkCreate(data, { transaction });
    }

    // Nozzels
    if (drone_nozzels?.length > 0) {
      const data = drone_nozzels.map(n => ({
        drone_id: drone.id,
        nozzel_id: n.master_nozzel_id,
        nozzel_qty: n.count
      }));
      await DroneNozzel.bulkCreate(data, { transaction });
    }

    // Nut & Bolt
    if (drone_nut_bolts?.length > 0) {
      const data = drone_nut_bolts.map(nb => ({
        drone_id: drone.id,
        bolt_type_id: nb.master_bolt_id,
        nut_type_id: nb.master_nut_id,
        bolt_qty: nb.count
      }));
      await DroneNutBolt.bulkCreate(data, { transaction });
    }

    // Pipes
    if (drone_pipes?.length > 0) {
      const data = drone_pipes.map(p => ({
        drone_id: drone.id,
        pipe_id: p.master_pipe_id,
        pipe_qty: p.count
      }));
      await DronePipe.bulkCreate(data, { transaction });
    }

    // ----------------- Commit -----------------
    await transaction.commit();

    return res.status(201).json({ success: true, message: "Drone and all components created successfully", droneId: drone.id });

  } catch (error) {
    await transaction.rollback();
    console.error("Error creating drone:", error);
    return res.status(500).json({ success: false, message: `Internal server error: ${error}` });
  }
};



// export const getDrones = async (req, res) => {
//   try {
//     const drones = await Drone1.findAll();

//     if (!drones || drones.length === 0) {
//       return res.status(404).json({ success: false, message: "No drones found" });
//     }

//     // Helper to clean objects (remove metadata fields)
//     const clean = (obj) => {
//       if (!obj) return null;
//       const { id, drone_id, createdAt, updatedAt, created_on, modified_on, created_by, modified_by, is_active, ...rest } = obj.get({ plain: true });
//       return rest;
//     };

//     const result = await Promise.all(
//       drones.map(async (drone) => {
//         const droneClean = clean(drone);

//         // Fetch all related data for this drone
//         const arms = (await DroneArms.findAll({ where: { drone_id: drone.id } })).map(clean);
//         const propellers = (await DronePropeller.findAll({ where: { drone_id: drone.id } })).map(clean);
//         const batteries = (await DroneBattery.findAll({ where: { drone_id: drone.id } })).map(clean);
//         const chargers = (await DroneCharger.findAll({ where: { drone_id: drone.id } })).map(clean);
//         const controllers = (await DroneController.findAll({ where: { drone_id: drone.id } })).map(clean);
//         const landingGears = (await DroneLandingGear.findAll({ where: { drone_id: drone.id } })).map(clean);
//         const motors = (await DroneMotor.findAll({ where: { drone_id: drone.id } })).map(clean);
//         const nozzels = (await DroneNozzel.findAll({ where: { drone_id: drone.id } })).map(clean);
//         const nutBolts = (await DroneNutBolt.findAll({ where: { drone_id: drone.id } })).map(clean);
//         const pipes = (await DronePipe.findAll({ where: { drone_id: drone.id } })).map(clean);

//         return {
//           ...droneClean,
//           components: {
//             arms,
//             propellers,
//             batteries,
//             chargers,
//             controllers,
//             landing_gears: landingGears,
//             motors,
//             nozzels,
//             nut_bolts: nutBolts,
//             pipes,
//           },
//         };
//       })
//     );

//     return res.status(200).json({ success: true, data: result });
//   } catch (error) {
//     console.error("Error fetching drones:", error);
//     return res.status(500).json({
//       success: false,
//       message: `Internal server error: ${error}`,
//     });
//   }
// };



// export const getDroneById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     // 1️⃣ Get drone basic details
//   const drone = await Drone1.findByPk(id, {
//   attributes: { exclude: ['createdAt', 'updatedAt'] }
// });

//     if (!drone) {
//       return res.status(404).json({ success: false, message: 'Drone not found' });
//     }

//     // 2️⃣ Get arms (id & qty)
//     const arms = await DroneArms.findAll({
//       where: { drone_id: id },
//       attributes: ['arms_id', 'arms_qty']
//     });

//     // 3️⃣ Get all unique arms_id
//     const armsIds = arms.map(a => a.arms_id);

//     // 4️⃣ Fetch arms names from MasterArms
//     const masterArms = await MasterArms.findAll({
//       where: { id: armsIds },
//       attributes: ['id', 'name']
//     });

//     // 5️⃣ Map names into arms list
//     const armsWithNames = arms.map(a => {
//       const matching = masterArms.find(m => m.id === a.arms_id);
//       return {
//         arms_id: a.arms_id,
//         arms_qty: a.arms_qty,
//         arms_name: matching ? matching.name : null
//       };
//     });

//     // 6️⃣ Get propellers (same as before)
//     const propellers = await DronePropeller.findAll({
//       where: { drone_id: id },
//       attributes: ['propeller_id', 'propeller_qty']
//     });

//     //  const propellerIds = propellers.map(a => a.propeller_id);

//     // // 4️⃣ Fetch arms names from MasterArms
//     // const MasterPropeller = await MasterPropeller.findAll({
//     //   where: { id: propellerIds },
//     //   attributes: ['id', 'name']
//     // });


//     // // 7️⃣ Final response
//     // const propellerWithNames = propellers.map(a => {
//     //   const matching = MasterPropeller.find(m => m.id === a.propeller_id);
//     //   return {
//     //     propeller_id: a.propeller_id,
//     //     propeller_qty: a.propeller_qty,
//     //     propeller_name: matching ? matching.name : null
//     //   };
//     // });

//     const battery = await DroneBattery.findAll({
//       where: { drone_id: id },
//       attributes: ['battery_id', 'battery_qty']
//     });


//      const batteryIds = battery.map(a => a.battery_id);

//     // 4️⃣ Fetch arms names from MasterArms
//     const MasterBattery = await MasterBattery.findAll({
//       where: { id: batteryIds },
//       attributes: ['id', 'name']
//     });


//     // 7️⃣ Final response
//     const batteryWithNames = battery.map(a => {
//       const matching = MasterBattery.find(m => m.id === a.battery_id);
//       return {
//         battery_id: a.battery_id,
//         battery_qty: a.battery_qty,
//         battery_name: matching ? matching.name : null
//       };
//     });


//     // 7️⃣ Final response
//     return res.status(200).json({
//       success: true,
//       data: {
//         ...drone.toJSON(),
//         drone_arms: armsWithNames,
//         // drone_propellers: propellerWithNames,
//         drone_batteries:batteryWithNames

//       }
//     });

//   } catch (error) {
//     console.error('Error fetching drone:', error);
//     return res.status(500).json({
//       success: false,
//       message: `Internal server error: ${error}`
//     });
//   }
// };


export const getDrones = async (req, res) => {
  try {
    const drones = await Drone1.findAll();

    if (!drones || drones.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No drones found",
      });
    }

    // Helper to clean objects (remove metadata fields)
    const clean = (obj) => {
      if (!obj) return null;
      const {
        id,
        drone_id,
        createdAt,
        updatedAt,
        created_on,
        modified_on,
        created_by,
        modified_by,
        is_active,
        ...rest
      } = obj.get({ plain: true });
      return rest;
    };

    // Drone data + components
    const result = await Promise.all(
      drones.map(async (drone) => {
        const droneClean = clean(drone);

        const arms = (await DroneArms.findAll({ where: { drone_id: drone.id } })).map(clean);
        const propellers = (await DronePropeller.findAll({ where: { drone_id: drone.id } })).map(clean);
        const batteries = (await DroneBattery.findAll({ where: { drone_id: drone.id } })).map(clean);
        const chargers = (await DroneCharger.findAll({ where: { drone_id: drone.id } })).map(clean);
        const controllers = (await DroneController.findAll({ where: { drone_id: drone.id } })).map(clean);
        const landingGears = (await DroneLandingGear.findAll({ where: { drone_id: drone.id } })).map(clean);
        const motors = (await DroneMotor.findAll({ where: { drone_id: drone.id } })).map(clean);
        const nozzels = (await DroneNozzel.findAll({ where: { drone_id: drone.id } })).map(clean);
        const nutBolts = (await DroneNutBolt.findAll({ where: { drone_id: drone.id } })).map(clean);
        const pipes = (await DronePipe.findAll({ where: { drone_id: drone.id } })).map(clean);

        return {
          ...droneClean,
          components: {
            arms,
            propellers,
            batteries,
            chargers,
            controllers,
            landing_gears: landingGears,
            motors,
            nozzels,
            nut_bolts: nutBolts,
            pipes,
          },
        };
      })
    );

    // Master tables (renamed in response)
    const masterrams = (await MasterArms.findAll()).map(clean);
    const masterbattery = (await MasterBattery.findAll()).map(clean);
    const masterblock = (await MasterBlock.findAll()).map(clean);
    const masterbolt = (await MasterBolt.findAll()).map(clean);
    const mastercharger = (await MasterCharger.findAll()).map(clean);
    const mastercrop = (await MasterCrop.findAll()).map(clean);
    const mastercupon = (await MasterCupon.findAll()).map(clean);
    const mastermotor = (await MasterMotor.findAll()).map(clean);

    return res.status(200).json({
      success: true,
      data: {
        drones: result,
        masterrams,
        masterbattery,
        masterblock,
        masterbolt,
        mastercharger,
        mastercrop,
        mastercupon,
        mastermotor,
      },
    });
  } catch (error) {
    console.error("Error fetching drones:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error.message}`,
    });
  }
};





// export const getDroneById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!id) {
//       return res.status(400).json({ success: false, message: "Drone id is required" });
//     }

//     // Fetch main drone
//     const drone = await Drone1.findOne({ where: { id } });
//     if (!drone) {
//       return res.status(404).json({ success: false, message: "Drone not found" });
//     }

//     // Helper to clean objects (remove metadata fields)
//     const clean = (obj) => {
//       if (!obj) return null;
//       const { id, drone_id, createdAt, updatedAt, created_on, modified_on, created_by, modified_by, is_active, ...rest } = obj.get({ plain: true });
//       return rest;
//     };

//     // Fetch related data
//     const arms = (await DroneArms.findAll({ where: { drone_id: id } })).map(clean);
//     const propellers = (await DronePropeller.findAll({ where: { drone_id: id } })).map(clean);
//     const batteries = (await DroneBattery.findAll({ where: { drone_id: id } })).map(clean);
//     const chargers = (await DroneCharger.findAll({ where: { drone_id: id } })).map(clean);
//     const controllers = (await DroneController.findAll({ where: { drone_id: id } })).map(clean);
//     const landingGears = (await DroneLandingGear.findAll({ where: { drone_id: id } })).map(clean);
//     const motors = (await DroneMotor.findAll({ where: { drone_id: id } })).map(clean);
//     const nozzels = (await DroneNozzel.findAll({ where: { drone_id: id } })).map(clean);
//     const nutBolts = (await DroneNutBolt.findAll({ where: { drone_id: id } })).map(clean);
//     const pipes = (await DronePipe.findAll({ where: { drone_id: id } })).map(clean);

//     // Clean main drone
//     const droneClean = clean(drone);

//     // Build final response
//     const result = {
//       ...droneClean,
//       components: {
//         arms,
//         propellers,
//         batteries,
//         chargers,
//         controllers,
//         landing_gears: landingGears,
//         motors,
//         nozzels,
//         nut_bolts: nutBolts,
//         pipes
//       }
//     };

//     return res.status(200).json({ success: true, data: result });

//   } catch (error) {
//     console.error("Error fetching drone:", error);
//     return res.status(500).json({ success: false, message: `Internal server error: ${error}` });
//   }
// };


export const getDroneById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Drone id is required" });
    }

    // Fetch main drone
    const drone = await Drone1.findOne({ where: { id } });
    if (!drone) {
      return res
        .status(404)
        .json({ success: false, message: "Drone not found" });
    }

    // Helper to clean objects (remove metadata fields)
    const clean = (obj) => {
      if (!obj) return null;
      const {
        id,
        drone_id,
        createdAt,
        updatedAt,
        created_on,
        modified_on,
        created_by,
        modified_by,
        is_active,
        ...rest
      } = obj.get({ plain: true });
      return rest;
    };

    // Fetch related drone components
    const arms = (await DroneArms.findAll({ where: { drone_id: id } })).map(clean);
    const propellers = (await DronePropeller.findAll({ where: { drone_id: id } })).map(clean);
    const batteries = (await DroneBattery.findAll({ where: { drone_id: id } })).map(clean);
    const chargers = (await DroneCharger.findAll({ where: { drone_id: id } })).map(clean);
    const controllers = (await DroneController.findAll({ where: { drone_id: id } })).map(clean);
    const landingGears = (await DroneLandingGear.findAll({ where: { drone_id: id } })).map(clean);
    const motors = (await DroneMotor.findAll({ where: { drone_id: id } })).map(clean);
    const nozzels = (await DroneNozzel.findAll({ where: { drone_id: id } })).map(clean);
    const nutBolts = (await DroneNutBolt.findAll({ where: { drone_id: id } })).map(clean);
    const pipes = (await DronePipe.findAll({ where: { drone_id: id } })).map(clean);

    // Clean main drone
    const droneClean = clean(drone);

    // Master tables (renamed in response)
    const masterrams = (await MasterArms.findAll()).map(clean);
    const masterbattery = (await MasterBattery.findAll()).map(clean);
    const masterblock = (await MasterBlock.findAll()).map(clean);
    const masterbolt = (await MasterBolt.findAll()).map(clean);
    const mastercharger = (await MasterCharger.findAll()).map(clean);
    const mastercrop = (await MasterCrop.findAll()).map(clean);
    const mastercupon = (await MasterCupon.findAll()).map(clean);
    const mastermotor = (await MasterMotor.findAll()).map(clean);

    // Build final response
    const result = {
      ...droneClean,
      components: {
        arms,
        propellers,
        batteries,
        chargers,
        controllers,
        landing_gears: landingGears,
        motors,
        nozzels,
        nut_bolts: nutBolts,
        pipes,
      },
      masterrams,
      masterbattery,
      masterblock,
      masterbolt,
      mastercharger,
      mastercrop,
      mastercupon,
      mastermotor,
    };

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Error fetching drone:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error.message}`,
    });
  }
};



export const updateDrone = async (req, res) => {
  const transaction = await Drone1.sequelize.transaction();

  try {
    const { id } = req.params;
    const drone = await Drone1.findByPk(id);
    if (!drone) {
      return res.status(404).json({ success: false, message: "Drone not found" });
    }

    const {
      owner_id,
      model,
      name,
      range,
      speed,
      weight,
      is_level_sensor,
      level_sensor_id,
      is_allen_key,
      allen_key_id,
      water_pump_id,
      is_extension_board,
      extension_board_id,
      arms,
      propellers,
      batteries,
      chargers,
      controllers,
      landing_gears,
      motors,
      nozzels,
      nut_bolts,
      pipes,
    } = req.body;

    // ✅ Update main drone details with modify_on
    await drone.update(
      {
        owner_id,
        model,
        name,
        range,
        speed,
        weight,
        is_level_sensor,
        level_sensor_id,
        is_allen_key,
        allen_key_id,
        water_pump_id,
        is_extension_board,
        extension_board_id,
        modified_on: new Date(), // ✅ update modify_on timestamp
      },
      { transaction }
    );

    // Helper: Update components (delete old + insert new)
    // Helper: Update components (delete old + insert new)
    const updateComponent = async (Model, data, mapFn) => {
      await Model.destroy({ where: { drone_id: id }, transaction });
      if (data && data.length > 0) {
        await Model.bulkCreate(
          data.map((item) => ({
            ...mapFn(item),
            modified_on: new Date()   // <-- auto add timestamp for each insert
          })),
          { transaction }
        );
      }
    };


    // ✅ Update each component
    await updateComponent(DroneArms, arms, (arm) => ({
      drone_id: id,
      arms_id: arm.master_arm_id,
      arms_qty: arm.count,
    }));

    await updateComponent(DronePropeller, propellers, (prop) => ({
      drone_id: id,
      propeller_id: prop.master_propeller_id,
      propeller_qty: prop.count,
    }));

    await updateComponent(DroneBattery, batteries, (bat) => ({
      drone_id: id,
      battery_id: bat.master_battery_id,
      battery_qty: bat.count,
    }));

    await updateComponent(DroneCharger, chargers, (ch) => ({
      drone_id: id,
      charger_id: ch.master_charger_id,
      charger_qty: ch.count,
    }));

    await updateComponent(DroneController, controllers, (ctrl) => ({
      drone_id: id,
      controller_id: ctrl.master_controller_id,
      controller_qty: ctrl.count,
    }));

    await updateComponent(DroneLandingGear, landing_gears, (lg) => ({
      drone_id: id,
      landing_gear_id: lg.master_landing_gear_id,
      landing_gear_qty: lg.count,
    }));

    await updateComponent(DroneMotor, motors, (m) => ({
      drone_id: id,
      motor_id: m.master_motor_id,
      motor_qty: m.count,
    }));

    await updateComponent(DroneNozzel, nozzels, (n) => ({
      drone_id: id,
      nozzel_id: n.master_nozzel_id,
      nozzel_qty: n.count,
    }));

    await updateComponent(DroneNutBolt, nut_bolts, (nb) => ({
      drone_id: id,
      nut_bolt_id: nb.master_nut_bolt_id,
      nut_bolt_qty: nb.count,
    }));

    await updateComponent(DronePipe, pipes, (p) => ({
      drone_id: id,
      pipe_id: p.master_pipe_id,
      pipe_qty: p.count,
    }));

    await transaction.commit();

    return res
      .status(200)
      .json({ success: true, message: "Drone updated successfully" });
  } catch (error) {
    await transaction.rollback();
    console.error("Update drone error:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error}`,
    });
  }
};




// export const deleteDrone = async (req, res) => {
//   const transaction = await Drone1.sequelize.transaction();

//   try {
//     const { id } = req.params;

//     const drone = await Drone1.findByPk(id);
//     if (!drone) {
//       return res.status(404).json({ success: false, message: 'Drone not found' });
//     }

//     // Delete arms & propellers
//     await DroneArms.destroy({ where: { drone_id: id }, transaction });
//     await DronePropeller.destroy({ where: { drone_id: id }, transaction });

//     // Delete drone
//     await Drone1.destroy({ where: { id }, transaction });

//     await transaction.commit();

//     return res.status(200).json({ success: true, message: 'Drone deleted successfully' });
//   } catch (error) {
//     await transaction.rollback();
//     console.error('Delete drone error:', error);
//     return res.status(500).json({
//       success: false,
//       message: `Internal server error: ${error}`
//     });
//   }
// };


// export const filterDrones = async (req, res) => {
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
//       extension_board_id
//     } = req.query; // GET request query parameters

//     // Build dynamic filter object
//     let filter = {};

//     if (owner_id) filter.owner_id = owner_id;
//     if (model) filter.model = { [Op.iLike]: `%${model}%` }; // partial search
//     if (name) filter.name = { [Op.iLike]: `%${name}%` };
//     if (range) filter.range = range;
//     if (speed) filter.speed = speed;
//     if (weight) filter.weight = weight;
//     if (is_level_sensor !== undefined) filter.is_level_sensor = is_level_sensor === "true";
//     if (level_sensor_id) filter.level_sensor_id = level_sensor_id;
//     if (is_allen_key !== undefined) filter.is_allen_key = is_allen_key === "true";
//     if (allen_key_id) filter.allen_key_id = allen_key_id;
//     if (water_pump_id) filter.water_pump_id = water_pump_id;
//     if (is_extension_board !== undefined) filter.is_extension_board = is_extension_board === "true";
//     if (extension_board_id) filter.extension_board_id = extension_board_id;

//     // Fetch data
//     const drones = await Drone1.findAll({
//       where: filter
//     });

//     return res.status(200).json({
//       success: true,
//       data: drones
//     });

//   } catch (error) {
//     console.error("Error filtering drones:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal Server Error"
//     });
//   }
// };

export const deleteDrone = async (req, res) => {
  const transaction = await Drone1.sequelize.transaction();

  try {
    const { id } = req.params;

    const drone = await Drone1.findByPk(id);
    if (!drone) {
      return res.status(404).json({ success: false, message: "Drone not found" });
    }

    // ✅ Delete all related components
    await DroneArms.destroy({ where: { drone_id: id }, transaction });
    await DronePropeller.destroy({ where: { drone_id: id }, transaction });
    await DroneBattery.destroy({ where: { drone_id: id }, transaction });
    await DroneCharger.destroy({ where: { drone_id: id }, transaction });
    await DroneController.destroy({ where: { drone_id: id }, transaction });
    await DroneLandingGear.destroy({ where: { drone_id: id }, transaction });
    await DroneMotor.destroy({ where: { drone_id: id }, transaction });
    await DroneNozzel.destroy({ where: { drone_id: id }, transaction });
    await DroneNutBolt.destroy({ where: { drone_id: id }, transaction });
    await DronePipe.destroy({ where: { drone_id: id }, transaction });

    // ✅ Finally delete the drone
    await Drone1.destroy({ where: { id }, transaction });

    await transaction.commit();

    return res
      .status(200)
      .json({ success: true, message: "Drone and all associated components deleted successfully" });
  } catch (error) {
    await transaction.rollback();
    console.error("Delete drone error:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error}`,
    });
  }
};


export const filterDronesByArms = async (req, res) => {
  try {
    const { arms_id, arms_name } = req.body;

    const { orderBy, orderType } = req.orderOptions; // Extract ordering options 
    // create by and modified by, date range start date and end date ke acc. created at and updated at shoudl be removed coz we have already added created on and updated on 
    if (!arms_id && !arms_name) {
      return res.status(400).json({
        success: false,
        message: "Please provide either arms_id or arms_name"
      });
    }

    let matchingArmsIds = [];

    // 1️⃣ If filtering by arms_name, get matching arms_id from MasterArms
    if (arms_name) {
      const armsMatches = await MasterArms.findAll({
        where: { name: { [Op.iLike]: `%${arms_name}%` } },
        attributes: ["id"],
        raw: true
      });

      matchingArmsIds = armsMatches.map(a => a.id);
    }

    // 2️⃣ Find matching drone_ids from DroneArms
    const armConditions = {};
    if (arms_id) armConditions.arms_id = arms_id;
    if (matchingArmsIds.length) armConditions.arms_id = { [Op.in]: matchingArmsIds };

    const droneArmsMatches = await DroneArms.findAll({
      where: armConditions,
      attributes: ["drone_id"],
      raw: true
    });

    const droneIds = [...new Set(droneArmsMatches.map(a => a.drone_id))];

    if (!droneIds.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    // 3️⃣ Get drone details
    const drones = await Drone1.findAll({
      where: { id: { [Op.in]: droneIds } },
      attributes: { exclude: ["createdAt", "updatedAt"] },
      order: [[orderBy, orderType === -1 ? 'DESC' : 'ASC']]
    });

    return res.status(200).json({
      success: true,
      data: drones
    });

  } catch (error) {
    console.error("Error filtering drones by arms:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error}`
    });
  }
};


export const filterDronesByDate = async (req, res) => {
  try {
    const { created_start, created_end, modified_start, modified_end } = req.body;
    const { orderBy, orderType } = req.orderOptions;

    // If no date filters are provided
    if (!created_start && !created_end && !modified_start && !modified_end) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one date filter (created_on or modified_on)"
      });
    }

    const whereCondition = {};

    // ✅ Created On filter
    if (created_start && created_end) {
      whereCondition.created_on = { [Op.between]: [created_start, created_end] };
    } else if (created_start) {
      whereCondition.created_on = { [Op.gte]: created_start };
    } else if (created_end) {
      whereCondition.created_on = { [Op.lte]: created_end };
    }

    // ✅ Modified On filter
    if (modified_start && modified_end) {
      whereCondition.modified_on = { [Op.between]: [modified_start, modified_end] };
    } else if (modified_start) {
      whereCondition.modified_on = { [Op.gte]: modified_start };
    } else if (modified_end) {
      whereCondition.modified_on = { [Op.lte]: modified_end };
    }

    // ✅ Query drones (exclude sequelize default createdAt, updatedAt)
    const drones = await Drone1.findAll({
      where: whereCondition,
      attributes: { exclude: ["createdAt", "updatedAt"] },
      order: [[orderBy, orderType === -1 ? 'DESC' : 'ASC']]
    });

    return res.status(200).json({
      success: true,
      data: drones
    });

  } catch (error) {
    console.error("Error filtering drones by date:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error}`
    });
  }
};


export const filterDrones = async (req, res) => {
  try {
    const {
      owner_id,
      model,
      name,
      range,
      speed,
      weight,
      is_level_sensor,
      level_sensor_id,
      is_allen_key,
      allen_key_id,
      water_pump_id,
      is_extension_board,
      extension_board_id,
      created_by,
      modified_by
    } = req.body;
    const { orderBy, orderType } = req.orderOptions;
    let conditions = {};

    // 🟢 Direct matches
    if (owner_id) conditions.owner_id = owner_id;
    if (model) conditions.model = { [Op.iLike]: `%${model}%` }; // partial match
    if (name) conditions.name = { [Op.iLike]: `%${name}%` };   // partial match
    if (range) conditions.range = range;
    if (speed) conditions.speed = speed;
    if (weight) conditions.weight = weight;

    if (is_level_sensor !== undefined) conditions.is_level_sensor = is_level_sensor;
    if (level_sensor_id) conditions.level_sensor_id = level_sensor_id;
    if (is_allen_key !== undefined) conditions.is_allen_key = is_allen_key;
    if (allen_key_id) conditions.allen_key_id = allen_key_id;
    if (water_pump_id) conditions.water_pump_id = water_pump_id;
    if (is_extension_board !== undefined) conditions.is_extension_board = is_extension_board;
    if (extension_board_id) conditions.extension_board_id = extension_board_id;

    if (created_by) conditions.created_by = created_by;
    if (modified_by) conditions.modified_by = modified_by;

    // 🔍 Fetch drones excluding Sequelize timestamps



    const drones = await Drone1.findAll({
      where: conditions,
      attributes: { exclude: ["createdAt", "updatedAt"] },
      order: [[orderBy, orderType === -1 ? 'DESC' : 'ASC']]
    });

    return res.status(200).json({
      success: true,
      data: drones
    });

  } catch (error) {
    console.error("Error filtering drones:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error}`
    });
  }
};



export const filterDronesByBattery = async (req, res) => {
  try {
    const { battery_id, battery_name, brand_name, capacity, cell_number, battery_qty } = req.body;
    const { orderBy, orderType } = req.orderOptions;
    // At least one filter must be provided
    if (!battery_id && !battery_name && !brand_name && !capacity && !cell_number && !battery_qty) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one filter (battery_id, battery_name, brand_name, capacity, cell_number, battery_qty)"
      });
    }

    let matchingBatteryIds = [];

    // 1️⃣ If filtering by battery_name or brand_name or capacity or cell_number → fetch from MasterBattery
    if (battery_name || brand_name || capacity || cell_number) {
      const whereBattery = {};

      if (battery_name) whereBattery.name = { [Op.iLike]: `%${battery_name}%` };
      if (brand_name) whereBattery.brand_name = { [Op.iLike]: `%${brand_name}%` };
      if (capacity) whereBattery.capacity = capacity;
      if (cell_number) whereBattery.cell_number = cell_number;

      const batteryMatches = await MasterBattery.findAll({
        where: whereBattery,
        attributes: ["id"],
        raw: true
      });

      matchingBatteryIds = batteryMatches.map(b => b.id);
    }

    // 2️⃣ Find matching drone_ids from DroneBattery
    const batteryConditions = {};
    if (battery_id) batteryConditions.battery_id = battery_id;
    if (battery_qty) batteryConditions.battery_qty = battery_qty;
    if (matchingBatteryIds.length) batteryConditions.battery_id = { [Op.in]: matchingBatteryIds };

    const droneBatteryMatches = await DroneBattery.findAll({
      where: batteryConditions,
      attributes: ["drone_id"],
      raw: true
    });

    const droneIds = [...new Set(droneBatteryMatches.map(b => b.drone_id))];

    if (!droneIds.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    // 3️⃣ Get drone details from Drone1
    const drones = await Drone1.findAll({
      where: { id: { [Op.in]: droneIds } },
      attributes: { exclude: ["createdAt", "updatedAt"] },
      order: [[orderBy, orderType === -1 ? 'DESC' : 'ASC']]

    });

    return res.status(200).json({
      success: true,
      data: drones
    });

  } catch (error) {
    console.error("Error filtering drones by battery:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error}`
    });
  }
};



export const filterDronesByCharger = async (req, res) => {
  try {
    const {
      charger_id,
      charger_name,
      brand_name,
      model,
      range,
      weight,
      is_charger_cable,
      ischarger_pcable
    } = req.body;
    const { orderBy, orderType } = req.orderOptions;

    // At least one filter must be provided
    if (
      !charger_id &&
      !charger_name &&
      !brand_name &&
      !model &&
      !range &&
      !weight &&
      is_charger_cable === undefined &&
      ischarger_pcable === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one filter (charger_id, charger_name, brand_name, model, range, weight, is_charger_cable, ischarger_pcable)"
      });
    }

    let matchingChargerIds = [];

    // 1️⃣ If filtering by charger_name, brand_name, model, range, weight → fetch from MasterDroneCharger
    if (charger_name || brand_name || model || range || weight) {
      const whereCharger = {};

      if (charger_name) whereCharger.name = { [Op.iLike]: `%${charger_name}%` };
      if (brand_name) whereCharger.brand_name = { [Op.iLike]: `%${brand_name}%` };
      // if (model) whereCharger.model = { [Op.iLike]: `%${model}%` };
      if (range) whereCharger.range = range;
      if (weight) whereCharger.weight = weight;

      const chargerMatches = await MasterCharger.findAll({
        where: whereCharger,
        attributes: ["id"],
        raw: true,
      });

      matchingChargerIds = chargerMatches.map(c => c.id);
    }

    // 2️⃣ Find matching drone_ids from DroneCharger
    const chargerConditions = {};
    if (charger_id) chargerConditions.charger_id = charger_id;
    if (is_charger_cable !== undefined) chargerConditions.is_charger_cable = is_charger_cable;
    if (ischarger_pcable !== undefined) chargerConditions.ischarger_pcable = ischarger_pcable;
    if (matchingChargerIds.length) chargerConditions.charger_id = { [Op.in]: matchingChargerIds };

    const droneChargerMatches = await DroneCharger.findAll({
      where: chargerConditions,
      attributes: ["drone_id"],
      raw: true
    });

    const droneIds = [...new Set(droneChargerMatches.map(c => c.drone_id))];

    if (!droneIds.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    // 3️⃣ Get drone details from Drone1
    const drones = await Drone1.findAll({
      where: { id: { [Op.in]: droneIds } },
      attributes: { exclude: ["createdAt", "updatedAt"] },
      order: [[orderBy, orderType === -1 ? 'DESC' : 'ASC']]


    });

    return res.status(200).json({
      success: true,
      count: drones.length,
      data: drones
    });

  } catch (error) {
    console.error("Error filtering drones by charger:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error}`
    });
  }
};


export const filterDronesByController = async (req, res) => {
  try {
    const { controller_id, transmitter_id, receiver_id, transmitter_name, receiver_name } = req.body;
    const { orderBy, orderType } = req.orderOptions;
    // Ensure at least one filter
    if (!controller_id && !transmitter_id && !receiver_id && !transmitter_name && !receiver_name) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one filter (controller_id, transmitter_id, receiver_id, transmitter_name, receiver_name)"
      });
    }

    let matchingTransmitterIds = [];
    let matchingReceiverIds = [];

    // 1️⃣ If filtering by transmitter_name → MasterTransmitter
    if (transmitter_name) {
      const transmitterMatches = await MasterTransmitter.findAll({
        where: { name: { [Op.iLike]: `%${transmitter_name}%` } },
        attributes: ["id"],
        raw: true
      });
      matchingTransmitterIds = transmitterMatches.map(t => t.id);
    }

    // 2️⃣ If filtering by receiver_name → MasterReceiver
    if (receiver_name) {
      const receiverMatches = await MasterReceiver.findAll({
        where: { name: { [Op.iLike]: `%${receiver_name}%` } },
        attributes: ["id"],
        raw: true
      });
      matchingReceiverIds = receiverMatches.map(r => r.id);
    }

    // 3️⃣ Find matching DroneController
    const controllerConditions = {};
    if (controller_id) controllerConditions.id = controller_id;
    if (transmitter_id) controllerConditions.transmitter_id = transmitter_id;
    if (receiver_id) controllerConditions.receiver_id = receiver_id;
    if (matchingTransmitterIds.length) controllerConditions.transmitter_id = { [Op.in]: matchingTransmitterIds };
    if (matchingReceiverIds.length) controllerConditions.receiver_id = { [Op.in]: matchingReceiverIds };

    const controllerMatches = await DroneController.findAll({
      where: controllerConditions,
      attributes: ["drone_id"],
      raw: true
    });

    const droneIds = [...new Set(controllerMatches.map(c => c.drone_id))];

    if (!droneIds.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    // 4️⃣ Get drone details
    const drones = await Drone1.findAll({
      where: { id: { [Op.in]: droneIds } },
      attributes: { exclude: ["createdAt", "updatedAt"] },
      order: [[orderBy, orderType === -1 ? 'DESC' : 'ASC']]

    });

    return res.status(200).json({
      success: true,
      data: drones
    });

  } catch (error) {
    console.error("Error filtering drones by controller:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error}`
    });
  }
};


export const filterDronesByLandingGear = async (req, res) => {
  try {
    const { landing_gear_id, landing_gear_name } = req.body;
    const { orderBy, orderType } = req.orderOptions;

    // Validation
    if (!landing_gear_id && !landing_gear_name) {
      return res.status(400).json({
        success: false,
        message: "Please provide either landing_gear_id or landing_gear_name"
      });
    }

    let matchingLandingGearIds = [];

    // 1️⃣ If filtering by landing_gear_name, get matching landing_gear_id from MasterLandingGear
    if (landing_gear_name) {
      const gearMatches = await MasterLandingGear.findAll({
        where: { name: { [Op.iLike]: `%${landing_gear_name}%` } },
        attributes: ["id"],
        raw: true
      });

      matchingLandingGearIds = gearMatches.map(g => g.id);
    }

    // 2️⃣ Find matching drone_ids from DroneLandingGear
    const gearConditions = {};
    if (landing_gear_id) gearConditions.landing_gear_id = landing_gear_id;
    if (matchingLandingGearIds.length) gearConditions.landing_gear_id = { [Op.in]: matchingLandingGearIds };

    const droneGearMatches = await DroneLandingGear.findAll({
      where: gearConditions,
      attributes: ["drone_id"],
      raw: true
    });

    const droneIds = [...new Set(droneGearMatches.map(g => g.drone_id))];

    if (!droneIds.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    // 3️⃣ Get drone details (exclude Sequelize auto createdAt/updatedAt fields)
    const drones = await Drone1.findAll({
      where: { id: { [Op.in]: droneIds } },
      attributes: { exclude: ["createdAt", "updatedAt"] },
      order: [[orderBy, orderType === -1 ? 'DESC' : 'ASC']]

    });

    return res.status(200).json({
      success: true,
      data: drones
    });

  } catch (error) {
    console.error("Error filtering drones by landing gear:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error}`
    });
  }
};


export const filterDronesByMotors = async (req, res) => {
  try {

    const { motor_id, motor_name, } = req.body;
    const { orderBy, orderType } = req.orderOptions;

    // At least motor_id or motor_name is required
    if (!motor_id && !motor_name) {
      return res.status(400).json({
        success: false,
        message: "Please provide either motor_id or motor_name"
      });
    }

    let matchingMotorIds = [];

    // 1️⃣ If filtering by motor_name, get matching motor_id from MasterMotor
    if (motor_name) {
      const motorMatches = await MasterMotor.findAll({
        where: { name: { [Op.iLike]: `%${motor_name}%` } },
        attributes: ["id"],
        raw: true
      });

      matchingMotorIds = motorMatches.map(m => m.id);
    }

    // 2️⃣ Build filter conditions for DroneMotor
    const motorConditions = {};
    if (motor_id) motorConditions.motor_id = motor_id;
    if (matchingMotorIds.length) motorConditions.motor_id = { [Op.in]: matchingMotorIds };

    // 🔹 Optional filters


    const droneMotorMatches = await DroneMotor.findAll({
      where: motorConditions,
      attributes: ["drone_id"],
      raw: true
    });

    const droneIds = [...new Set(droneMotorMatches.map(m => m.drone_id))];

    if (!droneIds.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    // 3️⃣ Get drone details
    const drones = await Drone1.findAll({
      where: { id: { [Op.in]: droneIds } },
      attributes: { exclude: ["createdAt", "updatedAt"] },
      order: [[orderBy, orderType === -1 ? 'DESC' : 'ASC']]
      // exclude sequelize defaults
    });

    return res.status(200).json({
      success: true,
      data: drones
    });

  } catch (error) {
    console.error("Error filtering drones by motors:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error}`
    });
  }
};


// export const filterDronesUniversal = async (req, res) => {
//   try {
//     const body = req.body;

//     const orderBy = body.order_by || 'createdAt'; // default order by createdAt
//     const orderType = body.order_type === 'desc' ? -1: 1;

//     // Add order options to request object so filters can use them 

//     req.orderOptions = {orderBy, orderType};


//     // Decide which filter to use
//     if (body.arms_id || body.arms_name) {
//       return await filterDronesByArms(req, res);
//     }

//     if (body.created_start || body.created_end || body.modified_start || body.modified_end) {
//       return await filterDronesByDate(req, res);
//     }

//     if (
//       body.owner_id || body.model || body.name || body.range || body.speed ||
//       body.weight || body.is_level_sensor !== undefined || body.level_sensor_id ||
//       body.is_allen_key !== undefined || body.allen_key_id || body.water_pump_id ||
//       body.is_extension_board !== undefined || body.extension_board_id ||
//       body.created_by || body.modified_by
//     ) {
//       return await filterDrones(req, res);
//     }

//     if (body.battery_id || body.battery_name || body.brand_name || body.capacity || body.cell_number || body.battery_qty) {
//       return await filterDronesByBattery(req, res);
//     }

//     if (
//       body.charger_id || body.charger_name || body.brand_name || body.model ||
//       body.range || body.weight || body.is_charger_cable !== undefined || body.ischarger_pcable !== undefined
//     ) {
//       return await filterDronesByCharger(req, res);
//     }

//     if (body.controller_id || body.transmitter_id || body.receiver_id || body.transmitter_name || body.receiver_name) {
//       return await filterDronesByController(req, res);
//     }

//     if (body.landing_gear_id || body.landing_gear_name) {
//       return await filterDronesByLandingGear(req, res);
//     }

//     if (body.motor_id || body.motor_name) {
//       return await filterDronesByMotors(req, res);
//     }

//     // If no valid filter found
//     return res.status(400).json({
//       success: false,
//       message: "Please provide valid filter parameters"
//     });

//   } catch (error) {
//     console.error("Error in universal drone filter:", error);
//     return res.status(500).json({
//       success: false,
//       message: `Internal server error: ${error}`
//     });
//   }
// };





/// -----------------> ---------------------------> 


export const filterDronesUniversal = async (req, res) => {
  try {
    const body = req.body;
    const orderBy = body.order_by || 'created_on'; // default drone column
    const orderType = body.order_type === 'desc' ? -1 : 1;
    req.orderOptions = { orderBy, orderType };

    // -------------------------
    // Build combined where conditions (no change to your existing filters)
    // -------------------------
    let whereConditions = {};
    let droneIdSets = [];
      let anyFilterProvided = false;

    let createdByUserIds = [];
    let modifiedByUserIds = [];

if (body.created_by_name) {
  anyFilterProvided = true;
  const users = await db.UserProfile.findAll({
    where: {
      [Op.or]: [
        { first_name: { [Op.iLike]: `%${body.created_by_name}%` } },
        { last_name: { [Op.iLike]: `%${body.created_by_name}%` } },
        db.Sequelize.where(
          db.Sequelize.fn(
            'concat',
            db.Sequelize.col('first_name'),
            ' ',
            db.Sequelize.col('last_name')
          ),
          {
            [Op.iLike]: `%${body.created_by_name}%`
          }
        )
      ]
    },
    attributes: ['user_id'],
    raw: true
  });

  createdByUserIds = users.map(u => u.user_id);
}


if (body.modified_by_name) {
  anyFilterProvided = true;
  const users = await db.UserProfile.findAll({
    where: {
      [Op.or]: [
        { first_name: { [Op.iLike]: `%${body.modified_by_name}%` } },
        { last_name: { [Op.iLike]: `%${body.modified_by_name}%` } },
        db.Sequelize.where(
          db.Sequelize.fn(
            'concat',
            db.Sequelize.col('first_name'),
            ' ',
            db.Sequelize.col('last_name')
          ),
          {
            [Op.iLike]: `%${body.modified_by_name}%`
          }
        )
      ]
    },
    attributes: ['user_id'],
    raw: true
  });

  modifiedByUserIds = users.map(u => u.user_id);
}

// ...existing code...
if (createdByUserIds.length > 0) whereConditions.created_by = { [Op.in]: createdByUserIds };
if (modifiedByUserIds.length > 0) whereConditions.modified_by = { [Op.in]: modifiedByUserIds };
// ...existing code...
    // 1. Arms filter
    if (body.arms_id || body.arms_name || body.arms_qty) {
      anyFilterProvided = true;
      let matchingArmsIds = [];

      if (body.arms_name) {
        anyFilterProvided = true;
        const armsMatches = await MasterArms.findAll({
          where: { name: { [Op.iLike]: `%${body.arms_name}%` } },
          attributes: ["id"],
          raw: true
        });
        matchingArmsIds = armsMatches.map(a => a.id);
      }

      if (body.arms_id) matchingArmsIds.push(body.arms_id);
      matchingArmsIds = [...new Set(matchingArmsIds)];

      if (body.arms_qty) {
        anyFilterProvided = true;
        const droneArmsWithQty = await DroneArms.findAll({
          where: { arms_qty: body.arms_qty },
          attributes: ["arms_id"],
          raw: true
        });
        const qtyIds = droneArmsWithQty.map(a => a.arms_id);
        matchingArmsIds = matchingArmsIds.length ? matchingArmsIds.filter(id => qtyIds.includes(id)) : qtyIds;
      }

      matchingArmsIds = [...new Set(matchingArmsIds)];

      if (matchingArmsIds.length) {
        const droneArmsMatches = await DroneArms.findAll({
          where: { arms_id: { [Op.in]: matchingArmsIds } },
          attributes: ["drone_id"],
          raw: true
        });
        const ids = [...new Set(droneArmsMatches.map(a => a.drone_id))];
        droneIdSets.push(new Set(ids));
      }
    }

    // 2. Date filters
    if (body.created_start || body.created_end || body.modified_start || body.modified_end) {
      const dateCondition = {};
      anyFilterProvided = true;
      if (body.created_start && body.created_end) {
        dateCondition.created_on = { [Op.between]: [body.created_start, body.created_end] };
      } else if (body.created_start) {
        dateCondition.created_on = { [Op.gte]: body.created_start };
      } else if (body.created_end) {
        dateCondition.created_on = { [Op.lte]: body.created_end };
      }

      if (body.modified_start && body.modified_end) {
        dateCondition.modified_on = { [Op.between]: [body.modified_start, body.modified_end] };
      } else if (body.modified_start) {
        dateCondition.modified_on = { [Op.gte]: body.modified_start };
      } else if (body.modified_end) {
        dateCondition.modified_on = { [Op.lte]: body.modified_end };
      }

      if (Object.keys(dateCondition).length) {
        whereConditions = { ...whereConditions, ...dateCondition };
      }
    }

    // 3. Other direct filters
    if (
      body.owner_id || body.model || body.name || body.range || body.speed ||
      body.weight || body.is_level_sensor !== undefined || body.level_sensor_id ||
      body.is_allen_key !== undefined || body.allen_key_id || body.water_pump_id ||
      body.is_extension_board !== undefined || body.extension_board_id ||
      body.created_by || body.modified_by
    )
    
    {
      anyFilterProvided = true;
      if (body.owner_id) whereConditions.owner_id = body.owner_id;
      if (body.model) whereConditions.model = { [Op.iLike]: `%${body.model}%` };
      if (body.name) whereConditions.name = { [Op.iLike]: `%${body.name}%` };
      if (body.range) whereConditions.range = body.range;
      if (body.speed) whereConditions.speed = body.speed;
      if (body.weight) whereConditions.weight = body.weight;

      if (body.is_level_sensor !== undefined) whereConditions.is_level_sensor = body.is_level_sensor;
      if (body.level_sensor_id) whereConditions.level_sensor_id = body.level_sensor_id;
      if (body.is_allen_key !== undefined) whereConditions.is_allen_key = body.is_allen_key;
      if (body.allen_key_id) whereConditions.allen_key_id = body.allen_key_id;
      if (body.water_pump_id) whereConditions.water_pump_id = body.water_pump_id;
      if (body.is_extension_board !== undefined) whereConditions.is_extension_board = body.is_extension_board;
      if (body.extension_board_id) whereConditions.extension_board_id = body.extension_board_id;

      if (body.created_by) whereConditions.created_by = body.created_by;
      if (body.modified_by) whereConditions.modified_by = body.modified_by;
    }

    // 4. Battery filter
    if (body.battery_id || body.battery_name || body.brand_name || body.capacity || body.cell_number || body.battery_qty) {
      let matchingBatteryIds = [];
      anyFilterProvided = true;

      if (body.battery_name || body.brand_name || body.capacity || body.cell_number) {
        const whereBattery = {};
        if (body.battery_name) whereBattery.name = { [Op.iLike]: `%${body.battery_name}%` };
        if (body.brand_name) whereBattery.brand_name = { [Op.iLike]: `%${body.brand_name}%` };
        if (body.capacity) whereBattery.capacity = body.capacity;
        if (body.cell_number) whereBattery.cell_number = body.cell_number;

        const batteryMatches = await MasterBattery.findAll({
          where: whereBattery,
          attributes: ["id"],
          raw: true
        });
        matchingBatteryIds = batteryMatches.map(b => b.id);
      }

      const batteryConditions = {};
      if (body.battery_id) batteryConditions.battery_id = body.battery_id;
      if (body.battery_qty) batteryConditions.battery_qty = body.battery_qty;
      if (matchingBatteryIds.length) batteryConditions.battery_id = { [Op.in]: matchingBatteryIds };

      const droneBatteryMatches = await DroneBattery.findAll({
        where: batteryConditions,
        attributes: ["drone_id"],
        raw: true
      });

      const ids = [...new Set(droneBatteryMatches.map(b => b.drone_id))];
      droneIdSets.push(new Set(ids));
    }

    // 5. Charger filter
    if (
      body.charger_id || body.charger_name || body.brand_name || body.model ||
      body.range || body.weight || body.is_charger_cable !== undefined || body.ischarger_pcable !== undefined
    ) {
      anyFilterProvided = true;
      let matchingChargerIds = [];

      if (body.charger_name || body.brand_name || body.model || body.range || body.weight) {
        const whereCharger = {};
        if (body.charger_name) whereCharger.name = { [Op.iLike]: `%${body.charger_name}%` };
        if (body.brand_name) whereCharger.brand_name = { [Op.iLike]: `%${body.brand_name}%` };
        if (body.range) whereCharger.range = body.range;
        if (body.weight) whereCharger.weight = body.weight;

        const chargerMatches = await MasterCharger.findAll({
          where: whereCharger,
          attributes: ["id"],
          raw: true
        });
        matchingChargerIds = chargerMatches.map(c => c.id);
      }

      const chargerConditions = {};
      if (body.charger_id) chargerConditions.charger_id = body.charger_id;
      if (body.is_charger_cable !== undefined) chargerConditions.is_charger_cable = body.is_charger_cable;
      if (body.ischarger_pcable !== undefined) chargerConditions.ischarger_pcable = body.ischarger_pcable;
      if (matchingChargerIds.length) chargerConditions.charger_id = { [Op.in]: matchingChargerIds };

      const droneChargerMatches = await DroneCharger.findAll({
        where: chargerConditions,
        attributes: ["drone_id"],
        raw: true
      });

      const ids = [...new Set(droneChargerMatches.map(c => c.drone_id))];
      droneIdSets.push(new Set(ids));
    }

    // 6. Controller filter
    if (body.controller_id || body.transmitter_id || body.receiver_id || body.transmitter_name || body.receiver_name) {
      let matchingTransmitterIds = [];
      let matchingReceiverIds = [];
      anyFilterProvided = true;

      if (body.transmitter_name) {
        const transmitterMatches = await MasterTransmitter.findAll({
          where: { name: { [Op.iLike]: `%${body.transmitter_name}%` } },
          attributes: ["id"],
          raw: true
        });
        matchingTransmitterIds = transmitterMatches.map(t => t.id);
      }

      if (body.receiver_name) {
        const receiverMatches = await MasterReceiver.findAll({
          where: { name: { [Op.iLike]: `%${body.receiver_name}%` } },
          attributes: ["id"],
          raw: true
        });
        matchingReceiverIds = receiverMatches.map(r => r.id);
      }

      const controllerConditions = {};
      if (body.controller_id) controllerConditions.id = body.controller_id;
      if (body.transmitter_id) controllerConditions.transmitter_id = body.transmitter_id;
      if (body.receiver_id) controllerConditions.receiver_id = body.receiver_id;
      if (matchingTransmitterIds.length) controllerConditions.transmitter_id = { [Op.in]: matchingTransmitterIds };
      if (matchingReceiverIds.length) controllerConditions.receiver_id = { [Op.in]: matchingReceiverIds };

      const controllerMatches = await DroneController.findAll({
        where: controllerConditions,
        attributes: ["drone_id"],
        raw: true
      });

      const ids = [...new Set(controllerMatches.map(c => c.drone_id))];
      droneIdSets.push(new Set(ids));
    }

    // 7. Landing gear filter
    if (body.landing_gear_id || body.landing_gear_name) {
      let matchingLandingGearIds = [];
      anyFilterProvided = true;

      if (body.landing_gear_name) {
        const gearMatches = await MasterLandingGear.findAll({
          where: { name: { [Op.iLike]: `%${body.landing_gear_name}%` } },
          attributes: ["id"],
          raw: true
        });
        matchingLandingGearIds = gearMatches.map(g => g.id);
      }

      if (body.landing_gear_id) matchingLandingGearIds.push(body.landing_gear_id);
      matchingLandingGearIds = [...new Set(matchingLandingGearIds)];

      if (matchingLandingGearIds.length) {
        const droneGearMatches = await DroneLandingGear.findAll({
          where: { landing_gear_id: { [Op.in]: matchingLandingGearIds } },
          attributes: ["drone_id"],
          raw: true
        });

        const ids = [...new Set(droneGearMatches.map(g => g.drone_id))];
        droneIdSets.push(new Set(ids));
      }
    }

    // 8. Motors filter
    if (body.motor_id || body.motor_name) {
      let matchingMotorIds = [];
      anyFilterProvided = true;

      if (body.motor_name) {
        const motorMatches = await MasterMotor.findAll({
          where: { name: { [Op.iLike]: `%${body.motor_name}%` } },
          attributes: ["id"],
          raw: true
        });
        matchingMotorIds = motorMatches.map(m => m.id);
      }

      if (body.motor_id) matchingMotorIds.push(body.motor_id);
      matchingMotorIds = [...new Set(matchingMotorIds)];

      if (matchingMotorIds.length) {
        const droneMotorMatches = await DroneMotor.findAll({
          where: { motor_id: { [Op.in]: matchingMotorIds } },
          attributes: ["drone_id"],
          raw: true
        });

        const ids = [...new Set(droneMotorMatches.map(m => m.drone_id))];
        droneIdSets.push(new Set(ids));
      }
    }

    // User Address filter 

    // ---------- UserAddress filter ----------
    let matchingUserIds = [];
    // ---------- UserAddress filter ----------
if (
  body.lane_1 || body.lane_2 || body.state || body.district ||
  body.block || body.village || body.pincode || body.state_name || body.district_name || body.block_name
)

{
  let matchingUserIds = [];
  anyFilterProvided = true;

  // Lane 1
  if (body.lane_1) {
    const lane1Matches = await DroneAddress.findAll({
      where: { lane_1: { [Op.iLike]: `%${body.lane_1}%` } },
      attributes: ["drone_id"], raw: true
    });
    matchingUserIds.push(...lane1Matches.map(a => a.drone_id));
  }

  // Lane 2
  if (body.lane_2) {
    const lane2Matches = await DroneAddress.findAll({
      where: { lane_2: { [Op.iLike]: `%${body.lane_2}%` } },
      attributes: ["drone_id"], raw: true
    });
    matchingUserIds.push(...lane2Matches.map(a => a.drone_id));
  }

  // State
  if (body.state) {
    const stateMatches = await DroneAddress.findAll({
      where: { state: body.state },
      attributes: ["drone_id"], raw: true
    });
    matchingUserIds.push(...stateMatches.map(a => a.drone_id));
  }

  // District
  if (body.district) {
    const districtMatches = await DroneAddress.findAll({
      where: { district: body.district },
      attributes: ["drone_id"], raw: true
    });
    matchingUserIds.push(...districtMatches.map(a => a.drone_id));
  }

  // Block
  if (body.block) {
    const blockMatches = await DroneAddress.findAll({
      where: { block: body.block },
      attributes: ["drone_id"], raw: true
    });
    matchingUserIds.push(...blockMatches.map(a => a.drone_id));
  }

  // Block Name 
 

  // Village
  if (body.village) {
    const villageMatches = await DroneAddress.findAll({
      where: { village: { [Op.iLike]: `%${body.village}%` }  },
      attributes: ["drone_id"], raw: true
    });
    matchingUserIds.push(...villageMatches.map(a => a.drone_id));
  }

  // Pincode
  if (body.pincode) {
    const pincodeMatches = await DroneAddress.findAll({
      where: { pincode: body.pincode },
      attributes: ["drone_id"], raw: true
    });
    matchingUserIds.push(...pincodeMatches.map(a => a.drone_id));
  }

  // State filter
  console.log("hello state_name",body.state_name);
if (body.state_name) {
  const stateRecord = await MasterState.findOne({
    where: { state_name: { [Op.iLike]: `%${body.state_name}%` }  },
    
    attributes: ["id"],
    raw: true
  }
);
console.log("stateRecords",stateRecord)


  if (stateRecord) {
    const stateMatches = await DroneAddress.findAll({
      where: { state: stateRecord.id },
      attributes: ["drone_id"],
      raw: true
    });
    matchingUserIds.push(...stateMatches.map(a => a.drone_id));
    console.log("stateMatches",stateMatches)
    console.log("stateMatches.map(a => a.drone_id)",stateMatches.map(a => a.drone_id));
  }
}

// District filter
if (body.district_name) {
  const districtRecord = await MasterDistrict.findOne({
    where: { district_name: { [Op.iLike]: `%${body.district_name}%` }   },
    attributes: ["id"],
    raw: true
  });

  if (districtRecord) {
    const districtMatches = await DroneAddress.findAll({
      where: { district: districtRecord.id },
      attributes: ["drone_id"],
      raw: true
    });
    matchingUserIds.push(...districtMatches.map(a => a.drone_id));
  }
}

// Block filter
if (body.block_name) {
  const blockRecord = await MasterBlock.findOne({
    where: { block_name: { [Op.iLike]: `%${body.block_name}%` }  },
    attributes: ["id"],
    raw: true
  });

  if (blockRecord) {
    const blockMatches = await DroneAddress.findAll({
      where: { block: blockRecord.id },
      attributes: ["drone_id"],
      raw: true
    });
    matchingUserIds.push(...blockMatches.map(a => a.drone_id));
  }
}


  // Add unique IDs into Set
  if (matchingUserIds.length > 0) {
    droneIdSets.push(new Set(matchingUserIds));
  }
}



    // Finalize intersection of drone_id sets if any
  // Finalize union of drone_id sets if any

// let finalDroneIds = null;
// if (droneIdSets.length > 0) {
//   finalDroneIds = droneIdSets.reduce((acc, set) => {
//     if (!acc) return set;
//     return new Set([...acc].filter(id => set.has(id))); // intersection
//   }, null);

//   if (finalDroneIds.size === 0) {
//     return res.status(200).json({ success: true, data: [] });
//   }
//   whereConditions.id = { [Op.in]: [...finalDroneIds] };
// }



// //  let finalDroneIds = null;
// let hasAnyFilter = (
//   Object.keys(whereConditions).length > 0 ||
//   droneIdSets.length > 0
// );

// // If any filter produced a droneIdSets, do intersection
// if (droneIdSets.length > 0) {
//   finalDroneIds = droneIdSets.reduce((acc, set) => {
//     if (!acc) return set;
//     return new Set([...acc].filter(id => set.has(id)));
//   }, null);

//   // If intersection is empty, return empty array
//   if (!finalDroneIds || finalDroneIds.size === 0) {
//     return res.status(200).json({ success: true, data: [] });
//   }
// }

// // Now build finalWhere
// let finalWhere;
// if (droneIdSets.length > 0) {
//   // Use intersection of IDs
//   finalWhere = { ...whereConditions, id: { [Op.in]: [...finalDroneIds] } };
// } else if (hasAnyFilter) {
//   // Filters present, but no droneIdSets (direct filters only)
//   finalWhere = { ...whereConditions };
// } else {
//   // No filters at all, fetch all
//   finalWhere = {};
// }

if (anyFilterProvided && Object.keys(whereConditions).length === 0 && droneIdSets.length === 0) {
      // this means user requested filters but there are no constraints: return empty
      return res.status(200).json({ success: true, count: 0, page: 1, page_size: 25, total_pages: 0, data: [] });
    }

    // Build finalWhere
    const hasAnyFilter = (Object.keys(whereConditions).length > 0 || droneIdSets.length > 0 || anyFilterProvided);
    let finalWhere;
    let finalDroneIds = null;
    if (droneIdSets.length > 0) {
  finalDroneIds = droneIdSets.reduce((acc, set) => {
    if (!acc) return set;
    return new Set([...acc].filter(id => set.has(id)));
  }, null);

  if (!finalDroneIds || finalDroneIds.size === 0) {
    return res.status(200).json({ success: true, count: 0, page: 1, page_size: 25, total_pages: 0, data: [] });
  }
}
    if (droneIdSets.length > 0) {
      finalWhere = { ...whereConditions, id: { [Op.in]: [...finalDroneIds] } };``
    } else if (hasAnyFilter) {
      finalWhere = { ...whereConditions };
    } else {
      finalWhere = {};
    }
    // -------------------------
    // Pagination params
    // -------------------------
    const page = parseInt(body.page) > 0 ? parseInt(body.page) : 1;
    const pageSize = parseInt(body.page_size) > 0 ? Math.min(parseInt(body.page_size), 100) : 25;
    const offset = (page - 1) * pageSize;
    const limit = pageSize;

    // -------------------------
    // Decide where to sort: DB (drone columns) or JS (related fields)
    // -------------------------
    const DRONE_COLUMNS = new Set([
      'id', 'owner_id', 'model', 'name', 'range', 'speed', 'weight',
      'is_level_sensor', 'level_sensor_id', 'is_allen_key', 'allen_key_id',
      'water_pump_id', 'is_extension_board', 'extension_board_id',
      'created_by', 'modified_by', 'created_on', 'modified_on', 'createdAt', 'updatedAt'
    ]);

    const isDroneColumnOrder = DRONE_COLUMNS.has(orderBy);

    // Helper: batch enrichment function (groups all related rows by drone_id and fetch masters)
    const enrichDronesBatch = async (droneRows) => {
      if (!droneRows || droneRows.length === 0) return [];

      const dronesMap = {};
      const droneIds = droneRows.map(d => d.id);
      droneRows.forEach(d => dronesMap[d.id] = { ...d.dataValues || d }); // ensure plain object

      // Helper groupBy
      const groupBy = (arr, key) => arr.reduce((acc, item) => {
        const k = item[key];
        acc[k] = acc[k] || [];
        acc[k].push(item);
        return acc;
      }, {});

      // 1) DroneArms + MasterArms
      const droneArmsRows = await DroneArms.findAll({
        where: { drone_id: { [Op.in]: droneIds } },
        attributes: ["drone_id", "arms_id", "arms_qty"],
        raw: true
      });

      console.log("hiigidjsh",droneIds)
      const armsByDrone = groupBy(droneArmsRows, 'drone_id');
      const uniqueArmsIds = [...new Set(droneArmsRows.map(r => r.arms_id))];
      const masterArmsRows = uniqueArmsIds.length ? await MasterArms.findAll({
        where: { id: { [Op.in]: uniqueArmsIds } },
        attributes: ["id", "name"],
        raw: true
      }) : [];
      const masterArmsById = {};
      masterArmsRows.forEach(a => masterArmsById[a.id] = a);

      // 2) Batteries + MasterBattery
      const droneBatteryRows = await DroneBattery.findAll({
        where: { drone_id: { [Op.in]: droneIds } },
        attributes: ["drone_id", "battery_id", "battery_qty"],
        raw: true
      });
      const batteriesByDrone = groupBy(droneBatteryRows, 'drone_id');
      const uniqueBatteryIds = [...new Set(droneBatteryRows.map(r => r.battery_id))];
      const masterBatteriesRows = uniqueBatteryIds.length ? await MasterBattery.findAll({
        where: { id: { [Op.in]: uniqueBatteryIds } },
        attributes: ["id", "name", "brand_name", "capacity", "cell_number"],
        raw: true
      }) : [];
      const masterBatteriesById = {};
      masterBatteriesRows.forEach(b => masterBatteriesById[b.id] = b);

      // 3) Chargers + MasterCharger
      const droneChargerRows = await DroneCharger.findAll({
        where: { drone_id: { [Op.in]: droneIds } },
        attributes: ["drone_id", "charger_id", "is_charger_cable", "ischarger_pcable"],
        raw: true
      });
      const chargersByDrone = groupBy(droneChargerRows, 'drone_id');
      const uniqueChargerIds = [...new Set(droneChargerRows.map(r => r.charger_id))];
      const masterChargerRows = uniqueChargerIds.length ? await MasterCharger.findAll({
        where: { id: { [Op.in]: uniqueChargerIds } },
        attributes: ["id", "name", "brand_name", "desc"],
        raw: true
      }) : [];
      const masterChargerById = {};
      masterChargerRows.forEach(c => masterChargerById[c.id] = c);

      // 4) Controllers + Transmitters/Receivers
      const droneControllerRows = await DroneController.findAll({
        where: { drone_id: { [Op.in]: droneIds } },
        attributes: ["drone_id", "id", "transmitter_id", "receiver_id"],
        raw: true
      });
      const controllersByDrone = groupBy(droneControllerRows, 'drone_id');
      const uniqueTransmitterIds = [...new Set(droneControllerRows.map(r => r.transmitter_id).filter(Boolean))];
      const uniqueReceiverIds = [...new Set(droneControllerRows.map(r => r.receiver_id).filter(Boolean))];
      const transmitterRows = uniqueTransmitterIds.length ? await MasterTransmitter.findAll({
        where: { id: { [Op.in]: uniqueTransmitterIds } },
        attributes: ["id", "name", "brand_name", "transmitter_type", "desc"],
        raw: true
      }) : [];
      const receiverRows = uniqueReceiverIds.length ? await MasterReceiver.findAll({
        where: { id: { [Op.in]: uniqueReceiverIds } },
        attributes: ["id", "name", "brand_name", "receiver_type", "desc"],
        raw: true
      }) : [];
      const transmitterById = {}; transmitterRows.forEach(t => transmitterById[t.id] = t);
      const receiverById = {}; receiverRows.forEach(r => receiverById[r.id] = r);

      // 5) Landing gears + MasterLandingGear
      const droneLandingGearRows = await DroneLandingGear.findAll({
        where: { drone_id: { [Op.in]: droneIds } },
        attributes: ["drone_id", "landing_gear_id"],
        raw: true
      });
      const landingGearByDrone = groupBy(droneLandingGearRows, 'drone_id');
      const uniqueLandingGearIds = [...new Set(droneLandingGearRows.map(r => r.landing_gear_id).filter(Boolean))];
      const masterLandingGearRows = uniqueLandingGearIds.length ? await MasterLandingGear.findAll({
        where: { id: { [Op.in]: uniqueLandingGearIds } },
        attributes: ["id", "name", "brand_name", "desc"],
        raw: true
      }) : [];
      const masterLandingGearById = {};
      masterLandingGearRows.forEach(g => masterLandingGearById[g.id] = g);

      // 6) Motors + MasterMotor
      const droneMotorRows = await DroneMotor.findAll({
        where: { drone_id: { [Op.in]: droneIds } },
        attributes: ["drone_id", "motor_id", "motor_qty"],
        raw: true
      });
      const motorsByDrone = groupBy(droneMotorRows, 'drone_id');
      const uniqueMotorIds = [...new Set(droneMotorRows.map(r => r.motor_id).filter(Boolean))];
      const masterMotorRows = uniqueMotorIds.length ? await MasterMotor.findAll({
        where: { id: { [Op.in]: uniqueMotorIds } },
        attributes: ["id", "name", "brand_name", "desc"],
        raw: true
      }) : [];
      const masterMotorById = {};
      masterMotorRows.forEach(m => masterMotorById[m.id] = m);
// ------------------- NEW: Drone Address -------------------
// const droneAddressRows = await DroneAddress.findAll({
//         where: { drone_id: { [Op.in]: droneIds } },

// });

// 1️⃣ Fetch all drone addresses for the given drone IDs
const droneAddressRows = (await DroneAddress.findAll({
  where: { drone_id: { [Op.in]: droneIds } },
  raw: true
})) || []; // default to empty array
console.log(droneAddressRows);

const [states = [],districts=[],blocks = []] = await Promise.all([
  // , districts = [],
  MasterState.findAll({ raw: true }),
  MasterDistrict.findAll({ raw: true }),
  MasterBlock.findAll({ raw: true }),
]);

console.log("blocks",blocks);
console.log("districkts",districts);
console.log("states",states);

const stateMap = Object.fromEntries((states || []).map(s => [s.id, s.state_name]));
const districtMap = Object.fromEntries((districts || []).map(d => [d.id, d.district_name]));
const blockMap = Object.fromEntries((blocks || []).map(b => [b.id, b.block_name]));

console.log("blockMap",blockMap);
console.log("districtMap",districtMap);

const droneAddresses = (droneAddressRows || []).map(addr => ({
  ...addr,
  state_name: stateMap[addr.state] || null,
  district_name: districtMap[addr.district] || null,
  block_name: blockMap[addr.block] || null,
}));



console.log("droneAddresses",droneAddresses);



// 1. Get all created_by values from Drone table
const idss = await db.Drone1.findAll({
  attributes: ['created_by'],
  raw: true
});

console.log("crreated by",idss.map(d => d.created_by));

// 2. Extract unique userIds
const userIds = [...new Set(idss.map(d => d.created_by).filter(Boolean))];
    let userMap = {};
if (userIds.length > 0) {
  const users = await db.UserProfile.findAll({
    where: { user_id: { [Op.in]: userIds } },
    attributes: ['user_id', 'first_name'],
    raw: true
  });

  console.log("users",users)
  userMap = users.reduce((acc, user) => {
    acc[user.user_id] = user.first_name;
    return acc;
  }, {});

  console.log(userMap)
}



const addressByDroneId = {};
droneAddresses.forEach(addr => {
  const filteredAddr = {
    lane_1: addr.lane_1,
    lane_2: addr.lane_2,
    state:addr.state,
    district: addr.district,
    block: addr.block,
    village: addr.village,
    pincode: addr.pincode,
    state_name: addr.state_name,
    block_name: addr.block_name,
    district_name:addr.district_name,
  };

  if (!addressByDroneId[addr.drone_id]) {
    addressByDroneId[addr.drone_id] = [];
  }

  addressByDroneId[addr.drone_id].push(filteredAddr);
});


      // Build enriched records
      const enriched = droneRows.map(d => {
        const id = d.id;
        const base = { ...d.dataValues || d };

        // arms
        const rawArms = armsByDrone[id] || [];
        const arms = rawArms.map(a => ({
          master_arm_id: a.arms_id,
          qty: a.arms_qty,
          master_arm_name: masterArmsById[a.arms_id] ? masterArmsById[a.arms_id].name : null
        }));

        // batteries
        const rawBats = batteriesByDrone[id] || [];
        const batteries = rawBats.map(b => ({
          master_battery_id: b.battery_id,
          qty: b.battery_qty,
          master_battery_name: masterBatteriesById[b.battery_id] ? masterBatteriesById[b.battery_id].name : null,
          brand_name: masterBatteriesById[b.battery_id] ? masterBatteriesById[b.battery_id].brand_name : null,
          capacity: masterBatteriesById[b.battery_id] ? masterBatteriesById[b.battery_id].capacity : null,
          cell_number: masterBatteriesById[b.battery_id] ? masterBatteriesById[b.battery_id].cell_number : null
        }));

        // chargers
        const rawChargers = chargersByDrone[id] || [];
        const chargers = rawChargers.map(c => ({
          master_charger_id: c.charger_id,
          master_charger_name: masterChargerById[c.charger_id] ? masterChargerById[c.charger_id].name : null,
          brand_name: masterChargerById[c.charger_id] ? masterChargerById[c.charger_id].brand_name : null,
          description: masterChargerById[c.charger_id] ? masterChargerById[c.charger_id].desc : null,
          is_charger_cable: c.is_charger_cable,
          ischarger_pcable: c.ischarger_pcable
        }));

        // controllers
        const rawControllers = controllersByDrone[id] || [];
        const controllers = rawControllers.map(ctrl => {
          const transmitter = transmitterById[ctrl.transmitter_id] || null;
          const receiver = receiverById[ctrl.receiver_id] || null;
          return {
            controller_id: ctrl.id,
            transmitter_id: ctrl.transmitter_id,
            transmitter_name: transmitter ? transmitter.name : null,
            transmitter_brand_name: transmitter ? transmitter.brand_name : null,
            transmitter_type: transmitter ? transmitter.transmitter_type : null,
            transmitter_description: transmitter ? transmitter.desc : null,
            receiver_id: ctrl.receiver_id,
            receiver_name: receiver ? receiver.name : null,
            receiver_brand_name: receiver ? receiver.brand_name : null,
            receiver_type: receiver ? receiver.receiver_type : null,
            receiver_description: receiver ? receiver.desc : null
          };
        });

        // landing gears
        const rawLanding = landingGearByDrone[id] || [];
        const landing_gears = rawLanding.map(g => ({
          master_landing_gear_id: g.landing_gear_id,
          master_landing_gear_name: masterLandingGearById[g.landing_gear_id] ? masterLandingGearById[g.landing_gear_id].name : null,
          brand_name: masterLandingGearById[g.landing_gear_id] ? masterLandingGearById[g.landing_gear_id].brand_name : null,
          description: masterLandingGearById[g.landing_gear_id] ? masterLandingGearById[g.landing_gear_id].desc : null
        }));

        // motors
        const rawMotors = motorsByDrone[id] || [];
        const motors = rawMotors.map(m => ({
          master_motor_id: m.motor_id,
          motor_qty: m.motor_qty,
          master_motor_name: masterMotorById[m.motor_id] ? masterMotorById[m.motor_id].name : null,
          brand_name: masterMotorById[m.motor_id] ? masterMotorById[m.motor_id].brand_name : null,
          description: masterMotorById[m.motor_id] ? masterMotorById[m.motor_id].desc : null
        }));
        const drone_address = addressByDroneId[d.id] || [];


        return {
          ...base,
          arms,
          batteries,
          chargers,
          controllers,
          landing_gears,
          motors,drone_address,
      
        };
      });

      return enriched;
    };
    
    // ---------- <> --------------------
    // ...existing code...

// Finalize intersection of drone_id sets if any
// let finalDroneIds = null;
// if (droneIdSets.length > 0) {
//   finalDroneIds = droneIdSets.reduce((acc, set) => {
//     if (!acc) return set;
//     return new Set([...acc].filter(id => set.has(id))); // intersection
//   }, null);

//   if (!finalDroneIds || finalDroneIds.size === 0) {
//     // At least one filter produced no matches
//     return res.status(200).json({ success: true, data: [] });
//   }
// }

// // Build finalWhere
// let finalWhere;
// if (droneIdSets.length > 0) {
//   finalWhere = { ...whereConditions, id: { [Op.in]: [...finalDroneIds] } };
// } else if (Object.keys(whereConditions).length > 0) {
//   finalWhere = { ...whereConditions };
// } else {
//   finalWhere = {};
// }

// // --- ADD THIS CHECK RIGHT AFTER FINALWHERE IS BUILT ---
// const hasAnyFilter =
//   Object.keys(whereConditions).length > 0 ||
//   droneIdSets.length > 0;

// // If any filter is present and no drones match, return empty array
// if (hasAnyFilter) {
//   const count = await Drone1.count({ where: finalWhere });
//   if (count === 0) {
//     return res.status(200).json({
//       success: true,
//       count: 0,
//       page: 1,
//       page_size: 25,
//       total_pages: 0,
//       data: []
//     });
//   }
// }
// ...existing code...
    
    // end enrichDronesBatch

    // -------------------------
    // Fetch + sort + paginate
    // -------------------------
    // If ordering by drone column => let DB order and LIMIT/OFFSET there (efficient)
    // Else => fetch all matching drones, enrich, sort in JS, then paginate
    let totalCount = await Drone1.count({ where: finalWhere });

    let dronesToReturn = [];
    
    if (isDroneColumnOrder) {
      // DB-side ordering + pagination
      const dronesPage = await Drone1.findAll({
        where: finalWhere,
        attributes: { exclude: ["createdAt", "updatedAt"] },
        order: [[orderBy, orderType === -1 ? 'DESC' : 'ASC']],
        offset: offset,
        limit: limit
      });

      // Batch-enrich only the page
      const enrichedPage = await enrichDronesBatch(dronesPage);
      dronesToReturn = enrichedPage;
    } else {
      // JS-side ordering: fetch ALL matching drones (no offset/limit)
      const allMatchingDrones = await Drone1.findAll({
        where: finalWhere,
        attributes: { exclude: ["createdAt", "updatedAt"] }
      });

      // If none
      if (!allMatchingDrones || allMatchingDrones.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
            page,
            page_size: pageSize,
          total_pages: 0,
          data: []
        });
      }

      // Enrich all
      const enrichedAll = await enrichDronesBatch(allMatchingDrones);

      // Generic sorter for enriched records
      const getSortValue = (dr, key) => {
        if (key.includes('.')) {
          const parts = key.split('.');
          let v = dr;
          for (const p of parts) {
            if (v == null) return null;
            if (Array.isArray(v)) v = v[0];
            v = v[p];
          }
          return v;
        }

        if (key in dr) return dr[key];

        // Common related fields handled explicitly
        switch (key) {
          case 'arms_qty':
            return (dr.arms || []).reduce((s, a) => s + (Number(a.qty) || 0), 0);
          case 'battery_qty':
          case 'batteries_qty':
            return (dr.batteries || []).reduce((s, b) => s + (Number(b.qty) || 0), 0);
          case 'motor_qty':
            return (dr.motors || []).reduce((s, m) => s + (Number(m.motor_qty) || 0), 0);
          case 'charger_name':
          case 'master_charger_name':
            return dr.chargers && dr.chargers[0] ? dr.chargers[0].master_charger_name : null;
          case 'charger_brand_name':
            return dr.chargers && dr.chargers[0] ? dr.chargers[0].brand_name : null;
          case 'battery_capacity':
          case 'capacity':
            return dr.batteries && dr.batteries[0] ? dr.batteries[0].capacity : null;
          case 'transmitter_name':
            return dr.controllers && dr.controllers[0] ? dr.controllers[0].transmitter_name : null;
          case 'receiver_name':
            return dr.controllers && dr.controllers[0] ? dr.controllers[0].receiver_name : null;
          case 'landing_gear_name':
            return dr.landing_gears && dr.landing_gears[0] ? dr.landing_gears[0].master_landing_gear_name : null;
          default:
            break;
        }

        // fallback: check arrays for a matching property on first element
        const arrays = ['arms', 'batteries', 'chargers', 'controllers', 'landing_gears', 'motors'];
        for (const arrName of arrays) {
          const arr = dr[arrName];
          if (Array.isArray(arr) && arr.length && (key in arr[0])) {
            return arr[0][key];
          }
        }

        return null;
      };
      // console.log("key is:" , key);


      

      const multiplier = orderType === -1 ? -1 : 1;

      enrichedAll.sort((a, b) => {
        const va = getSortValue(a, orderBy);
        const vb = getSortValue(b, orderBy);

        // null handling: put nulls last
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;

        // numeric compare when possible
        const na = typeof va === 'number' ? va : (Number(va) !== NaN ? Number(va) : null);
        const nb = typeof vb === 'number' ? vb : (Number(vb) !== NaN ? Number(vb) : null);

        if (na != null && nb != null) return (na - nb) * multiplier;

        // string fallback
        const sa = (va && va.toString) ? va.toString() : '';
        const sb = (vb && vb.toString) ? vb.toString() : '';
        return sa.localeCompare(sb) * multiplier;
      });

      
      
      // paginate the sorted enriched array
      totalCount = enrichedAll.length;
      const totalPages = Math.ceil(totalCount / pageSize);
      const paginated = enrichedAll.slice(offset, offset + limit);
      dronesToReturn = paginated;

      if (body.export === true) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Drones");

  worksheet.columns = [
    { header: "Drone ID", key: "id", width: 15 },
    { header: "Name", key: "name", width: 25 },
    { header: "Model", key: "model", width: 20 },
    { header: "Owner ID", key: "owner_id", width: 15 },
    { header: "Range", key: "range", width: 15 },
    { header: "Speed", key: "speed", width: 15 },
    { header: "Weight", key: "weight", width: 15 },
    { header: "Created On", key: "created_on", width: 20 },
    { header: "Modified On", key: "modified_on", width: 20 },
    { header: "Arms", key: "arms", width: 30 },
    { header: "Batteries", key: "batteries", width: 30 },
    { header: "Chargers", key: "chargers", width: 30 },
    { header: "Controllers", key: "controllers", width: 30 },
    { header: "Landing Gears", key: "landing_gears", width: 30 },
    { header: "Motors", key: "motors", width: 30 },
  ];

  dronesToReturn.forEach((drone) => {
    worksheet.addRow({
      id: drone.id,
      name: drone.name,
      model: drone.model,
      owner_id: drone.owner_id,
      range: drone.range,
      speed: drone.speed,
      weight: drone.weight,
      created_on: drone.created_on,
      modified_on: drone.modified_on,
      arms: (drone.arms || []).map(a => `${a.master_arm_name} (x${a.qty})`).join(", "),
      batteries: (drone.batteries || []).map(b => `${b.master_battery_name} (x${b.qty})`).join(", "),
      chargers: (drone.chargers || []).map(c => `${c.master_charger_name}`).join(", "),
      controllers: (drone.controllers || []).map(ctrl => 
        `TX:${ctrl.transmitter_name || ''}, RX:${ctrl.receiver_name || ''}`
      ).join(" | "),
      landing_gears: (drone.landing_gears || []).map(g => g.master_landing_gear_name).join(", "),
      motors: (drone.motors || []).map(m => `${m.master_motor_name} (x${m.motor_qty})`).join(", "),
    });
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=drones.xlsx");

  await workbook.xlsx.write(res);
  return res.end();
}


      return res.status(200).json({
        success: true,
        count: paginated.length,
        page,
        page_size: pageSize,
        total_pages: totalPages,
        data: dronesToReturn
      });
    }



    // If we reached here, it was DB-ordered branch (we enriched the fetched page)
    const totalPages = Math.ceil(totalCount / pageSize);
if (dronesToReturn && dronesToReturn.length > 0) {
  // Collect all unique created_by and modified_by user IDs
  const createdByIds = [...new Set(dronesToReturn.map(d => d.created_by).filter(Boolean))];
  const modifiedByIds = [...new Set(dronesToReturn.map(d => d.modified_by).filter(Boolean))];
  const allUserIds = [...new Set([...createdByIds, ...modifiedByIds])];

  // Fetch first_name and last_name from UserProfile table
  let userMap = {};
  if (allUserIds.length > 0) {
    const users = await db.UserProfile.findAll({
      where: { user_id: { [Op.in]: allUserIds } },
      attributes: ['user_id', 'first_name', 'last_name'],
      raw: true
    });
    userMap = users.reduce((acc, user) => {
      acc[user.user_id] = {
        first_name: user.first_name,
        last_name: user.last_name
      };
      return acc;
    }, {});
  }

  dronesToReturn = dronesToReturn.map(drone => ({
    ...drone,
    created_by_name: drone.created_by
      ? [
          userMap[drone.created_by]?.first_name || '',
          userMap[drone.created_by]?.last_name || ''
        ].filter(Boolean).join(' ')
      : null,
    modified_by_name: drone.modified_by
      ? [
          userMap[drone.modified_by]?.first_name || '',
          userMap[drone.modified_by]?.last_name || ''
        ].filter(Boolean).join(' ')
      : null
  }));
}
    return res.status(200).json({
      success: true,
      count: dronesToReturn.length,
      page,
      page_size: pageSize,
      total_pages: totalPages,
      data: dronesToReturn
    });

  } catch (error) {
    console.error("Error in universal drone filter:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error}`
    });
  }
};



export const getDroneByIds = async (req, res) => {
  try {
    const { id } = req.params;

    // Basic validation
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Drone ID is required"
      });
    }

    // Fetch basic drone details
    const drone = await Drone1.findByPk(id, {
      attributes: { exclude: ["createdAt", "updatedAt"] }
    });

    if (!drone) {
      return res.status(404).json({
        success: false,
        message: "Drone not found"
      });
    }

    // Fetch and enrich with arms data
    const droneArms = await DroneArms.findAll({
      where: { drone_id: id },
      attributes: ["arms_id", "arms_qty"],
      raw: true
    });

    const arms = await Promise.all(droneArms.map(async (arm) => {
      const masterArm = await MasterArms.findOne({
        where: { id: arm.arms_id },
        attributes: ["id", "name"],
        raw: true
      });

      return {
        master_arm_id: arm.arms_id,
        qty: arm.arms_qty,
        master_arm_name: masterArm ? masterArm.name : null
      };
    }));

    // Fetch and enrich with battery data
    const droneBatteries = await DroneBattery.findAll({
      where: { drone_id: id },
      attributes: ["battery_id", "battery_qty"],
      raw: true
    });

    const batteries = await Promise.all(droneBatteries.map(async (battery) => {
      const masterBattery = await MasterBattery.findOne({
        where: { id: battery.battery_id },
        attributes: ["id", "name", "brand_name", "capacity", "cell_number"],
        raw: true
      });

      return {
        master_battery_id: battery.battery_id,
        qty: battery.battery_qty,
        master_battery_name: masterBattery ? masterBattery.name : null,
        brand_name: masterBattery ? masterBattery.brand_name : null,
        capacity: masterBattery ? masterBattery.capacity : null,
        cell_number: masterBattery ? masterBattery.cell_number : null
      };
    }));

    // Fetch and enrich with charger data
    const droneChargers = await DroneCharger.findAll({
      where: { drone_id: id },
      attributes: ["charger_id", "is_charger_cable", "ischarger_pcable"],
      raw: true
    });

    const chargers = await Promise.all(droneChargers.map(async (charger) => {
      const masterCharger = await MasterCharger.findOne({
        where: { id: charger.charger_id },
        attributes: ["id", "name", "brand_name", "desc"],
        raw: true
      });

      return {
        master_charger_id: charger.charger_id,
        master_charger_name: masterCharger ? masterCharger.name : null,
        brand_name: masterCharger ? masterCharger.brand_name : null,
        description: masterCharger ? masterCharger.desc : null,
        is_charger_cable: charger.is_charger_cable,
        ischarger_pcable: charger.ischarger_pcable
      };
    }));

    // Fetch and enrich with controller data
    const droneControllers = await DroneController.findAll({
      where: { drone_id: id },
      attributes: ["id", "transmitter_id", "receiver_id"],
      raw: true
    });

    const controllers = await Promise.all(droneControllers.map(async (controller) => {
      const transmitter = await MasterTransmitter.findOne({
        where: { id: controller.transmitter_id },
        attributes: ["id", "name", "brand_name", "transmitter_type", "desc"],
        raw: true
      });

      const receiver = await MasterReceiver.findOne({
        where: { id: controller.receiver_id },
        attributes: ["id", "name", "brand_name", "receiver_type", "desc"],
        raw: true
      });

      return {
        controller_id: controller.id,
        transmitter_id: controller.transmitter_id,
        transmitter_name: transmitter ? transmitter.name : null,
        transmitter_brand_name: transmitter ? transmitter.brand_name : null,
        transmitter_type: transmitter ? transmitter.transmitter_type : null,
        transmitter_description: transmitter ? transmitter.desc : null,
        receiver_id: controller.receiver_id,
        receiver_name: receiver ? receiver.name : null,
        receiver_brand_name: receiver ? receiver.brand_name : null,
        receiver_type: receiver ? receiver.receiver_type : null,
        receiver_description: receiver ? receiver.desc : null
      };
    }));

    // Fetch and enrich with landing gear data
    const droneLandingGears = await DroneLandingGear.findAll({
      where: { drone_id: id },
      attributes: ["landing_gear_id"],
      raw: true
    });

    const landing_gears = await Promise.all(droneLandingGears.map(async (gear) => {
      const masterGear = await MasterLandingGear.findOne({
        where: { id: gear.landing_gear_id },
        attributes: ["id", "name", "brand_name", "desc"],
        raw: true
      });

      return {
        master_landing_gear_id: gear.landing_gear_id,
        master_landing_gear_name: masterGear ? masterGear.name : null,
        brand_name: masterGear ? masterGear.brand_name : null,
        description: masterGear ? masterGear.desc : null
      };
    }));

    // Fetch and enrich with motor data
    const droneMotors = await DroneMotor.findAll({
      where: { drone_id: id },
      attributes: ["motor_id", "motor_qty"],
      raw: true
    });

    const motors = await Promise.all(droneMotors.map(async (motor) => {
      const masterMotor = await MasterMotor.findOne({
        where: { id: motor.motor_id },
        attributes: ["id", "name", "brand_name", "desc"],
        raw: true
      });

      return {
        master_motor_id: motor.motor_id,
        motor_qty: motor.motor_qty,
        master_motor_name: masterMotor ? masterMotor.name : null,
        brand_name: masterMotor ? masterMotor.brand_name : null,
        description: masterMotor ? masterMotor.desc : null
      };
    }));

    // Combine all data
    const enrichedDrone = {
      ...drone.dataValues,
      arms,
      batteries,
      chargers,
      controllers,
      landing_gears,
      motors
    };

    
    return res.status(200).json({
      success: true,
      data: enrichedDrone
    });

  } catch (error) {
    console.error("Error fetching drone:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error}`
    });
  }
};