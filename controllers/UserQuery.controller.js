import db from "../models/index.js";

const { User, UserProfile, UserAddress, UserRole } = db;

// API 1: Fetch users by role ID (provided in payload)
export const getUsersByRole = async (req, res) => {
  try {
    const { role_id } = req.body;

    if (role_id === undefined || role_id === null || isNaN(Number(role_id))) {
      return res.status(400).json({ success: false, error: "role_id (integer) in payload is required" });
    }

    // 1. Find all user_ids matching the role_id from USER_ROLE table
    const userRoles = await UserRole.findAll({
      where: { role_id: Number(role_id) },
      attributes: ["user_id"]
    });

    const userIds = userRoles.map((ur) => ur.user_id).filter(Boolean);

    if (userIds.length === 0) {
      return res.status(200).json([]);
    }

    // 2. Fetch users (to get user_ref_id)
    const users = await User.findAll({
      where: { id: userIds },
      attributes: ["id", "user_ref_id"]
    });

    // 3. Fetch profiles (to get first_name and last_name)
    const profiles = await UserProfile.findAll({
      where: { user_id: userIds },
      attributes: ["user_id", "first_name", "last_name"]
    });

    // Create maps for efficient lookups
    const profileMap = profiles.reduce((acc, p) => {
      const fullName = `${p.first_name || ""} ${p.last_name || ""}`.trim();
      acc[p.user_id] = fullName;
      return acc;
    }, {});

    const userMap = users.reduce((acc, u) => {
      acc[u.id] = u.user_ref_id || "";
      return acc;
    }, {});

    // 4. Format output as requested
    const formattedUsers = userIds.map((userId) => {
      const name = profileMap[userId] || "";
      const refCode = userMap[userId] || "";
      return {
        id: userId,
        name: name,
        "refrense Code": refCode
      };
    });

    return res.status(200).json(formattedUsers);
  } catch (error) {
    console.error("Get Users By Role Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// API 2: Fetch user addresses by user_id or reference_no
export const getUserAddresses = async (req, res) => {
  try {
    const { user_id, reference_no, reference_code, user_ref_id } = req.body || {};

    let targetUserId = null;

    if (user_id !== undefined && user_id !== null && user_id !== "") {
      targetUserId = Number(user_id);

      // Verify if the user exists
      const user = await User.findByPk(targetUserId, { attributes: ["id"] });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User ID does not exist"
        });
      }
    } else {
      // Find reference code from various potential payload fields
      const refVal = reference_no || reference_code || user_ref_id;
      if (!refVal) {
        return res.status(400).json({
          success: false,
          error: "Either user_id or reference_no must be provided in the payload"
        });
      }

      // Query User table to find the matching user_ref_id
      const user = await User.findOne({
        where: { user_ref_id: String(refVal).trim() },
        attributes: ["id"]
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User reference ID does not exist"
        });
      }

      targetUserId = user.id;
    }

    // Fetch all address records from USER_ADDRESS table
    const addresses = await UserAddress.findAll({
      where: { user_id: targetUserId }
    });

    return res.status(200).json(addresses);
  } catch (error) {
    console.error("Get User Addresses Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
