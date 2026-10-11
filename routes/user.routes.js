import express from "express";
import { deleteUser, loginUser, registerUser, updateUserProfile, filterUsers, refreshAccessToken, getMe, getUserById, getUsersForBooking, getUserByEmail, updatePilot, updateFarmer, addUserAddress } from "../controllers/Admin.controller.js";
import { registerFarmer, registerPilot } from "../controllers/registration.controller.js";
import { sendOtp, verifyOtp, getOtpSettings } from "../controllers/otp.controller.js";
import { authenticate, verifyRefreshToken } from "../middleware/authMiddleware.js";
import { authenticateAdmin } from "../middleware/adminAuth.middleware.js";
import { authenticateUser, requireSelfOrAdmin } from "../middleware/access.js";
import upload from "../middleware/upload.js";
import { getUsersByRole, getUserAddresses } from "../controllers/UserQuery.controller.js";
import { getPilotProfile } from "../controllers/pilotProfile.controller.js";


const userRouter = express.Router();

userRouter.get("/me", authenticate, getMe);
userRouter.get("/user/me", authenticate, getMe);

userRouter.get("/user/pilot/profile", authenticate, getPilotProfile);

userRouter.get("/otp/settings", getOtpSettings);   // countdown / expiry the apps should show
userRouter.post("/otp/send-otp", sendOtp);         // also used to resend (cooldown + limits enforced)
userRouter.post("/otp/verify-otp", verifyOtp);

// Creates an account with a role chosen by the caller, so only an administrator may use it (it was public).
// Farmers and pilots sign up through /user/farmer-registration and /user/pilot-registration.
userRouter.post(
  "/register",
  authenticateAdmin,
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
// Back-office user management: administrators only (these were open to anyone, including password/role changes)
userRouter.post("/deleteUser", authenticateAdmin, deleteUser);
userRouter.put("/updateprofile", authenticateAdmin, updateUserProfile);
userRouter.post("/refresh-token", verifyRefreshToken, refreshAccessToken);

// A person's full record includes Aadhaar/PAN and address: the user themselves or an administrator
userRouter.get("/get-user/:user_id", authenticateUser, requireSelfOrAdmin("user_id"), getUserById);

userRouter.post("/filter", authenticateAdmin, filterUsers);
userRouter.get("/users/booking-list", authenticateAdmin, getUsersForBooking);

userRouter.get("/users/search", authenticateAdmin, getUserByEmail);
userRouter.post("/users/:user_id/address", authenticateUser, requireSelfOrAdmin("user_id"), addUserAddress);

// User Queries
userRouter.post("/users/by-role", authenticateAdmin, getUsersByRole);
userRouter.post("/users/addresses", authenticateAdmin, getUserAddresses);

export default userRouter;
