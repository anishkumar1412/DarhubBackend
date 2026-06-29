import multer from "multer";
import cloudinary from "cloudinary";
import { Readable } from "stream";

cloudinary.v2.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET
});

// Multer memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Convert buffer to stream and upload
export const uploadToCloudinary = async (fileBuffer, folder = "users", resourceType = "auto", originalName = null) => {
  return new Promise((resolve, reject) => {
    const options = { 
      folder, 
      resource_type: resourceType,
      type: "upload",
      unique_filename: false,
      use_filename: true
    };
    if (originalName) {
      const ext = originalName.split('.').pop().toLowerCase();
      const uniqueId = Math.random().toString(36).substring(2, 15) + "_" + Date.now();
      options.public_id = `${uniqueId}.${ext}`;
    }

    const stream = cloudinary.v2.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    const readStream = Readable.from(fileBuffer);
    readStream.pipe(stream);
  });
};

export default upload;
