import express from "express";
import { deleteUser, loginUser, registerUser, updateUserProfile, filterUsers ,refreshAccessToken, getUserById, getUsersForBooking, getUserByEmail, addUserAddress} from "../controllers/Admin.controller.js";
import { authenticate } from "../middleware/authMiddleware.js";
import upload from "../middleware/upload.js";


const userRouter = express.Router();

// userRouter.post("/register", registerUser);
userRouter.post(
  "/register",
  upload.single("user_image_original_filename"),
  registerUser
);

userRouter.post("/login", loginUser);
userRouter.post("/deleteUser",authenticate, deleteUser);
userRouter.put("/updateprofile", updateUserProfile);
userRouter.post("/refresh-token",refreshAccessToken);

// get user api 
userRouter.get("/get-user/:user_id",getUserById);

userRouter.post("/filter", filterUsers);
userRouter.get("/users/booking-list", getUsersForBooking);

userRouter.get("/users/search", getUserByEmail);
userRouter.post("/users/:user_id/address", addUserAddress);

export default userRouter;