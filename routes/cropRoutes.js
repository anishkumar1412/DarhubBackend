import express from "express";
import multer from "multer";
import { createCrop, deleteCrop, filterCrops, getCropById, updateCrop, upload } from "../controllers/crop.controller.js";

const cropRouter = express.Router();

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

cropRouter.post("/create",    uploadSingle("image"), createCrop);
cropRouter.post("/filter",    filterCrops);
cropRouter.put("/update/:id", uploadSingle("image"), updateCrop);
cropRouter.delete("/:id",     deleteCrop);
cropRouter.get("/:id",        getCropById);

export default cropRouter;