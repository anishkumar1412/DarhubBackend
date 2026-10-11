import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../models/index.js";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { uploadToCloudinary } from "../middleware/upload.js";
import { randomInt } from "crypto";
import logger from "../utils/logger.js";
import env from "../config/env.js";
import { ApiError } from "../utils/apiError.js";
import {
  normalizeEmail, isValidEmail, normalizeMobile, validatePassword, checkLocationChain,
  findVerifiedChannels, consumeVerification, lockIdentifiers, findDuplicate, buildAddresses, parseAddressInput,
} from "../services/registration.service.js";
import { resolveIdentityChange, consumeIdentityVerification, isActivatedAdmin } from "../services/identity.service.js";
import {
  validateImage, discardUploads, uploadPilotFiles, PILOT_FILES, readBankDetails, readUpiId, readAadhar, readPan,
} from "../services/profileInput.service.js";
import { issueSessionTokens, refreshTokenMatches } from "../services/token.service.js";
import { loadRoleNames, isFarmerAccount } from "../middleware/access.js";
import { parseOrThrow } from "../middleware/validate.js";
import { loginSchema } from "../validation/auth.schemas.js";
import { createOrderSchema } from "../validation/order.schemas.js";
import { farmerEditSchema } from "../validation/farmer.schemas.js";
import { respondWithError } from "../middleware/errorHandler.js";
import { OrderStatusEnum } from "../utils/enums.js";
import { updateOrderStatus } from "../utils/orderUtils.js";
import { parseDateOnly, addDaysUTC, todayIST, getDayStatus } from "../utils/dateUtils.js";



const {
  User,
  UserAddress,
  UserProfile,
  UserRole,
  Drone1,
  MasterState,
  MasterDistrict,
  MasterBlock,
  SprayingOrder,
  SprayingOrderAddress,
  SprayingDailyLogs,
  SprayingWorkAssignee,
  OtpVerification
} = db;




// export const registerUser = async (req, res) => {
//   try {
//     const {
//       email,
//       password,
//       username,
//       mobile_number,
//       addresses, // Array of addresses [{lane_1, lane_2, state, district, block, village, pincode}, ...]
//       first_name,
//       last_name,
//       whatsapp_number,
//       user_image_original_filename,
//       user_image_new_filename,
//       user_image_url,
//       aadhar_number,
//       pan_card_number,
//       role_privilage_id,
//     } = req.body;

//     // Validate addresses is an array
//     if (!Array.isArray(addresses) || addresses.length === 0) {
//       return res.status(400).json({
//         message: "Addresses must be a non-empty array with proper format",
//       });
//     }

//     // Check if user already exists
//     const existingUser = await User.findOne({ where: { email } });

//     if (existingUser) {
//       return res.status(400).json({
//         message: "User already exists with this email",
//       });
//     }

//     // Hash password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Transaction to ensure consistency
//     const result = await db.sequelize.transaction(async (t) => {
//       // 1. Create User
//       const user = await User.create(
//         {
//           email,
//           password: hashedPassword,
//           username,
//           mobile_number,
//           is_superuser: false,
//           user_type: 1,
//         },
//         { transaction: t }
//       );

//       // 2. Create User Addresses
//       const addressesData = addresses.map(address => ({
//         user_id: user.id,
//         lane_1: address.lane_1,
//         lane_2: address.lane_2,
//         state: address.state,
//         district: address.district,
//         block: address.block,
//         village: address.village,
//         pincode: address.pincode,
//       }));

//       await UserAddress.bulkCreate(addressesData, { transaction: t });

//       // 3. Create User Profile
//       await UserProfile.create(
//         {
//           user_id: user.id,
//           first_name,
//           last_name,
//           whatsapp_number,
//           user_image_original_filename,
//           user_image_new_filename,
//           user_image_url,
//           aadhar_number,
//           pan_card_number,
//         },
//         { transaction: t }
//       );

//       // 4. Assign Role
//       await UserRole.create(
//         {
//           user_id: user.id,
//           role_privilage_id,
//         },
//         { transaction: t }
//       );

//       return user;
//     });

//     const user = result;

//     // Generate JWT token
//     const token = jwt.sign(
//       { userId: user.id, email: user.email },
//       process.env.JWT_SECRET,
//       { expiresIn: "3d" }
//     );

//     return res.status(201).json({
//       message: "User registered successfully",
//       user_id: user.id,
//       token,
//     });

//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({
//       message: "Registration failed",
//       error: error.message,
//     });
//   }
// };


export const registerUser = async (req, res) => {
  try {
    // -------------------------------------------------------------
    // Optional Authenticated User Check (Creator ID)
    // -------------------------------------------------------------
    let creatorId = null;
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        creatorId = decoded.id || decoded.userId;
      } catch (err) {
        return res.status(401).json({ message: "Invalid or expired token." });
      }
    }

    // -----------------------------
    // 1. Parse ADDRESSES from FormData
    // -----------------------------
    let addresses = [];
    try {
      addresses = JSON.parse(req.body.addresses); // React sends JSON string
      if (!Array.isArray(addresses) || addresses.length === 0) {
        return res.status(400).json({
          message: "Addresses must be a non-empty array",
        });
      }
    } catch (err) {
      return res.status(400).json({
        message: "Invalid addresses format. Must be JSON string.",
      });
    }

    // -----------------------------
    // 2. Extract all other fields
    // -----------------------------
    const {
      email,
      password,
      username,
      mobile_number,
      first_name,
      last_name,
      whatsapp_number,
      aadhar_number,
      pan_card_number,
      role_privilage_id,
    } = req.body;

    // -----------------------------
    // 3. Handle file uploaded by Multer
    // -----------------------------
    let user_image_original_filename = null;
    let user_image_url = null; // You can change later for Cloudinary

    if (req.file) {
      user_image_original_filename = req.file.originalname;

      // For now, just using a TEMP URL
      // Later you can upload to Cloudinary and set secure_url
      user_image_url = "TEMP_IMAGE_URL_UPLOADED_LATER";
    }

    // -----------------------------
    // 4. Validations & Duplication check
    // -----------------------------
    if (!email || !email.trim()) {
      return res.status(400).json({ message: "Email is required" });
    }
    if (!mobile_number) {
      return res.status(400).json({ message: "Mobile number is required" });
    }

    const emailStr = normalizeEmail(email);
    if (!isValidEmail(emailStr)) {
      return res.status(400).json({ message: "Invalid email format. Enter a valid email address, e.g. name@example.com" });
    }
    const mobileStr = normalizeMobile(mobile_number);
    if (!mobileStr) {
      return res.status(400).json({ message: "Mobile number must be exactly 10 digits" });
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    // The role is chosen by the (admin) caller; it must be a real role. It used to be written to a column that does
    // not exist (role_privilage_id), so every user created here ended up with no role at all.
    const roleId = Number(role_privilage_id ?? req.body.role_id);
    const role = Number.isInteger(roleId) ? await db.MasterRole.findByPk(roleId) : null;
    if (!role) {
      return res.status(400).json({ message: "A valid role is required" });
    }

    // What was really verified by OTP (not required for accounts an admin creates, but never claimed falsely)
    const verified = await findVerifiedChannels({ OtpVerification }, { email: emailStr, mobile: mobileStr });

    // -----------------------------
    // 5. Hash Password
    // -----------------------------
    const hashedPassword = await bcrypt.hash(password, 10);

    // -----------------------------
    // 6. Transaction Starts
    // -----------------------------
    const user = await db.sequelize.transaction(async (t) => {
      await lockIdentifiers(db.sequelize, t, [emailStr, mobileStr]);
      const duplicate = await findDuplicate({ User }, { email: emailStr, mobile: mobileStr }, t);
      if (duplicate) throw new ApiError(409, duplicate);

      // Create main User
      const newUser = await User.create(
        {
          email: emailStr,
          password: hashedPassword,
          username,
          mobile_number: mobileStr,
          is_superuser: false,
          user_type: 1,
          isEmailVerify: verified.email,
          isMobileVerify: verified.mobile,
          created_by: creatorId || null
        },
        { transaction: t }
      );

      const finalCreatorId = creatorId || newUser.id;

      if (!creatorId) {
        await newUser.update({ created_by: finalCreatorId }, { transaction: t });
      }

      // Create Address Records
      const formattedAddresses = addresses.map((address) => ({
        user_id: newUser.id,
        lane_1: address.lane_1,
        lane_2: address.lane_2,
        state: address.state,
        district: address.district,
        block: address.block,
        village: address.village,
        pincode: address.pincode,
        created_by: finalCreatorId
      }));

      await UserAddress.bulkCreate(formattedAddresses, {
        transaction: t,
      });

      // Create User Profile
      await UserProfile.create(
        {
          user_id: newUser.id,
          first_name,
          last_name,
          whatsapp_number,
          user_image_original_filename,
          user_image_url,
          aadhar_number: aadhar_number ? String(aadhar_number).trim() : null,
          pan_card_number: pan_card_number ? String(pan_card_number).trim() : null,
          created_by: finalCreatorId
        },
        { transaction: t }
      );

      // Assign Role
      await UserRole.create(
        {
          user_id: newUser.id,
          role_id: role.id,
          created_by: finalCreatorId
        },
        { transaction: t }
      );

      await consumeVerification({ OtpVerification }, { email: verified.email ? emailStr : null, mobile: verified.mobile ? mobileStr : null }, t);
      return newUser;
    });

    // -----------------------------
    // 7. Generate JWT Token
    // -----------------------------
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(201).json({
      message: "User registered successfully",
      user_id: user.id,
      token,
    });

  } catch (error) {
    return respondWithError(req, res, error, "registerUser");
  }
};






