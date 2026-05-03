import db from "../models/index.js";

const {
 
  MasterState,
  MasterDistrict,
  MasterBlock,
 
} = db;

// ---------------------- STATES -----------------------
export const getStates = async (req, res) => {
  try {
    const states = await MasterState.findAll({
      attributes: ["id", "state_name"],
      order: [["state_name", "ASC"]],
    });

    return res.json(states);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch states",
      error: error.message,
    });
  }
};

// ---------------------- DISTRICTS BY STATE -----------------------
export const getDistrictsByState = async (req, res) => {
  try {
    const { state_id } = req.params;

    const districts = await MasterDistrict.findAll({
      where: { state_id },
      attributes: ["id", "district_name"],
      order: [["district_name", "ASC"]],
    });

    return res.json(districts);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch districts",
      error: error.message,
    });
  }
};

// ---------------------- BLOCKS BY DISTRICT -----------------------
export const getBlocksByDistrict = async (req, res) => {
  try {
    const { district_id } = req.params;

    const blocks = await MasterBlock.findAll({
      where: { district_id },
      attributes: ["id", "block_name"],
      order: [["block_name", "ASC"]],
    });

    return res.json(blocks);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch blocks",
      error: error.message,
    });
  }
};
