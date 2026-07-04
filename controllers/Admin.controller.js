import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../models/index.js";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";



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
  SprayingWorkAssignee
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
    // 4. Check existing user
    // -----------------------------
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        message: "User already exists with this email",
      });
    }

    // -----------------------------
    // 5. Hash Password
    // -----------------------------
    const hashedPassword = await bcrypt.hash(password, 10);

    // -----------------------------
    // 6. Transaction Starts
    // -----------------------------
    const user = await db.sequelize.transaction(async (t) => {
      // Create main User
      const newUser = await User.create(
        {
          email,
          password: hashedPassword,
          username,
          mobile_number,
          is_superuser: false,
          user_type: 1,
        },
        { transaction: t }
      );

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
          aadhar_number,
          pan_card_number,
        },
        { transaction: t }
      );

      // Assign Role
      await UserRole.create(
        {
          user_id: newUser.id,
          role_privilage_id,
        },
        { transaction: t }
      );

      return newUser;
    });

    // -----------------------------
    // 7. Generate JWT Token
    // -----------------------------
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(201).json({
      message: "User registered successfully",
      user_id: user.id,
      token,
    });

  } catch (error) {
    console.error("🔥 REGISTRATION ERROR:", error);
    return res.status(500).json({
      message: "Registration failed",
      error: error.message,
    });
  }
};






export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // 3. Generate Access Token
    const accessToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "3d" }
    );

    // 4. Generate Refresh Token (stateless, not stored in DB)
    const refreshToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    // 5. Send tokens to client
    res.json({
      message: "Login successful",
      token: accessToken,
      refreshToken: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Login failed",
      error: error.message,
    });
  }
};





// export const updateUserProfile = async (req, res) => {
//   const t = await db.sequelize.transaction();
//   try {
//     const { userId } = req.params; // user id from URL
//     const {
//       password,
//       username,
//       mobile_number,
//       state,
//       district,
//       block,
//       village,
//       address1,
//       address2,
//       pincodde,
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

//     // Fetch user first
//     const user = await User.findByPk(userId, { transaction: t });
//     if (!user) {
//       await t.rollback();
//       return res.status(404).json({ message: "User not found" });
//     }

//     // Update User (email cannot be changed!)
//     if (password) {
//       user.password = await bcrypt.hash(password, 10);
//     }
//     if (username) user.username = username;
//     if (mobile_number) user.mobile_number = mobile_number;
//     user.modified_by = userId
//     user.modified_on = new Date().toISOString();

//     await user.save({ transaction: t });

//     // Update Address
//     const userAddress = await UserAddress.findOne({ where: { user_id: userId } });
//     if (userAddress) {
//       await userAddress.update(
//         { state, district, block, village, address1, address2, pincodde },
//         { transaction: t }
//       );
//     }

//     // Update Profile
//     const userProfile = await UserProfile.findOne({ where: { user_id: userId } });
//     if (userProfile) {
//       await userProfile.update(
//         {
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
//     }

//     // Update Role
//     const userRole = await UserRole.findOne({ where: { user_id: userId } });
//     if (userRole && role_privilage_id) {
//       await userRole.update({ role_privilage_id }, { transaction: t });
//     }

//     await t.commit();

//     return res.status(200).json({ message: "Profile updated successfully" });
//   } catch (error) {
//     await t.rollback();
//     console.error(error);
//     return res.status(500).json({ message: "Profile update failed", error: error.message });
//   }
// };