export const loginUser = async (req, res) => {
  try {
    const { identifier, password } = parseOrThrow(loginSchema, req.body);

    // Mobile numbers are stored as 10 digits since registration normalises them, older rows as typed
    // ("+919876543210", "09876543210"): look for every spelling, so "+91 98765 43210" signs in too.
    const mobile = normalizeMobile(identifier);
    const user = await User.findOne({
      where: {
        [db.Sequelize.Op.or]: [
          db.Sequelize.where(db.Sequelize.fn('LOWER', db.Sequelize.col('email')), identifier.toLowerCase()),
          { mobile_number: mobile ? [mobile, `0${mobile}`, `91${mobile}`, `+91${mobile}`] : identifier },
        ],
      },
      order: [["id", "ASC"]],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.password) {
      return res.status(400).json({ success: false, message: "Password not set for this account. Please reset password or activate account." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    // Checked after the password, so the account's state is only revealed to its owner
    if (user.is_active === false) {
      return res.status(403).json({ success: false, message: "This account has been deactivated. Please contact support." });
    }

    const { accessToken, refreshToken } = await issueSessionTokens(user);

    return res.json({
      success: true,
      message: "Login successful",
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        user_type: user.user_type,
      },
    });
  } catch (error) {
    return respondWithError(req, res, error, "loginUser");
  }
};





// // Admin-only (see user.routes.js). It used to be callable by anyone: a request naming any user_id could set that
// user's password and role, i.e. take over any account, including an administrator's.
export const updateUserProfile = async (req, res) => {
  try {
    const {
      user_id,
      email, password, username, mobile_number,
      addresses,
      first_name, last_name, whatsapp_number,
      user_image_original_filename, user_image_new_filename, user_image_url,
      aadhar_number, pan_card_number,
      role_id,
    } = req.body;

    if (!user_id) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const user = await User.findByPk(user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Only the fields that were sent are changed (an absent field used to be written as NULL)
    const userChanges = {};
    if (email !== undefined) {
      const emailStr = normalizeEmail(email);
      if (!isValidEmail(emailStr)) return res.status(400).json({ message: "Invalid email format" });
      userChanges.email = emailStr;
    }
    if (mobile_number !== undefined) {
      const mobileStr = normalizeMobile(mobile_number);
      if (!mobileStr) return res.status(400).json({ message: "Mobile number must be exactly 10 digits" });
      userChanges.mobile_number = mobileStr;
    }
    if (username !== undefined) userChanges.username = String(username).trim().slice(0, 50);
    if (password) {
      const passwordError = validatePassword(password);
      if (passwordError) return res.status(400).json({ message: passwordError });
      userChanges.password = await bcrypt.hash(password, 10);
    }

    let role = null;
    if (role_id !== undefined && role_id !== null && role_id !== "") {
      role = await db.MasterRole.findByPk(Number(role_id));
      if (!role) return res.status(400).json({ message: "role_id is not a valid role" });
    }

    const cleanAddresses = Array.isArray(addresses) && addresses.length > 0
      ? await buildAddresses(db, addresses)
      : null;

    await db.sequelize.transaction(async (t) => {
      // Changing e-mail/mobile must not collide with another account (checked under the same lock as sign-up)
      if (userChanges.email || userChanges.mobile_number) {
        await lockIdentifiers(db.sequelize, t, [userChanges.email, userChanges.mobile_number].filter(Boolean));
        const others = [
          ...(userChanges.email ? [db.Sequelize.where(db.Sequelize.fn("lower", db.Sequelize.col("email")), userChanges.email)] : []),
          ...(userChanges.mobile_number ? [{ mobile_number: userChanges.mobile_number }] : []),
        ];
        const clash = await User.findOne({
          where: { id: { [db.Sequelize.Op.ne]: user.id }, [db.Sequelize.Op.or]: others },
          transaction: t,
        });
        if (clash) throw new ApiError(409, "Another account already uses this email or mobile number");
      }

      if (Object.keys(userChanges).length > 0) {
        await user.update({ ...userChanges, modified_on: new Date(), modified_by: req.auth?.id ?? null }, { transaction: t });
      }

      if (cleanAddresses) {
        await UserAddress.destroy({ where: { user_id }, transaction: t });
        await UserAddress.bulkCreate(
          cleanAddresses.map((a) => ({ ...a, user_id, created_by: req.auth?.id ?? null })),
          { transaction: t }
        );
      }

      const profileChanges = Object.fromEntries(Object.entries({
        first_name, last_name, whatsapp_number,
        user_image_original_filename, user_image_new_filename, user_image_url,
        aadhar_number, pan_card_number,
      }).filter(([, v]) => v !== undefined));
      if (Object.keys(profileChanges).length > 0) {
        const existingProfile = await UserProfile.findOne({ where: { user_id }, transaction: t });
        if (existingProfile) {
          await existingProfile.update(profileChanges, { transaction: t });
        } else {
          if (!profileChanges.first_name) throw new ApiError(400, "first_name is required to create a profile");
          await UserProfile.create({ user_id, ...profileChanges }, { transaction: t });
        }
      }

      if (role) {
        const existingRole = await UserRole.findOne({ where: { user_id }, transaction: t });
        if (existingRole) await existingRole.update({ role_id: role.id }, { transaction: t });
        else await UserRole.create({ user_id, role_id: role.id }, { transaction: t });
      }
    });

    return res.status(200).json({ message: "User updated successfully", user_id });
  } catch (error) {
    return respondWithError(req, res, error, "updateUserProfile");
  }
};

// Accounts are deactivated, never hard-deleted: orders, daily logs and timelines refer to the user's id, and
// removing the row left them pointing at nobody (and left the profile, roles and addresses orphaned).
export const deleteUser = async (req, res) => {
  try {
    const id = Number(req.body?.id ?? req.body?.user_id ?? req.params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "A valid user id is required" });
    }
    if (id === req.auth?.id) {
      return res.status(409).json({ success: false, message: "You cannot deactivate your own account" });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Work in progress must be handed over first
    const openStatuses = [OrderStatusEnum.ORDER_CANCELLED, OrderStatusEnum.ORDER_REJECTED, OrderStatusEnum.ORDER_COMPLETED, OrderStatusEnum.PAYMENT_SUCCESSFUL];
    const openOrders = await SprayingOrder.count({
      where: { user_id: id, order_status: { [db.Sequelize.Op.notIn]: openStatuses } },
    });
    const upcomingDays = await SprayingDailyLogs.count({
      where: { pilot_user_id: id, is_active: true, working_date: { [db.Sequelize.Op.gte]: parseDateOnly(todayIST()) } },
    });
    if (openOrders > 0 || upcomingDays > 0) {
      return res.status(409).json({
        success: false,
        code: "USER_HAS_OPEN_WORK",
        message: `This user still has ${openOrders} open order(s) and ${upcomingDays} upcoming working day(s). Cancel or reassign them first.`,
      });
    }

    await user.update({ is_active: false, refresh_token: null, modified_on: new Date(), modified_by: req.auth?.id ?? null });
    return res.json({ success: true, message: "User deactivated successfully" });
  } catch (error) {
    return respondWithError(req, res, error, "deleteUser");
  }
};

export const getUserById = async (req, res) => {
  try {
    const { user_id } = req.params; // get user_id from route params

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // ----------------- Fetch user -----------------
    const user = await User.findOne({
      where: { id: user_id },
      attributes: ["id", "email", "username", "mobile_number"],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ----------------- Fetch related details -----------------
    const profile = await UserProfile.findOne({
      where: { user_id },
      attributes: [
        "first_name",
        "last_name",
        "whatsapp_number",
        "user_image_url",
        "aadhar_number",
        "pan_card_number",
        "user_id",
      ],
    });

    const addressesRaw = await UserAddress.findAll({
      where: { user_id },
      attributes: [
        "lane_1",
        "lane_2",
        "state",
        "district",
        "block",
        "village",
        "pincode",
        "user_id",
      ],
    });

    const role = await UserRole.findOne({
      where: { user_id },
      attributes: ["role_id", "user_id"],
    });

    // ----------------- Manually merge address with master tables -----------------
    const addresses = [];
    for (const addr of addressesRaw) {
      const plainAddr = addr.get({ plain: true });

      // Fetch state name
      let stateName = null;
      if (plainAddr.state) {
        const stateData = await MasterState.findOne({
          where: { id: plainAddr.state },
          attributes: ["state_name"], // Change column name if different
        });
        stateName = stateData?.state_name || null;
      }

      // Fetch district name
      let districtName = null;
      if (plainAddr.district) {
        const districtData = await MasterDistrict.findOne({
          where: { id: plainAddr.district },
          attributes: ["district_name"], // Change column name if different
        });
        districtName = districtData?.district_name || null;
      }

      // Fetch block name
      let blockName = null;
      if (plainAddr.block) {
        const blockData = await MasterBlock.findOne({
          where: { id: plainAddr.block },
          attributes: ["block_name"], // Change column name if different
        });
        blockName = blockData?.block_name || null;
      }

      addresses.push({
        ...plainAddr,
        state_name: stateName,
        district_name: districtName,
        block_name: blockName,
      });
    }

    // ----------------- Final Merged Data -----------------
    const userData = {
      user_id: user.id,
      email: user.email,
      username: user.username,
      mobile_number: user.mobile_number,
      profile: profile || {},
      address: addresses,
      role: role || {},
    };

    // ----------------- Final Response -----------------
    return res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    console.error("GetUser Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching user",
      error: error.message,
    });
  }
};





// export const filterUsers = async (req, res) => {
//   try {
//     const filters = { ...req.body };

//     // ----------------- Extract sorting -----------------
//     let { order_by, order_type } = filters;
//     delete filters.order_by;
//     delete filters.order_type;

//     // ----------------- Define allowed fields -----------------
//     const userFields = ["email", "username", "mobile_number"];
//     const profileFields = ["first_name", "last_name", "whatsapp_number", "user_image_url", "aadhar_number", "pan_card_number"];
//     const addressFields = ["lane_1", "lane_2", "state", "district", "block", "village", "pincode"];
//     const roleFields = ["role_id"];

//     // ----------------- Split filters by table -----------------
//     const userFilter = {};
//     const profileFilter = {};
//     const addressFilter = {};
//     const roleFilter = {};

//     for (const [key, value] of Object.entries(filters)) {
//       if (userFields.includes(key)) userFilter[key] = value;
//       else if (profileFields.includes(key)) profileFilter[key] = value;
//       else if (addressFields.includes(key)) addressFilter[key] = value;
//       else if (roleFields.includes(key)) roleFilter[key] = value;
//     }

//     let userIds = null;

//     // ----------------- Apply filters on each table -----------------
//     if (Object.keys(userFilter).length > 0) {
//       const users = await User.findAll({ where: userFilter });
//       const ids = users.map(u => u.id);
//       userIds = userIds === null ? ids : userIds.filter(id => ids.includes(id));
//     }

//     if (Object.keys(profileFilter).length > 0) {
//       const profiles = await UserProfile.findAll({ where: profileFilter });
//       const ids = profiles.map(p => p.user_id);
//       userIds = userIds === null ? ids : userIds.filter(id => ids.includes(id));
//     }

//     if (Object.keys(addressFilter).length > 0) {
//       const addresses = await UserAddress.findAll({ where: addressFilter });
//       const ids = addresses.map(a => a.user_id);
//       userIds = userIds === null ? ids : userIds.filter(id => ids.includes(id));
//     }

//     if (Object.keys(roleFilter).length > 0) {
//       const roles = await UserRole.findAll({ where: roleFilter });
//       const ids = roles.map(r => r.user_id);
//       userIds = userIds === null ? ids : userIds.filter(id => ids.includes(id));
//     }

//     // ----------------- Fetch all details -----------------
//     let users, profiles, addresses, roles;

//     if (userIds === null) {
//       // No filters → fetch everything
//       users = await User.findAll();
//       profiles = await UserProfile.findAll();
//       addresses = await UserAddress.findAll();
//       roles = await UserRole.findAll();
//     } else if (userIds.length === 0) {
//       return res.json({ success: true, count: 0, data: [] });
//     } else {
//       users = await User.findAll({ where: { id: userIds } });
//       profiles = await UserProfile.findAll({ where: { user_id: userIds } });
//       addresses = await UserAddress.findAll({ where: { user_id: userIds } });
//       roles = await UserRole.findAll({ where: { user_id: userIds } });
//     }

//     // ----------------- Merge data -----------------
//     let mergedUsers = users.map(user => {
//       const profile = profiles.find(p => p.user_id === user.id) || null;
//       const address = addresses.find(a => a.user_id === user.id) || null;
//       const role = roles.find(r => r.user_id === user.id) || null;

//       return {
//         user_id: user.id,
//         email: user.email,
//         username: user.username,
//         mobile_number: user.mobile_number,
//         profile,
//         address,
//         role
//       };
//     });

//     // ----------------- Apply sorting (common for all cases) -----------------
//     if (order_by) {
//       const type = order_type && order_type.toLowerCase() === "desc" ? -1 : 1;

//       mergedUsers.sort((a, b) => {
//         const getValue = (obj, key) => {
//           if (!key.includes(".")) return obj[key];
//           return key.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);
//         };

//         const aVal = getValue(a, order_by);
//         const bVal = getValue(b, order_by);

//         if (aVal === undefined) return 1 * type;
//         if (bVal === undefined) return -1 * type;
//         if (aVal < bVal) return -1 * type;
//         if (aVal > bVal) return 1 * type;
//         return 0;
//       });
//     }

//     // ----------------- Final Response -----------------
//     return res.json({
//       success: true,
//       count: mergedUsers.length,
//       data: mergedUsers
//     });

//   } catch (error) {
//     console.error("Filter Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error filtering users",
//       error: error.message
//     });
//   }
// };


// export const filterUsers = async (req, res) => {
//   try {
//     const filters = { ...req.body };

//     // ----------------- Extract sorting & pagination -----------------
//     let { order_by, order_type, page, page_size } = filters;
//     delete filters.order_by;
//     delete filters.order_type;
//     delete filters.page;
//     delete filters.page_size;

//     page = page && page > 0 ? parseInt(page) : 1;
//     page_size = page_size && page_size > 0 ? parseInt(page_size) : 10;

//     // ----------------- Define allowed fields -----------------
//     const userFields = ["email", "username", "mobile_number"];
//     const profileFields = ["first_name", "last_name", "whatsapp_number", "user_image_url", "aadhar_number", "pan_card_number"];
//     const addressFields = ["lane_1", "lane_2", "state", "district", "block", "village", "pincode"];
//     const roleFields = ["role_id"];

//     // ----------------- Split filters by table -----------------
//     const userFilter = {};
//     const profileFilter = {};
//     const addressFilter = {};
//     const roleFilter = {};

//     for (const [key, value] of Object.entries(filters)) {
//       if (userFields.includes(key)) userFilter[key] = value;
//       else if (profileFields.includes(key)) profileFilter[key] = value;
//       else if (addressFields.includes(key)) addressFilter[key] = value;
//       else if (roleFields.includes(key)) roleFilter[key] = value;
//     }

//     let userIds = null;

//     // ----------------- Apply filters on each table -----------------
//     if (Object.keys(userFilter).length > 0) {
//       const users = await User.findAll({ where: userFilter });
//       const ids = users.map(u => u.id);
//       userIds = userIds === null ? ids : userIds.filter(id => ids.includes(id));
//     }

//     if (Object.keys(profileFilter).length > 0) {
//       const profiles = await UserProfile.findAll({ where: profileFilter });
//       const ids = profiles.map(p => p.user_id);
//       userIds = userIds === null ? ids : userIds.filter(id => ids.includes(id));
//     }

//     if (Object.keys(addressFilter).length > 0) {
//       const addresses = await UserAddress.findAll({ where: addressFilter });
//       const ids = addresses.map(a => a.user_id);
//       userIds = userIds === null ? ids : userIds.filter(id => ids.includes(id));
//     }

//     if (Object.keys(roleFilter).length > 0) {
//       const roles = await UserRole.findAll({ where: roleFilter });
//       const ids = roles.map(r => r.user_id);
//       userIds = userIds === null ? ids : userIds.filter(id => ids.includes(id));
//     }

//     // ----------------- Fetch all details -----------------
//     let users, profiles, addresses, roles;

//     if (userIds === null) {
//       // No filters → fetch everything
//       users = await User.findAll();
//       profiles = await UserProfile.findAll();
//       addresses = await UserAddress.findAll();
//       roles = await UserRole.findAll();
//     } else if (userIds.length === 0) {
//       return res.json({ success: true, count: 0, data: [] });
//     } else {
//       users = await User.findAll({ where: { id: userIds } });
//       profiles = await UserProfile.findAll({ where: { user_id: userIds } });
//       addresses = await UserAddress.findAll({ where: { user_id: userIds } });
//       roles = await UserRole.findAll({ where: { user_id: userIds } });
//     }

//     // ----------------- Merge data -----------------
//     let mergedUsers = users.map(user => {
//       const profile = profiles.find(p => p.user_id === user.id) || null;
//       const address = addresses.find(a => a.user_id === user.id) || null;
//       const role = roles.find(r => r.user_id === user.id) || null;

//       return {
//         user_id: user.id,
//         email: user.email,
//         username: user.username,
//         mobile_number: user.mobile_number,
//         profile,
//         address,
//         role
//       };
//     });

//     // ----------------- Apply sorting -----------------
//     if (order_by) {
//       const type = order_type && order_type.toLowerCase() === "desc" ? -1 : 1;

//       mergedUsers.sort((a, b) => {
//         const getValue = (obj, key) => {
//           if (!key.includes(".")) return obj[key];
//           return key.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);
//         };

//         const aVal = getValue(a, order_by);
//         const bVal = getValue(b, order_by);

//         if (aVal === undefined) return 1 * type;
//         if (bVal === undefined) return -1 * type;
//         if (aVal < bVal) return -1 * type;
//         if (aVal > bVal) return 1 * type;
//         return 0;
//       });
//     }

//     // ----------------- Apply pagination -----------------
//     const totalRecords = mergedUsers.length;
//     const startIndex = (page - 1) * page_size;
//     const endIndex = startIndex + page_size;
//     const paginatedUsers = mergedUsers.slice(startIndex, endIndex);

//     // ----------------- Final Response -----------------
//     return res.json({
//       success: true,
//       total: totalRecords,
//       page,
//       page_size,
//       count: paginatedUsers.length,
//       data: paginatedUsers
//     });

//   } catch (error) {
//     console.error("Filter Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error filtering users",
//       error: error.message
//     });
//   }
// };


export const filterUsers = async (req, res) => {
  try {
    const filters = { ...req.body };

    // ----------------- Extract sorting & pagination -----------------
    let { order_by, order_type, page, page_size } = filters;
    delete filters.order_by;
    delete filters.order_type;
    delete filters.page;
    delete filters.page_size;

    page = page && page > 0 ? parseInt(page) : 1;
    page_size = page_size && page_size > 0 ? parseInt(page_size) : 10;

    // ----------------- Define allowed fields -----------------
    const userFields = ["email", "username", "mobile_number"];
    const profileFields = ["first_name", "last_name", "whatsapp_number", "user_image_url", "aadhar_number", "pan_card_number"];
    const addressFields = ["lane_1", "lane_2", "state", "district", "block", "village", "pincode"];
    const roleFields = ["role_id"];

    // ----------------- Split filters by table -----------------
    const userFilter = {};
    const profileFilter = {};
    const addressFilter = {};
    const roleFilter = {};

    for (const [key, value] of Object.entries(filters)) {
      if (userFields.includes(key)) userFilter[key] = value;
      else if (profileFields.includes(key)) profileFilter[key] = value;
      else if (addressFields.includes(key)) addressFilter[key] = value;
      else if (roleFields.includes(key)) roleFilter[key] = value;
    }

    let userIds = null;

    // ----------------- Apply filters on each table -----------------
    if (Object.keys(userFilter).length > 0) {
      const users = await User.findAll({ where: userFilter, attributes: ["id"] });
      const ids = users.map(u => u.id);
      userIds = userIds === null ? ids : userIds.filter(id => ids.includes(id));
    }

    if (Object.keys(profileFilter).length > 0) {
      const profiles = await UserProfile.findAll({ where: profileFilter, attributes: ["user_id"] });
      const ids = profiles.map(p => p.user_id);
      userIds = userIds === null ? ids : userIds.filter(id => ids.includes(id));
    }

    if (Object.keys(addressFilter).length > 0) {
      const addresses = await UserAddress.findAll({ where: addressFilter, attributes: ["user_id"] });
      const ids = addresses.map(a => a.user_id);
      userIds = userIds === null ? ids : userIds.filter(id => ids.includes(id));
    }

    if (Object.keys(roleFilter).length > 0) {
      const roles = await UserRole.findAll({ where: roleFilter, attributes: ["user_id"] });
      const ids = roles.map(r => r.user_id);
      userIds = userIds === null ? ids : userIds.filter(id => ids.includes(id));
    }

    // ----------------- Fetch all details -----------------
    let users, profiles, addresses, roles;

    if (userIds === null) {
      users = await User.findAll({ attributes: ["id", "email", "username", "mobile_number"] });
      profiles = await UserProfile.findAll({ attributes: profileFields.concat(["user_id"]) });
      addresses = await UserAddress.findAll({ attributes: addressFields.concat(["user_id"]) });
      roles = await UserRole.findAll({ attributes: roleFields.concat(["user_id"]) });
    } else if (userIds.length === 0) {
      return res.json({ success: true, count: 0, data: [] });
    } else {
      users = await User.findAll({ where: { id: userIds }, attributes: ["id", "email", "username", "mobile_number"] });
      profiles = await UserProfile.findAll({ where: { user_id: userIds }, attributes: profileFields.concat(["user_id"]) });
      addresses = await UserAddress.findAll({ where: { user_id: userIds }, attributes: addressFields.concat(["user_id"]) });
      roles = await UserRole.findAll({ where: { user_id: userIds }, attributes: roleFields.concat(["user_id"]) });
    }



    // ----------------- Merge data -----------------
    let mergedUsers = users.map(user => {
      const profile = profiles.find(p => p.user_id === user.id) || {};
      const address = addresses.filter(a => a.user_id === user.id) || [];
      const role = roles.find(r => r.user_id === user.id) || {};



      return {
        user_id: user.id,
        email: user.email,
        username: user.username,
        mobile_number: user.mobile_number,
        profile,
        address,
        role
      };
    });

    // ----------------- Apply sorting -----------------
    if (order_by) {
      const type = order_type && order_type.toLowerCase() === "desc" ? -1 : 1;

      mergedUsers.sort((a, b) => {
        const getValue = (obj, key) => {
          if (!key.includes(".")) return obj[key];
          return key.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);
        };

        const aVal = getValue(a, order_by);
        const bVal = getValue(b, order_by);

        if (aVal === undefined) return 1 * type;
        if (bVal === undefined) return -1 * type;
        if (aVal < bVal) return -1 * type;
        if (aVal > bVal) return 1 * type;
        return 0;
      });
    }

    // ----------------- Apply pagination -----------------
    const totalRecords = mergedUsers.length;
    const startIndex = (page - 1) * page_size;
    const endIndex = startIndex + page_size;
    const paginatedUsers = mergedUsers.slice(startIndex, endIndex);

    // ----------------- Final Response -----------------
    return res.json({
      success: true,
      total: totalRecords,
      page,
      page_size,
      count: paginatedUsers.length,
      data: paginatedUsers
    });

  } catch (error) {
    console.error("Filter Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error filtering users",
      error: error.message
    });
  }
};



export const refreshAccessToken = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // The signature alone is not enough: the token must be the one last issued to this user (an old or stolen
    // refresh token used to keep working for its full 7 days, even after a password change), and the account must
    // still be active.
    if (user.is_active === false || !refreshTokenMatches(user, req.refreshToken)) {
      return res.status(401).json({ success: false, code: "REFRESH_TOKEN_EXPIRED", message: "Invalid or expired refresh token." });
    }

    const { accessToken, refreshToken } = await issueSessionTokens(user);

    return res.json({
      success: true,
      message: "Access token and refresh token renewed successfully",
      token: accessToken,
      refreshToken,
    });
  } catch (error) {
    return respondWithError(req, res, error, "refreshAccessToken");
  }
};


