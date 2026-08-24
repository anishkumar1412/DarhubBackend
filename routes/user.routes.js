import express from "express";
import { deleteUser, loginUser, registerUser, updateUserProfile, filterUsers, refreshAccessToken, getMe, getUserById, getUsersForBooking, getUserByEmail, registerPilot, registerFarmer, sendOtp, verifyOtp, updatePilot, updateFarmer, addUserAddress } from "../controllers/Admin.controller.js";
import { authenticate, verifyRefreshToken } from "../middleware/authMiddleware.js";
import upload from "../middleware/upload.js";
import { getUsersByRole, getUserAddresses } from "../controllers/UserQuery.controller.js";
import { getPilotProfile } from "../controllers/pilotProfile.controller.js";


const userRouter = express.Router();

userRouter.get("/me", authenticate, getMe);
userRouter.get("/user/me", authenticate, getMe);

userRouter.get("/user/pilot/profile", authenticate, getPilotProfile);

userRouter.post("/otp/send-otp", sendOtp);
userRouter.post("/otp/verify-otp", verifyOtp);

// userRouter.post("/register", registerUser);
userRouter.post(
  "/register",
  upload.single("user_image_original_filename"),
  registerUser
);

const pilotUploadFields = upload.fields([
  { name: "profile_image", maxCount: 5 },
  { name: "aaddhar_image", maxCount: 5 },
  { name: "pan_card_image", maxCount: 5 },
  { name: "dcga_pilot_cert", maxCount: 5 },
  { name: "dcga_pilot_license", maxCount: 5 },
  { name: "medical_certificate", maxCount: 5 },
  { name: "insurance_doc", maxCount: 5 },
  { name: "passbook_image", maxCount: 5 }
]);

userRouter.post("/user/pilot-registration", pilotUploadFields, registerPilot);
userRouter.post("/user/farmer-registration", upload.single("profile_image"), registerFarmer);

userRouter.put("/user/pilot-edit", authenticate, pilotUploadFields, updatePilot);
userRouter.put("/user/farmer-edit", authenticate, upload.single("profile_image"), updateFarmer);

userRouter.post("/login", loginUser);
userRouter.post("/deleteUser", authenticate, deleteUser);
userRouter.put("/updateprofile", updateUserProfile);
userRouter.post("/refresh-token", verifyRefreshToken, refreshAccessToken);

// get user api 
userRouter.get("/get-user/:user_id", getUserById);

userRouter.post("/filter", filterUsers);
userRouter.get("/users/booking-list", getUsersForBooking);

userRouter.get("/users/search", getUserByEmail);
userRouter.post("/users/:user_id/address", addUserAddress);

// User Queries
userRouter.post("/users/by-role", getUsersByRole);
userRouter.post("/users/addresses", getUserAddresses);

export default userRouter;