export const updateUserProfile = async (req, res) => {
  try {
    const {
      user_id, // required
      email,
      password,
      username,
      mobile_number,
      addresses, // optional array
      first_name,
      last_name,
      whatsapp_number,
      user_image_original_filename,
      user_image_new_filename,
      user_image_url,
      aadhar_number,
      pan_card_number,
      role_id,
    } = req.body;

    if (!user_id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findByPk(user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Hash password only if provided
    let hashedPassword = user.password;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    await db.sequelize.transaction(async (t) => {
      // 1. Update User basic info
      await user.update(
        {
          email,
          password: hashedPassword,
          username,
          mobile_number,
        },
        { transaction: t }
      );

      // 2. Update addresses only if provided
      if (Array.isArray(addresses) && addresses.length > 0) {
        await UserAddress.destroy({ where: { user_id }, transaction: t });

        const newAddresses = addresses.map((address) => ({
          user_id,
          lane_1: address.lane_1,
          lane_2: address.lane_2,
          state: address.state,
          district: address.district,
          block: address.block,
          village: address.village,
          pincode: address.pincode,
        }));

        await UserAddress.bulkCreate(newAddresses, { transaction: t });
      }

      // 3. Update or Create User Profile
      const existingProfile = await UserProfile.findOne({
        where: { user_id },
        transaction: t,
      });

      if (existingProfile) {
        await existingProfile.update(
          {
            first_name,
            last_name,
            whatsapp_number,
            user_image_original_filename,
            user_image_new_filename,
            user_image_url,
            aadhar_number,
            pan_card_number,
          },
          { transaction: t }
        );
      } else {
        await UserProfile.create(
          {
            user_id,
            first_name,
            last_name,
            whatsapp_number,
            user_image_original_filename,
            user_image_new_filename,
            user_image_url,
            aadhar_number,
            pan_card_number,
          },
          { transaction: t }
        );
      }

      // 4. Update or Create Role
      const existingRole = await UserRole.findOne({
        where: { user_id },
        transaction: t,
      });

      if (existingRole) {
        await existingRole.update({ role_id }, { transaction: t });
      } else {
        await UserRole.create({ user_id, role_id }, { transaction: t });
      }
    });

    return res.status(200).json({
      message: "User updated successfully",
      user_id,
    });
  } catch (error) {
    console.error("Update Error:", error);
    return res.status(500).json({
      message: "User update failed",
      error: error.message,
    });
  }
};


export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Find user
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Delete user
    await user.destroy();

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: "Failed to delete user", error: error.message });
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



export const refreshAccessToken = (req, res) => {
  const { token } = req.body; // refresh token from client

  try {
    // Verify the refresh token using the secret
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    // Optionally check if user exists
    // const user = await User.findOne({ where: { id: payload.id } });

    // Generate new access token
    const newAccessToken = jwt.sign(
      { id: payload.id, email: payload.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Access token refreshed",
      token: newAccessToken,
    });

  } catch (error) {
    console.error("Refresh token error:", error);
    return res.status(403).json({ message: "Invalid or expired refresh token" });
  }
};