export const getMe = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized. Token payload missing user ID." });
    }

    const user = await User.findByPk(userId, {
      attributes: { exclude: ["password", "refresh_token"] }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const profile = await db.UserProfile.findOne({ where: { user_id: user.id } });

    res.json({
      success: true,
      message: "Token is valid",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        mobile_number: user.mobile_number,
        user_type: user.user_type,
        is_superuser: user.is_superuser,
        isMobileVerify: user.isMobileVerify,
        isEmailVerify: user.isEmailVerify,
        user_ref_id: user.user_ref_id,
        created_at: user.created_on || user.createdAt,
        profile: profile || null
      }
    });

  } catch (error) {
    console.error("getMe error:", error);
    res.status(500).json({ success: false, message: "Failed to verify token / fetch user info", error: error.message });
  }
};


// getDroneByIds lives in models/pr.js (the copy that was here was unused and referenced undefined models).



// GST added to the crop price. The Farmer app shows the farmer price + 5% and the order must be stored at that
// same amount, so the rate lives here on the server instead of being sent by the client.
const ORDER_TAX_RATE = Number(process.env.ORDER_TAX_RATE ?? 0.05);
const roundMoney = (value) => Math.round(value * 100) / 100;

// Requires a signed-in user (see orderRoutes.js). A farmer can only book for themselves; an admin books on a
// farmer's behalf. The price is calculated here: the client's price/tax/discount/total are only honoured for admins.
export const createOrder = async (req, res) => {
  try {
    const caller = req.auth;
    const body = parseOrThrow(createOrderSchema, req.body);
    const { start_date: startDateObj, crop_type_id, land_in_acers: landAcres, num_of_days, address, farmer_details } = body;

    // ── Who is the order for? ─────────────────────────────────────────
    let finalUserId;
    if (!caller.isAdmin) {
      finalUserId = caller.id;              // user_id / farmer_details in the request are ignored on purpose
    } else if (body.user_id) {
      finalUserId = Number(body.user_id);
      if (!Number.isInteger(finalUserId) || !(await User.findByPk(finalUserId, { attributes: ["id"] }))) {
        return res.status(400).json({ error: "user_id does not match an existing user" });
      }
    } else if (farmer_details?.mobile) {
      finalUserId = null;                   // resolved inside the transaction below
    } else {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // start_date (a calendar date stored as UTC midnight, today or later in India), crop_type_id, land_in_acers
    // (0 < acres <= 1000), num_of_days (1-60) and the address shape were checked by createOrderSchema.
    const crop = await db.MasterCrop.findByPk(crop_type_id);
    if (!crop || crop.is_active === false) {
      return res.status(400).json({ error: "Invalid crop_type_id" });
    }

    // The state -> district -> block chain must exist and belong together
    const problem = await checkLocationChain(db, address);
    if (problem) return res.status(400).json({ error: `address: ${problem}` });

    // Calculate working days based on MasterWorkingDays logic.
    // Fallback (no matching rule, no num_of_days sent): default drone capacity of 5 acres/day.
    let calculatedNumOfDays = num_of_days || Math.max(1, Math.ceil(landAcres / 5));

    try {
      const workingDayRecord = await db.MasterWorkingDays.findOne({
        where: {
          is_active: true,
          min_acre: { [db.Op.lte]: landAcres },
          max_acre: { [db.Op.gte]: landAcres },
        }
      });

      if (workingDayRecord && workingDayRecord.working_days) {
        calculatedNumOfDays = workingDayRecord.working_days;
      }
    } catch (err) {
      logger.error(`Error calculating working days: ${err.message}`);
    }

    // end_date = start_date + (working_days - 1), pure UTC calendar arithmetic
    const calculatedEndDate = addDaysUTC(startDateObj, calculatedNumOfDays - 1);

    // ── Price: calculated by the server ────────────────────────────────
    const basePrice = roundMoney(parseFloat(crop.price_per_acre || 0) * landAcres);
    let orderPrice = basePrice;
    let orderTax = roundMoney(basePrice * ORDER_TAX_RATE);
    let orderDiscount = 0;
    if (caller.isAdmin) {
      const money = (value, fallback, label) => {
        if (value === undefined || value === null || value === "") return fallback;
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) throw new ApiError(400, `${label} must be a number of 0 or more`);
        return roundMoney(n);
      };
      orderPrice = money(body.price, basePrice, "price");
      orderTax = money(body.tax, roundMoney(orderPrice * ORDER_TAX_RATE), "tax");
      orderDiscount = money(body.discount, 0, "discount");
      if (orderDiscount > orderPrice + orderTax) throw new ApiError(400, "discount cannot be more than the price plus tax");
    }
    const orderTotal = roundMoney(orderPrice + orderTax - orderDiscount);

    const bookingId = uuidv4();
    const autoVerified = !caller.isAdmin;   // the farmer's own login already proves who is booking
    const bookingOtp = autoVerified ? null : generateOtp();

    // ── Order, timeline and address are saved together or not at all ─────
    await db.sequelize.transaction(async (t) => {
      let userId = finalUserId;
      if (!userId) {
        // Admin booking for a farmer who has no account yet: create a placeholder account that cannot be signed
        // into until the farmer sets a password (it used to get the fixed password "12345678").
        const mobile = normalizeMobile(farmer_details.mobile);
        if (!mobile) throw new ApiError(400, "farmer_details.mobile must be a 10 digit mobile number");
        const email = farmer_details.email ? normalizeEmail(farmer_details.email) : null;
        if (email && !isValidEmail(email)) throw new ApiError(400, "farmer_details.email is not a valid email address");

        await lockIdentifiers(db.sequelize, t, [mobile, email].filter(Boolean));
        let farmer = await User.findOne({ where: { mobile_number: mobile }, transaction: t });
        if (!farmer) {
          farmer = await User.create({
            username: String(farmer_details.name || "Farmer").slice(0, 50),
            mobile_number: mobile,
            email,
            user_type: 3,
            password: await bcrypt.hash(randomInt(0, 2 ** 31).toString(36) + uuidv4(), 10),
            created_by: caller.id,
          }, { transaction: t });
          await db.UserProfile.create({ user_id: farmer.id, first_name: String(farmer_details.name || "Farmer").slice(0, 60), created_by: caller.id }, { transaction: t });
        }
        userId = farmer.id;
      }

      await SprayingOrder.create({
        booking_id: bookingId,
        start_date: startDateObj,
        end_date: calculatedEndDate,
        num_of_days: calculatedNumOfDays,
        crop_type_id,
        land_in_acers: landAcres,
        price: orderPrice,
        tax: orderTax,
        total_price: orderTotal,
        cupon_id: null,                       // coupons are not implemented; it used to be filled with a made-up id (13)
        discount: orderDiscount,
        user_id: userId,
        order_status: OrderStatusEnum.ORDER_PLACED,
        is_paid: false,
        transcation_id: null,
        booking_otp: bookingOtp,
        created_on: new Date(),
        created_by: caller.isAdmin ? caller.id : userId,
      }, { transaction: t });

      await db.SprayingOrderTimeline.create({
        booking_id: bookingId,
        order_status: OrderStatusEnum.ORDER_PLACED,
        remarks: caller.isAdmin ? 'Order placed by admin' : 'Order Placed',
        created_by: caller.id,
      }, { transaction: t });

      if (autoVerified) {
        await updateOrderStatus(bookingId, OrderStatusEnum.WAITING_FOR_CONFIRMATION, "Order confirmed by farmer", userId, t);
      }

      await SprayingOrderAddress.create({
        order_id: bookingId,
        state: address.state,
        district: address.district,
        block: address.block,
        village: address.village,
        lane1: address.lane1 || address.address1,
        lane2: address.lane2 || address.address2,
        address1: address.address1 || address.lane1,
        address2: address.address2 || address.lane2,
        pincode: address.pincode,
      }, { transaction: t });
    });

    return res.status(201).json({
      message: "Order and address created successfully",
      booking_id: bookingId,
      order_status: autoVerified ? OrderStatusEnum.WAITING_FOR_CONFIRMATION : OrderStatusEnum.ORDER_PLACED,
      otp_required: !autoVerified,
      price: orderPrice,
      tax: orderTax,
      discount: orderDiscount,
      total_price: orderTotal,
      dev_otp: !autoVerified && env.EXPOSE_DEV_OTPS ? bookingOtp : undefined,
    });

  } catch (error) {
    return respondWithError(req, res, error, "createOrder");
  }
};

