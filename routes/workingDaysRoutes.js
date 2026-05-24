import express from "express";
import {
  createWorkingDays,
  filterWorkingDays,
  listWorkingDays,
  getWorkingDaysById,
  updateWorkingDays,
  deleteWorkingDays,
} from "../controllers/workingDays.controller.js";

const workingDaysRouter = express.Router();

// ── Specific routes first ──────────────────────────────
workingDaysRouter.get("/list",          listWorkingDays);      // simple full list for booking logic
workingDaysRouter.post("/filter",       filterWorkingDays);    // paginated + sorted table
workingDaysRouter.post("/create",       createWorkingDays);

// ── Param routes last ──────────────────────────────────
workingDaysRouter.get("/update/:id",    getWorkingDaysById);
workingDaysRouter.put("/update/:id",    updateWorkingDays);
workingDaysRouter.delete("/:id",        deleteWorkingDays);
workingDaysRouter.get("/:id",           getWorkingDaysById);

export default workingDaysRouter;