export const getDroneByIds = async (req, res) => {
  try {
    const { id } = req.params;

    // Basic validation
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Drone ID is required"
      });
    }

    // Fetch basic drone details
    const drone = await Drone1.findByPk(id, {
      attributes: { exclude: ["createdAt", "updatedAt"] }
    });

    if (!drone) {
      return res.status(404).json({
        success: false,
        message: "Drone not found"
      });
    }

    // Fetch and enrich with arms data
    const droneArms = await DroneArms.findAll({
      where: { drone_id: id },
      attributes: ["arms_id", "arms_qty"],
      raw: true
    });

    const arms = await Promise.all(droneArms.map(async (arm) => {
      const masterArm = await MasterArms.findOne({
        where: { id: arm.arms_id },
        attributes: ["id", "name"],
        raw: true
      });

      return {
        master_arm_id: arm.arms_id,
        qty: arm.arms_qty,
        master_arm_name: masterArm ? masterArm.name : null
      };
    }));

    // Fetch and enrich with battery data
    const droneBatteries = await DroneBattery.findAll({
      where: { drone_id: id },
      attributes: ["battery_id", "battery_qty"],
      raw: true
    });

    const batteries = await Promise.all(droneBatteries.map(async (battery) => {
      const masterBattery = await MasterBattery.findOne({
        where: { id: battery.battery_id },
        attributes: ["id", "name", "brand_name", "capacity", "cell_number"],
        raw: true
      });

      return {
        master_battery_id: battery.battery_id,
        qty: battery.battery_qty,
        master_battery_name: masterBattery ? masterBattery.name : null,
        brand_name: masterBattery ? masterBattery.brand_name : null,
        capacity: masterBattery ? masterBattery.capacity : null,
        cell_number: masterBattery ? masterBattery.cell_number : null
      };
    }));

    // Fetch and enrich with charger data
    const droneChargers = await DroneCharger.findAll({
      where: { drone_id: id },
      attributes: ["charger_id", "is_charger_cable", "ischarger_pcable"],
      raw: true
    });

    const chargers = await Promise.all(droneChargers.map(async (charger) => {
      const masterCharger = await MasterCharger.findOne({
        where: { id: charger.charger_id },
        attributes: ["id", "name", "brand_name", "desc"],
        raw: true
      });

      return {
        master_charger_id: charger.charger_id,
        master_charger_name: masterCharger ? masterCharger.name : null,
        brand_name: masterCharger ? masterCharger.brand_name : null,
        description: masterCharger ? masterCharger.desc : null,
        is_charger_cable: charger.is_charger_cable,
        ischarger_pcable: charger.ischarger_pcable
      };
    }));

    // Fetch and enrich with controller data
    const droneControllers = await DroneController.findAll({
      where: { drone_id: id },
      attributes: ["id", "transmitter_id", "receiver_id"],
      raw: true
    });

    const controllers = await Promise.all(droneControllers.map(async (controller) => {
      const transmitter = await MasterTransmitter.findOne({
        where: { id: controller.transmitter_id },
        attributes: ["id", "name", "brand_name", "transmitter_type", "desc"],
        raw: true
      });

      const receiver = await MasterReceiver.findOne({
        where: { id: controller.receiver_id },
        attributes: ["id", "name", "brand_name", "receiver_type", "desc"],
        raw: true
      });

      return {
        controller_id: controller.id,
        transmitter_id: controller.transmitter_id,
        transmitter_name: transmitter ? transmitter.name : null,
        transmitter_brand_name: transmitter ? transmitter.brand_name : null,
        transmitter_type: transmitter ? transmitter.transmitter_type : null,
        transmitter_description: transmitter ? transmitter.desc : null,
        receiver_id: controller.receiver_id,
        receiver_name: receiver ? receiver.name : null,
        receiver_brand_name: receiver ? receiver.brand_name : null,
        receiver_type: receiver ? receiver.receiver_type : null,
        receiver_description: receiver ? receiver.desc : null
      };
    }));

    // Fetch and enrich with landing gear data
    const droneLandingGears = await DroneLandingGear.findAll({
      where: { drone_id: id },
      attributes: ["landing_gear_id"],
      raw: true
    });

    const landing_gears = await Promise.all(droneLandingGears.map(async (gear) => {
      const masterGear = await MasterLandingGear.findOne({
        where: { id: gear.landing_gear_id },
        attributes: ["id", "name", "brand_name", "desc"],
        raw: true
      });

      return {
        master_landing_gear_id: gear.landing_gear_id,
        master_landing_gear_name: masterGear ? masterGear.name : null,
        brand_name: masterGear ? masterGear.brand_name : null,
        description: masterGear ? masterGear.desc : null
      };
    }));

    // Fetch and enrich with motor data
    const droneMotors = await DroneMotor.findAll({
      where: { drone_id: id },
      attributes: ["motor_id", "motor_qty"],
      raw: true
    });

    const motors = await Promise.all(droneMotors.map(async (motor) => {
      const masterMotor = await MasterMotor.findOne({
        where: { id: motor.motor_id },
        attributes: ["id", "name", "brand_name", "desc"],
        raw: true
      });

      return {
        master_motor_id: motor.motor_id,
        motor_qty: motor.motor_qty,
        master_motor_name: masterMotor ? masterMotor.name : null,
        brand_name: masterMotor ? masterMotor.brand_name : null,
        description: masterMotor ? masterMotor.desc : null
      };
    }));

    // Combine all data
    const enrichedDrone = {
      ...drone.dataValues,
      arms,
      batteries,
      chargers,
      controllers,
      landing_gears,
      motors
    };

    return res.status(200).json({
      success: true,
      data: enrichedDrone
    });

  } catch (error) {
    console.error("Error fetching drone:", error);
    return res.status(500).json({
      success: false,
      message: `Internal server error: ${error}`
    });
  }
};


// export const updateOrder = async (req, res) => {
//   try {
//     const {
//       booking_id,       // Required
//       order_status,
//       is_paid,
//       transcation_id,
//       start_date,
//       end_date,
//       num_of_days,
//       crop_type_id,
//       land_in_acers,
//       price,
//       tax,
//       total_price,
//       cupon_id,
//       discount,
//       user_id,
//       address           // Optional object
//     } = req.body;

//     if (!booking_id) {
//       return res.status(400).json({ message: "booking_id is required" });
//     }

