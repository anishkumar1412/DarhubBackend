import express from "express";
import {
  createFertilizer,
  getAllFertilizers,
  getFertilizerById,
  updateFertilizer,
  deleteFertilizer
} from "../controllers/Fertilizer.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";
import multer from "multer";
import upload from "../middleware/upload.js";

const router = express.Router();

function uploadSingle(field) {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (err instanceof multer.MulterError)
        return res.status(400).json({ success: false, message: "File upload error: " + err.message });
      if (err)
        return res.status(400).json({ success: false, message: err.message });
      next();
    });
  };
}

// CRUD endpoints for Fertilizers & Pesticides
router.post("/filter", getAllFertilizers);
router.get("/:id", getFertilizerById);
router.post("/", uploadSingle("image"), createFertilizer);
router.put("/:id", uploadSingle("image"), updateFertilizer);
router.delete("/:id", deleteFertilizer);

export default router;