export const getUsersForBooking = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ["id", "email", "username", "mobile_number"],
      limit: 100,
      order: [["id", "DESC"]],
    });

    return res.status(200).json({
      message: "Users fetched successfully",
      users,
    });

  } catch (error) {
    return respondWithError(req, res, error, "getUsersForBooking");
  }
};


export const getUserByEmail = async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);

    if (!email) {
      return res.status(400).json({
        message: "Email is required"
      });
    }

    // case-insensitive, like login
    const user = await User.findOne({
      where: db.Sequelize.where(db.Sequelize.fn("lower", db.Sequelize.col("email")), email),
      attributes: ["id", "email", "username", "mobile_number"]
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const profile = await UserProfile.findOne({
      where: { user_id: user.id },
      attributes: ["first_name", "last_name"]
    });

    const userAddresses = await UserAddress.findAll({
      where: { user_id: user.id, is_active: true },
      raw: true
    });

    const addresses = await Promise.all(userAddresses.map(async (addr) => {
      const [stateObj, districtObj, blockObj] = await Promise.all([
        MasterState.findOne({ where: { id: addr.state }, attributes: ["state_name"], raw: true }),
        MasterDistrict.findOne({ where: { id: addr.district }, attributes: ["district_name"], raw: true }),
        MasterBlock.findOne({ where: { id: addr.block }, attributes: ["block_name"], raw: true }),
      ]);
      return {
        ...addr,
        state_name: stateObj?.state_name || null,
        district_name: districtObj?.district_name || null,
        block_name: blockObj?.block_name || null,
      };
    }));

    return res.status(200).json({
      message: "User fetched successfully",
      user: {
        ...user.dataValues,
        profile: profile ? profile.dataValues : null,
        addresses
      }
    });

  } catch (error) {
    return respondWithError(req, res, error, "getUserByEmail");
  }
};