//     // Find order
//     const order = await SprayingOrder.findOne({ where: { booking_id } });
//     if (!order) return res.status(404).json({ message: "Order not found" });

//     // Update order
//     await order.update({
//       start_date: start_date || order.start_date,
//       end_date: end_date || order.end_date,
//       num_of_days: num_of_days || order.num_of_days,
//       crop_type_id: crop_type_id || order.crop_type_id,
//       land_in_acers: land_in_acers || order.land_in_acers,
//       price: price || order.price,
//       tax: tax || order.tax,
//       total_price: total_price || order.total_price,
//       cupon_id: cupon_id || order.cupon_id,
//       discount: discount || order.discount,
//       user_id: user_id || order.user_id,
//       order_status: order_status || order.order_status,
//       is_paid: is_paid !== undefined ? is_paid : order.is_paid,
//       transcation_id: transcation_id || order.transcation_id,
//     });

//     // Update or create address
//     if (address) {
//       const existingAddress = await SprayingOrderAddress.findOne({ where: { order_id: booking_id } });

//       if (existingAddress) {
//         // Update existing address
//         await existingAddress.update({
//           state: address.state || existingAddress.state,
//           district: address.district || existingAddress.district,
//           block: address.block || existingAddress.block,
//           village: address.village || existingAddress.village,
//           address1: address.address1 || existingAddress.address1,
//           address2: address.address2 || existingAddress.address2,
//         });
//       } else {
//         // Create new address
//         await SprayingOrderAddress.create({
//           order_id: booking_id,
//           state: address.state,
//           district: address.district,
//           block: address.block,
//           village: address.village,
//           address1: address.address1,
//           address2: address.address2,
//         });
//       }
//     }

//     res.status(200).json({ message: "Order and address updated successfully" });

//   } catch (error) {
//     console.error("Error updating order:", error);
//     res.status(500).json({ error: error.message });
//   }
// };



export const createOrder = async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      num_of_days,
      crop_type_id,
      land_in_acers,
      price,
      tax,
      total_price,
      cupon_id,
      discount,
      user_id,
      address,
      farmer_details // new field from frontend
    } = req.body;

    let final_user_id = user_id;

    // Auto-create or find user if user_id is missing but farmer_details is provided
    if (!final_user_id && farmer_details && farmer_details.mobile) {
      let existingUser = await db.User.findOne({ where: { mobile_number: farmer_details.mobile } });
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash("12345678", 10);
        existingUser = await db.User.create({
          username: farmer_details.name || "Farmer",
          mobile_number: farmer_details.mobile,
          email: farmer_details.email || null,
          user_type: 1, // Farmer
          password: hashedPassword
        });
        await db.UserProfile.create({
          user_id: existingUser.id,
          first_name: farmer_details.name || "Farmer"
        });
      }
      final_user_id = existingUser.id;
    }

    if (!start_date || !crop_type_id || !final_user_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const landAcres = land_in_acers || 0;

    // 🔥 IST TIME FIX
    const nowISTString = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
    });
    const createdOnIST = new Date(nowISTString);

    // Calculate working days based on MasterWorkingDays logic
    let calculatedNumOfDays = parseInt(num_of_days) || 1;
    let calculatedEndDate = end_date || start_date;
    
    try {
      const workingDayRecord = await db.MasterWorkingDays.findOne({
        where: {
          is_active: true,
          min_acre: { [db.Op.lte]: parseFloat(landAcres) },
          max_acre: { [db.Op.gte]: parseFloat(landAcres) },
        }
      });

      if (workingDayRecord && workingDayRecord.working_days) {
        calculatedNumOfDays = workingDayRecord.working_days;
        
        // Compute end_date by adding (working_days - 1) to start_date
        const stDate = new Date(start_date);
        stDate.setDate(stDate.getDate() + (calculatedNumOfDays - 1));
        calculatedEndDate = stDate.toISOString().slice(0, 10);
      }
    } catch (err) {
      console.error("Error calculating working days:", err);
    }

    // Generate unique booking_id
    const bookingId = uuidv4();

    const bookingOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Create order
    const order = await SprayingOrder.create({
      booking_id: bookingId,
      start_date,
      end_date: calculatedEndDate,
      num_of_days: calculatedNumOfDays,
      crop_type_id,
      land_in_acers: landAcres,
      price,
      tax,
      total_price,
      cupon_id: 13,
      discount,
      user_id: final_user_id,
      order_status: "Pending OTP",
      is_paid: false,
      transcation_id: null,
      booking_otp: bookingOtp,

      // 🔥 IST timestamp
      created_on: createdOnIST,

      // 🔥 IMPORTANT FIX
      created_by: final_user_id,
    });

    // Create order address
    if (address) {
      await SprayingOrderAddress.create({
        order_id: bookingId,
        state: address.state,
        district: address.district,
        block: address.block,
        village: address.village,
        address1: address.address1,
        address2: address.address2,
      });
    }

    return res.status(201).json({
      message: "Order and address created successfully",
      booking_id: bookingId,
    });

  } catch (error) {
    console.error("CREATE ORDER ERROR:", error);
    return res.status(500).json({ error: error.message });
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
    console.error("GET USERS ERROR:", error);
    return res.status(500).json({
      error: error.message,
    });
  }
};


