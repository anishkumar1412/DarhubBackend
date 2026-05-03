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
export const uploadToCloudinary = async (fileBuffer, folder = "users") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.v2.uploader.upload_stream(
      { folder },
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