export const addUserAddress = async (req, res) => {
  try {
    const { user_id } = req.params;
    if (!(await User.findByPk(user_id, { attributes: ["id"] }))) {
      return res.status(404).json({ message: "User not found" });
    }

    // state -> district -> block must be a real, consistent chain and the pincode 6 digits (nothing is invented)
    const [clean] = await buildAddresses(db, [{ ...req.body, is_primary: false }]);
    if (!req.body.lane_1 && !req.body.lane1) {
      return res.status(400).json({ message: "Address: lane_1 is required" });
    }

    const newAddress = await UserAddress.create({
      user_id,
      ...clean,
      is_primary: false,
      is_active: true,
      created_by: req.auth?.id ?? null,
    });

    const [stateObj, districtObj, blockObj] = await Promise.all([
      MasterState.findOne({ where: { id: clean.state }, attributes: ["state_name"], raw: true }),
      MasterDistrict.findOne({ where: { id: clean.district }, attributes: ["district_name"], raw: true }),
      MasterBlock.findOne({ where: { id: clean.block }, attributes: ["block_name"], raw: true }),
    ]);

    return res.status(201).json({
      message: "Address created successfully",
      address: {
        ...newAddress.dataValues,
        state_name: stateObj?.state_name || null,
        district_name: districtObj?.district_name || null,
        block_name: blockObj?.block_name || null,
      }
    });
  } catch (error) {
    return respondWithError(req, res, error, "addUserAddress");
  }
};