export const getUserByEmail = async (req, res) => {
  try {

    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        message: "Email is required"
      });
    }

    const user = await User.findOne({
      where: { email },
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
    console.error("GET USER ERROR:", error);
    return res.status(500).json({
      error: error.message
    });
  }
};

export const addUserAddress = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { lane_1, state, district, block, village, pincode } = req.body;

    if (!user_id || !lane_1 || !state || !district || !block || !village || !pincode) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const newAddress = await UserAddress.create({
      user_id,
      lane_1,
      state,
      district,
      block,
      village,
      pincode,
      is_active: true
    });

    const [stateObj, districtObj, blockObj] = await Promise.all([
      MasterState.findOne({ where: { id: state }, attributes: ["state_name"], raw: true }),
      MasterDistrict.findOne({ where: { id: district }, attributes: ["district_name"], raw: true }),
      MasterBlock.findOne({ where: { id: block }, attributes: ["block_name"], raw: true }),
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
    console.error("ADD USER ADDRESS ERROR:", error);
    return res.status(500).json({ error: error.message });
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

    if (order.booking_otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    await order.update({
      order_status: "Pending", // Change from "Pending OTP" to "Pending"
      booking_otp: null
    });

    return res.status(200).json({ message: "OTP verified successfully, order created" });
  } catch (error) {
    console.error("VERIFY ORDER OTP ERROR:", error);
    return res.status(500).json({ error: error.message });
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

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

    await order.update({ booking_otp: newOtp });

    // Normally send SMS here...

    return res.status(200).json({ message: "OTP resent successfully" });
  } catch (error) {
    console.error("RESEND ORDER OTP ERROR:", error);
    return res.status(500).json({ error: error.message });
  }
};

export const getOrders = async (req, res) => {
  try {
    // Fetch all orders with their addresses
    const orders = await SprayingOrder.findAll();

    // For each order, fetch its address and combine
    const result = await Promise.all(
      orders.map(async (order) => {
        const address = await SprayingOrderAddress.findOne({
          where: { order_id: order.booking_id },
        });
        return {
          ...order.dataValues,
          address: address ? address.dataValues : null,
        };
      })
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: error.message });
  }
};

