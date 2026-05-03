import db from "../models/index.js";
import { Op } from "sequelize";

const { ColumnSettings, UserProfile } = db;



// CREATE
export const createColumn = async (req, res) => {
  try {
    const { module, label, key, characters, is_sortable, is_filterable, filter_type } = req.body;

    const column = await ColumnSettings.create({
      module,
      label,
      key,
      characters,
      is_sortable,
      is_filterable,
      filter_type,
      created_by: req.user?.id || null,
    });

    res.status(201).json({ columnId: column.id, message: "Column Succefully created" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// READ all (with optional module filter)

export const getAllColumns = async (req, res) => {
  try {
    const { module } = req.query;
    let condition = {};

    if (module) {
      condition = { where: { module } };
    }

    const columns = await ColumnSettings.findAll(condition);

    const result = await Promise.all(
      columns.map(async (col) => {
        let createdByName = null;
        let modifiedByName = null;

        // Find creator name
        if (col.created_by) {
          const user = await UserProfile.findOne({
            where: { user_id: col.created_by },
            attributes: ["first_name", "last_name"],
          });
          if (user) createdByName = `${user.first_name} ${user.last_name}`;
        }

        // Find modifier name
        if (col.modified_by) {
          const user = await UserProfile.findOne({
            where: { user_id: col.modified_by },
            attributes: ["first_name", "last_name"],
          });
          if (user) modifiedByName = `${user.first_name} ${user.last_name}`;
        }

        // Convert to JSON and remove original IDs
        const colData = col.toJSON();
        delete colData.created_by;
        delete colData.modified_by;

        return {
          ...colData,
          created_by: createdByName,
          modified_by: modifiedByName,
        };
      })
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// READ one
export const getColumnById = async (req, res) => {
  try {
    const column = await ColumnSettings.findByPk(req.params.id);

    if (!column) {
      return res.status(404).json({ error: "Column not found" });
    }

    let createdByName = null;
    let modifiedByName = null;

    // Find creator name
    if (column.created_by) {
      const user = await UserProfile.findOne({
        where: { user_id: column.created_by },
        attributes: ["first_name", "last_name"],
      });

      if (user) {
        createdByName = `${user.first_name} ${user.last_name}`;
      }
    }

    // Find modifier name
    if (column.modified_by) {
      const user = await UserProfile.findOne({
        where: { user_id: column.modified_by },
        attributes: ["first_name", "last_name"],
      });

      if (user) {
        modifiedByName = `${user.first_name} ${user.last_name}`;
      }
    }

    // Convert to JSON and remove original IDs
    const columnData = column.toJSON();
    delete columnData.created_by;
    delete columnData.modified_by;

    res.json({
      ...columnData,
      created_by: createdByName,
      modified_by: modifiedByName,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// UPDATE
export const updateColumn = async (req, res) => {
  try {
    const column = await ColumnSettings.findByPk(req.params.id);
    if (!column) return res.status(404).json({ error: "Column not found" });

    await column.update({
      ...req.body,
      modified_by: req.user?.id || null,   // 👈 added
      modified_on: new Date()
    });
    res.json({ succuss: true, message: "Successfully updated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE
export const deleteColumn = async (req, res) => {
  try {
    const column = await ColumnSettings.findByPk(req.params.id);
    if (!column) return res.status(404).json({ error: "Column not found" });

    await column.destroy();
    res.json({ message: "Column deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// fitler 
export const filterColumns = async (req, res) => {
  try {
    let { order_by, order_type, page, page_size, ...filters } = req.body;

    // Default values
    order_by = order_by || "id";
    order_type = order_type?.toUpperCase() === "DESC" ? "DESC" : "ASC";
    page = page && page > 0 ? parseInt(page) : 1;
    page_size = page_size && page_size > 0 ? parseInt(page_size) : 10;

    const offset = (page - 1) * page_size;

    // Build condition for filtering
    const whereCondition = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        whereCondition[key] = value;
      }
    });

    // Fetch columns with pagination and sorting
    const { rows, count } = await ColumnSettings.findAndCountAll({
      where: whereCondition,
      order: [[order_by, order_type]],
      limit: page_size,
      offset,
    });

    // Add created_by_name and modified_by_name
    const result = await Promise.all(
      rows.map(async (col) => {
        let createdByName = null;
        let modifiedByName = null;

        if (col.created_by) {
          const user = await UserProfile.findOne({
            where: { user_id: col.created_by },
            attributes: ["first_name", "last_name"],
          });
          if (user) createdByName = `${user.first_name} ${user.last_name}`;
        }

        if (col.modified_by) {
          const user = await UserProfile.findOne({
            where: { user_id: col.modified_by },
            attributes: ["first_name", "last_name"],
          });
          if (user) modifiedByName = `${user.first_name} ${user.last_name}`;
        }

        const colData = col.toJSON();
        delete colData.created_by;
        delete colData.modified_by;

        return {
          ...colData,
          created_by: createdByName,
          modified_by: modifiedByName,
        };
      })
    );

    res.json({
      success: true,
      total: count,
      page,
      page_size,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