export const verifyOrderOTP = async (req, res) => {
  try {
    const { booking_id, otp } = req.body;

    if (!booking_id || !otp) {
      return res.status(400).json({ message: "booking_id and otp are required" });
    }

    const order = await SprayingOrder.findOne({ where: { booking_id } });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    // A booking can only be confirmed / re-sent by the farmer it belongs to, or by an admin
    if (!req.auth?.isAdmin && order.user_id !== req.auth?.id) {
      return res.status(403).json({ message: "This booking does not belong to you" });
    }

    // Already confirmed (e.g. a logged-in farmer's booking): nothing left to verify
    if (!order.booking_otp && order.order_status !== OrderStatusEnum.ORDER_PLACED) {
      return res.status(200).json({
        message: "Order already confirmed",
        booking_id,
        order_status: order.order_status,
      });
    }

    if (!order.booking_otp || order.booking_otp !== String(otp).trim()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    await db.sequelize.transaction(async (t) => {
      await updateOrderStatus(booking_id, OrderStatusEnum.WAITING_FOR_CONFIRMATION, "OTP Verified", req.auth?.id ?? null, t);
      await order.update({ booking_otp: null }, { transaction: t });
    });

    return res.status(200).json({ message: "OTP verified successfully, order created" });
  } catch (error) {
    return respondWithError(req, res, error, "verifyOrderOTP");
  }
};

export const resendOrderOTP = async (req, res) => {
  try {
    const { booking_id } = req.body;

    if (!booking_id) {
      return res.status(400).json({ message: "booking_id is required" });
    }

    const order = await SprayingOrder.findOne({ where: { booking_id } });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (!req.auth?.isAdmin && order.user_id !== req.auth?.id) {
      return res.status(403).json({ message: "This booking does not belong to you" });
    }
    // Only a booking that is still waiting for its OTP has anything to resend
    if (order.order_status !== OrderStatusEnum.ORDER_PLACED) {
      return res.status(409).json({ message: "This booking has already been confirmed" });
    }

    const newOtp = generateOtp();

    await order.update({ booking_otp: newOtp });

    // No SMS gateway is connected yet (see services/sms.service.js): the code is only returned to developers.
    return res.status(200).json({
      message: "OTP resent successfully",
      dev_otp: env.EXPOSE_DEV_OTPS ? newOtp : undefined,
    });
  } catch (error) {
    return respondWithError(req, res, error, "resendOrderOTP");
  }
};

// Admin list of orders with their addresses. Paged (default 200, max 1000): it used to load every order and run
// one extra query per order.
export const getOrders = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const orders = await SprayingOrder.findAll({ order: [["created_on", "DESC"]], limit, offset });
    const addresses = orders.length
      ? await SprayingOrderAddress.findAll({ where: { order_id: orders.map((o) => o.booking_id) } })
      : [];
    const addressByOrder = new Map(addresses.map((a) => [a.order_id, a.dataValues]));

    res.status(200).json(orders.map((order) => ({
      ...order.dataValues,
      address: addressByOrder.get(order.booking_id) || null,
    })));
  } catch (error) {
    return respondWithError(req, res, error, "getOrders");
  }
};


const VALID_ORDER_STATUSES = new Set(Object.values(OrderStatusEnum));
const CLOSING_STATUSES = [OrderStatusEnum.ORDER_CANCELLED, OrderStatusEnum.ORDER_REJECTED];