export const updateOrder = async (req, res) => {
  try {
    const {
      booking_id,       // Required
      order_status,
      is_paid,
      transcation_id,
      start_date,
      end_date,
      num_of_days,
      crop_type_id,
      land_in_acers,
      price,
      tax,
      total_price,
      cupon_id,
      discount,
      user_id,

      address           // Optional object
    } = req.body;

    if (!booking_id) {
      return res.status(400).json({ message: "booking_id is required" });
    }

    // Find order
    const order = await SprayingOrder.findOne({ where: { booking_id } });
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Update order
    await order.update({
      start_date: start_date || order.start_date,
      end_date: end_date || order.end_date,
      num_of_days: num_of_days || order.num_of_days,
      crop_type_id: crop_type_id || order.crop_type_id,
      land_in_acers: land_in_acers || order.land_in_acers,
      price: price || order.price,
      tax: tax || order.tax,
      total_price: total_price || order.total_price,
      cupon_id: cupon_id || order.cupon_id,
      discount: discount || order.discount,
      user_id: user_id || order.user_id,
      order_status: order_status || order.order_status,
      is_paid: is_paid !== undefined ? is_paid : order.is_paid,
      transcation_id: transcation_id || order.transcation_id,
    });

    // Update or create address
    if (address) {
      const existingAddress = await SprayingOrderAddress.findOne({ where: { order_id: booking_id } });

      if (existingAddress) {
        // Update existing address
        await existingAddress.update({
          state: address.state || existingAddress.state,
          district: address.district || existingAddress.district,
          block: address.block || existingAddress.block,
          village: address.village || existingAddress.village,
          address1: address.address1 || existingAddress.address1,
          address2: address.address2 || existingAddress.address2,
        });
      } else {
        // Create new address
        await SprayingOrderAddress.create({
          order_id: booking_id,
          state: address.state,
          district: address.district,
          block: address.block,
          village: address.village,
          address1: address.address1,
          address2: address.address2,
        });
      }
    }

    res.status(200).json({ message: "Order and address updated successfully" });

  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteOrderById = async (req, res) => {
  try {
    const { booking_id } = req.body;

    // Find the order first
    const order = await SprayingOrder.findOne({ where: { booking_id } });
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Delete the associated address (if any)
    await SprayingOrderAddress.destroy({ where: { order_id: booking_id } });

    // Delete the main order
    await SprayingOrder.destroy({ where: { booking_id } });

    res.status(200).json({
      message: "Order and associated address deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ error: error.message });
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


// export const assignWork = async (req, res) => {
//   try {
//     const { booking_id } = req.params;
//     const { pilot, copilot, drone_id, working_date } = req.body;

//     if (!booking_id || !pilot || !copilot || !drone_id || !Array.isArray(working_date)) {
//       return res.status(400).json({ message: "Missing required fields" });
//     }

//     const updatedDates = [];

//     // Loop through each working date
//     for (const date of working_date) {
//       // Convert to proper date format
//       const formattedDate = new Date(date);

//       // Check if a daily log already exists for this booking_id and date
//       const existingLog = await SprayingDailyLogs.findOne({
//         where: { spraying_work_id: booking_id, working_date: formattedDate },
//       });

//       if (existingLog) {
//         // If exists, check if pilot, co-pilot, or drone changed
//         const { pilot_user_id, co_pilot_user_id } = existingLog;

//         if (
//           pilot_user_id !== pilot ||
//           co_pilot_user_id !== copilot
//         ) {
//           // Update pilot / copilot fields
//           await existingLog.update({
//             pilot_user_id: pilot,
//             co_pilot_user_id: copilot,
//             modified_on: new Date(),
//           });
//           updatedDates.push({ date, action: "updated existing daily log" });
//         } else {
//           updatedDates.push({ date, action: "no change" });
//         }
//       } else {
//         // If not exist, create new record
//         await SprayingDailyLogs.create({
//           spraying_work_id: booking_id,
//           pilot_user_id: pilot,
//           co_pilot_user_id: copilot,
//           working_date: formattedDate,
//           created_on: new Date(),
//           is_active: true,
//         });
//         updatedDates.push({ date, action: "created new daily log" });
//       }
//     }

//     // 🔹 Update SprayingOrder end date if needed
//     const latestDate = new Date(Math.max(...working_date.map(d => new Date(d))));
//     const sprayingOrder = await SprayingOrder.findOne({ where: { booking_id } });

//     if (sprayingOrder && sprayingOrder.end_date) {
//       const currentEndDate = new Date(sprayingOrder.end_date);
//       if (latestDate > currentEndDate) {
//         await sprayingOrder.update({ end_date: latestDate });
//       }
//     }

//     // 🔹 Check SprayingWorkAssignee
//     const existingAssignee = await SprayingWorkAssignee.findOne({ where: { booking_id } });

//     if (existingAssignee) {
//       if (
//         existingAssignee.pilot_user_id !== pilot ||
//         existingAssignee.co_pilot_user_id !== copilot ||
//         existingAssignee.drone_id !== drone_id
//       ) {
//         // If any difference, create new row
//         await SprayingWorkAssignee.create({
//           booking_id,
//           pilot_user_id: pilot,
//           co_pilot_user_id: copilot,
//           drone_id,
//           created_on: new Date(),
//         });
//       }
//     } else {
//       // No assignee record yet → create one
//       await SprayingWorkAssignee.create({
//         booking_id,
//         pilot_user_id: pilot,
//         co_pilot_user_id: copilot,
//         drone_id,
//         created_on: new Date(),
//       });
//     }

//     res.status(200).json({
//       message: "Work assigned successfully",
//       result: updatedDates,
//     });
//   } catch (error) {
//     console.error("Error assigning work:", error);
//     res.status(500).json({ error: error.message });
//   }
// };

const parseToDate = (d) => {
  // Accept DD-MM-YYYY or YYYY-MM-DD (or other valid Date strings)
  if (!d) return null;
  if (typeof d !== "string") return new Date(d);

  // match dd-mm-yyyy or d-m-yyyy
  const dm = d.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]) - 1; // JS months 0-11
    const year = Number(dm[3]);
    // create date at midnight local time
    return new Date(year, month, day);
  }

  // fallback: let Date parse (ISO or other)
  return new Date(d);
};

export const assignWork = async (req, res) => {
  try {
    const { booking_id } = req.params;
    const { pilot, copilot, drone_id, working_date } = req.body;

    // ✅ Validation
    if (!booking_id || !pilot || !copilot || !drone_id || !Array.isArray(working_date)) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ✅ Convert and sort working dates (ascending)
    const sortedDates = working_date
      .map(d => new Date(d))
      .sort((a, b) => a - b);

    const updatedDates = [];

    // ✅ Loop through each date
    for (const date of sortedDates) {
      const formattedDate = new Date(date);

      // Check if a log already exists for this booking_id & date
      const existingLog = await SprayingDailyLogs.findOne({
        where: { spraying_work_id: booking_id, working_date: formattedDate },
      });

      if (existingLog) {
        const { pilot_user_id, co_pilot_user_id } = existingLog;

        if (pilot_user_id !== pilot || co_pilot_user_id !== copilot) {
          // Update pilot or copilot if changed
          await existingLog.update({
            pilot_user_id: pilot,
            co_pilot_user_id: copilot,
            modified_on: new Date(),
          });
          updatedDates.push({ date: formattedDate, action: "updated existing daily log" });
        } else {
          updatedDates.push({ date: formattedDate, action: "no change" });
        }
      } else {
        // Create new log
        await SprayingDailyLogs.create({
          spraying_work_id: booking_id,
          pilot_user_id: pilot,
          co_pilot_user_id: copilot,
          working_date: formattedDate,
          created_on: new Date(),
          is_active: true,
        });
        updatedDates.push({ date: formattedDate, action: "created new daily log" });
      }
    }

    // ✅ Update SprayingOrder start_date and end_date
    const earliestDate = sortedDates[0];
    const latestDate = sortedDates[sortedDates.length - 1];

    const sprayingOrder = await SprayingOrder.findOne({ where: { booking_id } });

    if (sprayingOrder) {
      const currentStartDate = new Date(sprayingOrder.start_date);
      const currentEndDate = new Date(sprayingOrder.end_date);

      const updateData = {};
      if (earliestDate < currentStartDate) {
        updateData.start_date = earliestDate;
      }
      if (latestDate > currentEndDate) {
        updateData.end_date = latestDate;
      }

      if (Object.keys(updateData).length > 0) {
        await sprayingOrder.update(updateData);
      }
    }

    // ✅ Handle SprayingWorkAssignee
    const existingAssignee = await SprayingWorkAssignee.findOne({ where: { booking_id } });

    if (existingAssignee) {
      if (
        existingAssignee.pilot_user_id !== pilot ||
        existingAssignee.co_pilot_user_id !== copilot ||
        existingAssignee.drone_id !== drone_id
      ) {
        // Create new row if any changes found
        await SprayingWorkAssignee.create({
          booking_id,
          pilot_user_id: pilot,
          co_pilot_user_id: copilot,
          drone_id,
          created_on: new Date(),
        });
      }
    } else {
      // Create new if none exist
      await SprayingWorkAssignee.create({
        booking_id,
        pilot_user_id: pilot,
        co_pilot_user_id: copilot,
        drone_id,
        created_on: new Date(),
      });
    }

    // ✅ Final Response
    res.status(200).json({
      message: "Work assigned successfully",
      result: updatedDates,
    });

  } catch (error) {
    console.error("Error assigning work:", error);
    res.status(500).json({ error: error.message });
  }
};