// Admin edit of an order. Only the fields that are sent change (0 is a valid value, e.g. removing a discount),
// the total is always price + tax - discount, the status must be a real status, and everything is saved together.
export const updateOrder = async (req, res) => {
  try {
    const body = req.body || {};
    const { booking_id, order_status, address } = body;

    if (!booking_id) {
      return res.status(400).json({ message: "booking_id is required" });
    }
    if (order_status !== undefined && !VALID_ORDER_STATUSES.has(order_status)) {
      return res.status(400).json({ message: `order_status must be one of: ${[...VALID_ORDER_STATUSES].join(", ")}` });
    }

    const has = (key) => body[key] !== undefined && body[key] !== null && body[key] !== "";
    const number = (key, { min = 0, integer = false } = {}) => {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < min || (integer && !Number.isInteger(n))) {
        throw new ApiError(400, `${key} must be ${integer ? "a whole number" : "a number"} of ${min} or more`);
      }
      return n;
    };

    const changes = {};
    if (has("start_date")) {
      const d = parseDateOnly(body.start_date);
      if (!d) throw new ApiError(400, "start_date must be a valid date (YYYY-MM-DD)");
      changes.start_date = d;
    }
    if (has("end_date")) {
      const d = parseDateOnly(body.end_date);
      if (!d) throw new ApiError(400, "end_date must be a valid date (YYYY-MM-DD)");
      changes.end_date = d;
    }
    if (has("num_of_days")) changes.num_of_days = number("num_of_days", { min: 1, integer: true });
    if (has("land_in_acers")) {
      changes.land_in_acers = number("land_in_acers");
      if (changes.land_in_acers <= 0) throw new ApiError(400, "land_in_acers must be greater than 0");
    }
    if (has("crop_type_id")) {
      if (!(await db.MasterCrop.findByPk(body.crop_type_id))) throw new ApiError(400, "Invalid crop_type_id");
      changes.crop_type_id = body.crop_type_id;
    }
    if (has("user_id")) {
      if (!(await User.findByPk(body.user_id, { attributes: ["id"] }))) throw new ApiError(400, "user_id does not match an existing user");
      changes.user_id = Number(body.user_id);
    }
    if (body.is_paid !== undefined) changes.is_paid = body.is_paid === true || body.is_paid === "true";
    if (has("transcation_id")) changes.transcation_id = String(body.transcation_id).slice(0, 255);
    if (body.cupon_id !== undefined) changes.cupon_id = body.cupon_id === null || body.cupon_id === "" ? null : Number(body.cupon_id);
    if (address) {
      const problem = await checkLocationChain(db, address);
      if (problem) throw new ApiError(400, `address: ${problem}`);
    }

    const result = await db.sequelize.transaction(async (t) => {
      const order = await SprayingOrder.findOne({ where: { booking_id }, transaction: t, lock: t.LOCK.UPDATE });
      if (!order) return { status: 404, body: { message: "Order not found" } };

      // Money: any change to price, tax or discount recalculates the total; a "total_price" from the client is ignored
      const priceTouched = has("price") || has("tax") || has("discount") || has("total_price");
      if (priceTouched) {
        const price = has("price") ? number("price") : Number(order.price) || 0;
        const tax = has("tax") ? number("tax") : Number(order.tax) || 0;
        const discount = has("discount") ? number("discount") : Number(order.discount) || 0;
        if (discount > price + tax) throw new ApiError(400, "discount cannot be more than the price plus tax");
        Object.assign(changes, { price, tax, discount, total_price: roundMoney(price + tax - discount) });
      }

      const start = changes.start_date || order.start_date;
      const end = changes.end_date || order.end_date;
      if (start && end && new Date(end) < new Date(start)) throw new ApiError(400, "end_date cannot be before start_date");

      if (Object.keys(changes).length > 0) {
        await order.update({ ...changes, modified_on: new Date(), modified_by: req.auth?.id ?? null }, { transaction: t });
      }

      if (order_status && order_status !== order.order_status) {
        await updateOrderStatus(booking_id, order_status, "Status updated by admin", req.auth?.id ?? null, t);
        // A cancelled/rejected booking must stop blocking the pilot's and drone's calendar
        if (CLOSING_STATUSES.includes(order_status)) {
          await SprayingDailyLogs.update({ is_active: false, modified_on: new Date() }, { where: { spraying_work_id: booking_id }, transaction: t });
        }
      }

      if (address) {
        const existing = await SprayingOrderAddress.findOne({ where: { order_id: booking_id }, transaction: t });
        const fields = Object.fromEntries(Object.entries({
          state: address.state, district: address.district, block: address.block, village: address.village,
          lane1: address.lane1 ?? address.address1, lane2: address.lane2 ?? address.address2,
          address1: address.address1 ?? address.lane1, address2: address.address2 ?? address.lane2,
          pincode: address.pincode,
        }).filter(([, v]) => v !== undefined && v !== null && v !== ""));
        if (existing) await existing.update(fields, { transaction: t });
        else await SprayingOrderAddress.create({ order_id: booking_id, ...fields }, { transaction: t });
      }

      return { status: 200, body: { message: "Order and address updated successfully" } };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return respondWithError(req, res, error, "updateOrder");
  }
};

// "Delete" cancels the order and frees its calendar; the row stays. Hard-deleting it used to leave the working
// days, assignees, timeline and comments pointing at an order that no longer existed, and those orphaned days
// kept the pilot and the drone "busy" forever.
export const deleteOrderById = async (req, res) => {
  try {
    const { booking_id } = req.body || {};
    if (!booking_id) return res.status(400).json({ message: "booking_id is required" });

    const result = await db.sequelize.transaction(async (t) => {
      const order = await SprayingOrder.findOne({ where: { booking_id }, transaction: t, lock: t.LOCK.UPDATE });
      if (!order) return { status: 404, body: { message: "Order not found" } };

      const logs = await SprayingDailyLogs.findAll({ where: { spraying_work_id: booking_id }, transaction: t });
      if (order.is_paid || logs.some((l) => ["started", "completed"].includes(getDayStatus(l)))) {
        return {
          status: 409,
          body: { message: "This order has payments or work on it and cannot be deleted. Cancel it instead.", code: "ORDER_HAS_ACTIVITY" },
        };
      }

      if (order.order_status !== OrderStatusEnum.ORDER_CANCELLED) {
        await updateOrderStatus(booking_id, OrderStatusEnum.ORDER_CANCELLED, "Order deleted by admin", req.auth?.id ?? null, t);
      }
      await SprayingDailyLogs.update({ is_active: false, modified_on: new Date() }, { where: { spraying_work_id: booking_id }, transaction: t });
      await SprayingWorkAssignee.update({ is_active: false, modified_on: new Date() }, { where: { booking_id }, transaction: t });
      await order.update({ is_active: false, modified_on: new Date(), modified_by: req.auth?.id ?? null }, { transaction: t });

      return { status: 200, body: { message: "Order deleted successfully" } };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    return respondWithError(req, res, error, "deleteOrderById");
  }
};


// filter api 



export const filterOrders = async (req, res) => {
  try {
    const filters = req.body || {};
    const page = parseInt(filters.page) || 1;
    const pageSize = parseInt(filters.pageSize) || 10;
    const orderBy = filters.orderBy || "created_on";
    const orderType =
      filters.orderType?.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const cleanData = (data) => {
      if (!data) return null;
      const { id, createdAt, updatedAt, ...rest } =
        data.dataValues || data;
      return rest;
    };

    const getUserName = async (user_id) => {
      if (!user_id) return null;
      const user = await UserProfile.findOne({ where: { user_id } });
      return user
        ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
        : null;
    };

    const matchInsensitive = (a, b) => {
      if (!b) return true;
      if (a === null || a === undefined) return false;
      return a.toString().toLowerCase().includes(b.toString().toLowerCase());
    };

    const matchNumeric = (a, b) => {
      if (b === undefined || b === null) return true;
      return Number(a) === Number(b);
    };

    const matchBoolean = (a, b) => {
      if (b === undefined || b === null) return true;
      return Boolean(a) === Boolean(b);
    };

    const matchDateRange = (date, start, end) => {
      if (!date) return false;
      const d = new Date(date);
      if (start && d < new Date(start)) return false;
      if (end && d > new Date(end)) return false;
      return true;
    };

    // Base filter for exact matches
    const orderWhere = {};
    if (filters.booking_id) orderWhere.booking_id = filters.booking_id;
    if (filters.is_paid !== undefined) orderWhere.is_paid = filters.is_paid;
    if (filters.user_id) orderWhere.user_id = filters.user_id;
    if (filters.is_active !== undefined)
      orderWhere.is_active = filters.is_active;

    // Fetch orders
    const orders = await SprayingOrder.findAll({
      where: orderWhere,
      order: [[orderBy, orderType]],
    });

    const filteredOrders = [];

    for (const order of orders) {
      const orderData = cleanData(order);

      // Address
      const address = await SprayingOrderAddress.findOne({
        where: { order_id: orderData.booking_id },
      });
      let fullAddress = null;
      if (address) {
        const [stateObj, districtObj, blockObj] = await Promise.all([
          MasterState.findOne({ where: { id: address.state } }),
          MasterDistrict.findOne({ where: { id: address.district } }),
          MasterBlock.findOne({ where: { id: address.block } }),
        ]);
        fullAddress = {
          ...cleanData(address),
          state_name: stateObj?.state_name || null,
          district_name: districtObj?.district_name || null,
          block_name: blockObj?.block_name || null,
        };
      }

      // Daily Logs
      const dailyLogs = await SprayingDailyLogs.findAll({
        where: { spraying_work_id: orderData.booking_id },
      });
      const cleanDailyLogs = [];
      for (const log of dailyLogs) {
        const logData = cleanData(log);
        const pilotName = await getUserName(logData.pilot_user_id);
        const coPilotName = await getUserName(logData.co_pilot_user_id);
        const verifiedByName = await getUserName(logData.verified_by)
        cleanDailyLogs.push({
          ...logData,
          pilot_name: pilotName,
          co_pilot_name: coPilotName,
          verifiedByName: verifiedByName
        });
      }

      // Comments
      const comments = await SprayingOrderComment.findAll({
        where: { spraying_order_id: orderData.booking_id },
      });

      // Assignee
      // 🧩 Fetch all assignees for this booking
      const assigneeRecords = await SprayingWorkAssignee.findAll({
        where: { booking_id: orderData.booking_id },
      });

      let cleanAssignee = [];

      if (assigneeRecords && assigneeRecords.length > 0) {
        for (const assigneeRaw of assigneeRecords) {
          const data = cleanData(assigneeRaw);

          const [pilotName, coPilotName, drone] = await Promise.all([
            getUserName(data.pilot_user_id),
            getUserName(data.co_pilot_user_id),
            Drone1.findOne({ where: { id: data.drone_id } }),
          ]);

          const { pilot_user_id, co_pilot_user_id, drone_id, ...rest } = data;

          cleanAssignee.push({
            ...rest,
            pilot_name: pilotName,
            co_pilot_name: coPilotName,
            drone_name:
              drone?.drone_name || drone?.name || drone?.droneName || null,
          });
        }
      } else {
        cleanAssignee = []; // keep it empty array if no assignee found
      }


      const createdByName = await getUserName(orderData.created_by);
      const modifiedByName = await getUserName(orderData.modified_by);


      const enriched = {
        ...orderData,
        created_by_name: createdByName,
        modified_by_name: modifiedByName,
        address: fullAddress,
        daily_logs: cleanDailyLogs,
        comments: comments.map(cleanData),
        assignee: cleanAssignee,
      };

      // Apply filtering
      let includeOrder = true;

      // Order filters
      if (filters.order_status && !matchInsensitive(orderData.order_status, filters.order_status))
        includeOrder = false;
      if (filters.crop_type_id && !matchNumeric(orderData.crop_type_id, filters.crop_type_id))
        includeOrder = false;
      if (filters.land_in_acers && !matchNumeric(orderData.land_in_acers, filters.land_in_acers))
        includeOrder = false;
      if (filters.price && !matchNumeric(orderData.price, filters.price))
        includeOrder = false;
      if (filters.tax && !matchNumeric(orderData.tax, filters.tax))
        includeOrder = false;
      if (filters.total_price && !matchNumeric(orderData.total_price, filters.total_price))
        includeOrder = false;
      if (filters.cupon_id && !matchNumeric(orderData.cupon_id, filters.cupon_id))
        includeOrder = false;
      if (filters.discount && !matchNumeric(orderData.discount, filters.discount))
        includeOrder = false;
      if (filters.transcation_id && !matchInsensitive(orderData.transcation_id, filters.transcation_id))
        includeOrder = false;

      // if (filters.start_date || filters.end_date) {
      //   if (!matchDateRange(orderData.created_on, filters.start_date, filters.end_date))
      //     includeOrder = false;
      // }

      if (filters.start_date || filters.end_date) {
        const orderStart = new Date(orderData.start_date);
        const orderEnd = new Date(orderData.end_date);
        const filterStart = filters.start_date ? new Date(filters.start_date) : null;
        const filterEnd = filters.end_date ? new Date(filters.end_date) : null;

        let overlap = true;

        if (filterStart && orderEnd < filterStart) overlap = false; // order ends before filter starts
        if (filterEnd && orderStart > filterEnd) overlap = false;   // order starts after filter ends

        if (!overlap) includeOrder = false;
      }


      // Address filters
      if (filters.state && !matchInsensitive(enriched.address?.state_name, filters.state))
        includeOrder = false;
      if (filters.district && !matchInsensitive(enriched.address?.district_name, filters.district))
        includeOrder = false;
      if (filters.block && !matchInsensitive(enriched.address?.block_name, filters.block))
        includeOrder = false;
      if (filters.village && !matchInsensitive(enriched.address?.village, filters.village))
        includeOrder = false;

      // Pilot / Co-pilot filters
      if (filters.pilot_name && !cleanDailyLogs.some(dl => matchInsensitive(dl.pilot_name, filters.pilot_name)))
        includeOrder = false;
      if (filters.co_pilot_name && !cleanDailyLogs.some(dl => matchInsensitive(dl.co_pilot_name, filters.co_pilot_name)))
        includeOrder = false;

      // Assignee filters
      if (filters.assignee_pilot_name && !matchInsensitive(enriched.assignee?.pilot_name, filters.assignee_pilot_name))
        includeOrder = false;
      if (filters.assignee_co_pilot_name && !matchInsensitive(enriched.assignee?.co_pilot_name, filters.assignee_co_pilot_name))
        includeOrder = false;
      if (filters.drone_name && !matchInsensitive(enriched.assignee?.drone_name, filters.drone_name))
        includeOrder = false;

      // Created / modified by
      if (filters.created_by_name && !matchInsensitive(enriched.created_by_name, filters.created_by_name))
        includeOrder = false;
      if (filters.modified_by_name && !matchInsensitive(enriched.modified_by_name, filters.modified_by_name))
        includeOrder = false;

      if (includeOrder) filteredOrders.push(enriched);
    }

    const total = filteredOrders.length;
    const start = (page - 1) * pageSize;
    const paginated = filteredOrders.slice(start, start + pageSize);

    res.status(200).json({
      total,
      currentPage: page,
      totalPages: Math.ceil(total / pageSize),
      orders: paginated,
    });
  } catch (error) {
    console.error("Error filtering orders:", error);
    res.status(500).json({ error: error.message });
  }
};


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Directory to save files
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

export const upload = multer({
  storage,
  // limits: { fileSize: 1 * 1024 * 1024 }, // 1 MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPG, JPEG, and PNG files are allowed"));
    }
    cb(null, true);
  },
});

// 🧩 Controller: updateWork
export const updateWork = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_verified } = req.body;
    const file = req.file;
    const modified_by = req.user?.id
    const verified_by = req.user?.id


    if (!id) {
      return res.status(400).json({ error: "Missing ID parameter" });
    }

    if (file && file.size > 1 * 1024 * 1024) {
      return res.status(400).json({ error: "File size must be less than 1 MB" });
    }

    // ✅ Prepare update data
    let updateData = {
      modified_by: modified_by ? parseInt(modified_by, 10) : null,
      modified_on: new Date(),
    };

    // ✅ Only update is_verified if it’s sent in the request
    if (is_verified !== undefined) {
      updateData.is_verified =
        is_verified === "true"
          ? true
          : is_verified === "false"
            ? false
            : null;
      updateData.verified_by = verified_by,
        updateData.verified_on = new Date()
    }


    // ✅ Handle uploaded image (already saved by multer)
    if (file) {
      updateData.land_image_original_name = file.originalname;
      updateData.land_image_new_name = file.filename;
      updateData.land_image_url = `/uploads/${file.filename}`;
    }

    // ✅ Use spraying_work_id instead of id
    const [updated] = await SprayingDailyLogs.update(updateData, {
      where: { id: id },
    });

    if (!updated) {
      return res.status(404).json({ error: "No record found with this spraying_work_id" });
    }

    res.status(200).json({
      message: "Record updated successfully",
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ error: error.message });
  }
};


// // assignWork lives in availabilityController.js (the version routed at POST /order/assign-work/:booking_id).
// The older copy that used to be here stored un-normalised dates and ignored drone_id, so it was removed.

// registerFarmer, registerPilot, sendOtp and verifyOtp live in registration.controller.js and otp.controller.js.
// The copies that used to be here trusted client-supplied `role` / `isverifyEmail` flags and are gone on purpose.

const generateOtp = () => randomInt(100000, 1000000).toString();


// ── farmer-edit / pilot-edit ─────────────────────────────────────

/**
 * Who edits whom, and is it allowed: a user edits their own profile, an administrator anyone's. The target must
 * really be a farmer (farmer-edit) or a pilot (pilot-edit).
 * `user_id` arrives as text in a multipart form ("5"): it used to be compared with `!==` against the numeric id
 * from the token, so a user sending their own id was refused as if editing someone else.
 */
const resolveEditTarget = async (req, input, kind) => {
  const loggedInUserId = Number(req.user?.id || req.user?.userId);
  if (!loggedInUserId) throw new ApiError(401, "Unauthorized: Access token is missing or invalid");

  const targetUserId = input.user_id ?? loggedInUserId;
  const callerIsAdmin = await isActivatedAdmin(loggedInUserId);
  if (targetUserId !== loggedInUserId && !callerIsAdmin) {
    throw new ApiError(403, "Unauthorized to update another user's profile.");
  }

  const targetUser = await User.findByPk(targetUserId);
  if (!targetUser) throw new ApiError(404, "User not found");

  const roles = await loadRoleNames(targetUserId);
  const rightKind = kind === "farmer"
    ? isFarmerAccount(targetUser.user_type, roles)
    : roles.includes("pilot") || (roles.length === 0 && targetUser.user_type === 2);
  if (!rightKind) throw new ApiError(400, kind === "farmer" ? "Target user is not a Farmer." : "Target user is not a Pilot.");

  return { loggedInUserId, targetUser, editedByAdmin: callerIsAdmin };
};

/**
 * The User row changes shared by both edits: identity (see services/identity.service.js), username, password.
 * Changing your own password needs the current one; any password change signs other devices out (their refresh
 * token stops working).
 */
const userChanges = async ({ input, body, targetUser, editedByAdmin, loggedInUserId }) => {
  const changes = await resolveIdentityChange(targetUser, input, { editedByAdmin });
  if (input.username) changes.username = input.username;
  if (input.password) {
    if (!editedByAdmin) {
      const current = typeof body.current_password === "string" ? body.current_password : "";
      if (!current) throw new ApiError(400, "Enter your current password to set a new one.");
      if (!targetUser.password || !(await bcrypt.compare(current, targetUser.password))) {
        throw new ApiError(400, "Current password is incorrect.");
      }
    }
    changes.password = await bcrypt.hash(input.password, 10);
    changes.refresh_token = null;
  }
  changes.modified_by = loggedInUserId;
  changes.modified_on = new Date();
  return changes;
};

const saveProfile = async ({ targetUser, input, extra, image, loggedInUserId }, t) => {
  const fields = { ...extra, modified_by: loggedInUserId, modified_on: new Date() };
  if (input.first_name) fields.first_name = input.first_name;
  if (input.last_name) fields.last_name = input.last_name;
  if (input.dob) fields.dob = input.dob;
  if (image) {
    fields.user_image_original_filename = image.original_name;
    fields.user_image_new_filename = image.new_name;
    fields.user_image_url = image.url;
  }
  const existing = await UserProfile.findOne({ where: { user_id: targetUser.id }, transaction: t });
  if (existing) return existing.update(fields, { transaction: t });
  return UserProfile.create({
    user_id: targetUser.id,
    first_name: input.first_name || targetUser.username || "",
    last_name: input.last_name || "",
    whatsapp_number: targetUser.mobile_number,
    ...fields,
    created_by: loggedInUserId,
  }, { transaction: t });
};

/** Sent addresses (validated against the location tables) replace the stored ones. */
const replaceAddresses = async (userId, addresses, loggedInUserId, t) => {
  if (!addresses.length) return;
  await UserAddress.destroy({ where: { user_id: userId }, transaction: t });
  for (const address of addresses) {
    await UserAddress.create({ user_id: userId, ...address, created_by: loggedInUserId, modified_by: loggedInUserId, modified_on: new Date() }, { transaction: t });
  }
};

export const updatePilot = async (req, res) => {
  let uploaded = [];
  try {
    const body = req.body || {};
    const input = parseOrThrow(farmerEditSchema, body);
    const { loggedInUserId, targetUser, editedByAdmin } = await resolveEditTarget(req, input, "pilot");

    const userUpdate = await userChanges({ input, body, targetUser, editedByAdmin, loggedInUserId });
    const addresses = await buildAddresses(db, parseAddressInput(body));
    const banks = readBankDetails(body);                                   // null: not sent, keep the stored ones
    const upiId = body.upi_id !== undefined ? readUpiId(body.upi_id) : undefined;
    const extra = {};
    if (body.aadhar_number !== undefined && body.aadhar_number !== "") extra.aadhar_number = readAadhar(body.aadhar_number);
    if (body.pan_card_number !== undefined && body.pan_card_number !== "") extra.pan_card_number = readPan(body.pan_card_number);

    const upload = await uploadPilotFiles(req.files, uploadToCloudinary);
    uploaded = upload.uploaded;
    const { files } = upload;

    await db.sequelize.transaction(async (t) => {
      await targetUser.update(userUpdate, { transaction: t });
      await consumeIdentityVerification(userUpdate, t);
      await saveProfile({ targetUser, input, extra, image: files.profile_image?.[0], loggedInUserId }, t);
      await replaceAddresses(targetUser.id, addresses, loggedInUserId, t);

      const passbookUrl = files.passbook_image?.[0]?.url;
      if (banks && banks.length > 0) {
        await db.UserBankDetails.destroy({ where: { user_id: targetUser.id }, transaction: t });
        for (const bank of banks) {
          await db.UserBankDetails.create({
            user_id: targetUser.id, ...bank, passbook_image_url: passbookUrl || null,
            is_active: true, created_by: loggedInUserId, modified_by: loggedInUserId,
          }, { transaction: t });
        }
      } else if (passbookUrl) {
        await db.UserBankDetails.update(
          { passbook_image_url: passbookUrl, modified_by: loggedInUserId, modified_on: new Date() },
          { where: { user_id: targetUser.id, is_primary: true }, transaction: t },
        );
      }

      if (upiId !== undefined) {
        await db.UserUpiDetails.destroy({ where: { user_id: targetUser.id }, transaction: t });
        if (upiId) {
          await db.UserUpiDetails.create({ user_id: targetUser.id, upi_id: upiId, created_by: loggedInUserId, modified_by: loggedInUserId }, { transaction: t });
        }
      }

      // New certificates replace the stored ones of the same type (all of the new files are kept: the old code
      // deleted inside the loop, so only the last of several uploaded files survived)
      for (const field of PILOT_FILES.filter((f) => !f.isBank && files[f.key])) {
        await db.UserDocuments.destroy({ where: { user_id: targetUser.id, document_type: field.docType }, transaction: t });
        for (const info of files[field.key]) {
          await db.UserDocuments.create({
            user_id: targetUser.id, document_type: field.docType,
            document_original_name: info.original_name, document_new_name: info.new_name, document_url: info.url,
            is_active: true, created_by: loggedInUserId, modified_by: loggedInUserId,
          }, { transaction: t });
        }
      }
    });

    return res.status(200).json({ success: true, message: "Pilot profile updated successfully." });
  } catch (error) {
    await discardUploads(uploaded);
    return respondWithError(req, res, error, "updatePilot");
  }
};

export const updateFarmer = async (req, res) => {
  const uploaded = [];
  try {
    const body = req.body || {};
    const input = parseOrThrow(farmerEditSchema, body);
    const { loggedInUserId, targetUser, editedByAdmin } = await resolveEditTarget(req, input, "farmer");

    const userUpdate = await userChanges({ input, body, targetUser, editedByAdmin, loggedInUserId });
    const addresses = await buildAddresses(db, parseAddressInput(body));

    let image = null;
    if (req.file) {
      validateImage(req.file, "Profile photo", ["jpg", "jpeg", "png"]);
      const result = await uploadToCloudinary(req.file.buffer, "farmers", "auto", req.file.originalname);
      image = { original_name: req.file.originalname, new_name: result.public_id, url: result.secure_url, resource_type: "image" };
      uploaded.push(image);
    }

    await db.sequelize.transaction(async (t) => {
      await targetUser.update(userUpdate, { transaction: t });
      await consumeIdentityVerification(userUpdate, t);
      await saveProfile({ targetUser, input, extra: {}, image, loggedInUserId }, t);
      await replaceAddresses(targetUser.id, addresses, loggedInUserId, t);
    });

    return res.status(200).json({ success: true, message: "Farmer profile updated successfully." });
  } catch (error) {
    await discardUploads(uploaded);
    return respondWithError(req, res, error, "updateFarmer");
  }
};
