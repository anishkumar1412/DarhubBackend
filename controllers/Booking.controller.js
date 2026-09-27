import { Op } from 'sequelize';
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../models/index.js";
import { OrderStatusEnum } from "../utils/enums.js";
import { updateOrderStatus } from "../utils/orderUtils.js";

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
  SprayingWorkAssignee,
  SprayingDailyLogs,
  SprayingOrderComment,
  MasterCrop
  
} = db;


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
//       address,          // Optional object
//       work_assignee,
//       daily_logs        // Optional array
//     } = req.body;

//     if (!booking_id) {
//       return res.status(400).json({ message: "booking_id is required" });
//     }

//     // Find order
//     const order = await SprayingOrder.findOne({ where: { booking_id } });
//     if (!order) return res.status(404).json({ message: "Order not found" });

//     // ✅ Update order
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

//     // ✅ Update or recreate address
//     if (address) {
//       const existingAddress = await SprayingOrderAddress.findOne({ where: { order_id: booking_id } });
//       if (existingAddress) await existingAddress.destroy();

//       await SprayingOrderAddress.create({
//         order_id: booking_id,
//         state: address.state,
//         district: address.district,
//         block: address.block,
//         village: address.village,
//         address1: address.address1,
//         address2: address.address2,
//       });
//     }

//     // ✅ Handle work_assignee
//     if (work_assignee) {
//       const existingAssignee = await SprayingWorkAssignee.findOne({
//         where: { booking_id },
//         order: [["createdAt", "DESC"]] // Get latest one if needed
//       });

//       let shouldCreateNew = false;

//       // If no record or new pilot/co-pilot => create new
//       if (
//         !existingAssignee ||
//         existingAssignee.pilot_user_id !== work_assignee.pilot_user_id ||
//         existingAssignee.co_pilot_user_id !== work_assignee.co_pilot_user_id
//       ) {
//         shouldCreateNew = true;
//       }

//       if (shouldCreateNew) {
//         await SprayingWorkAssignee.create({
//           booking_id,
//           drone_id: work_assignee.drone_id,
//           pilot_user_id: work_assignee.pilot_user_id,
//           co_pilot_user_id: work_assignee.co_pilot_user_id,
//           is_pilot_confirm: work_assignee.is_pilot_confirm,
//           is_copilot_confirm: work_assignee.is_copilot_confirm,
//         });
//       } else {
//         // Same pilot/co-pilot — just update confirmation flags
//         await existingAssignee.update({
//           is_pilot_confirm: work_assignee.is_pilot_confirm,
//           is_copilot_confirm: work_assignee.is_copilot_confirm,
//         });
//       }
//     }

//     // ✅ Replace daily_logs — uses pilot/co-pilot from daily_logs itself
//     if (daily_logs && daily_logs.length > 0) {
//       // Delete existing logs for this booking
//       await SprayingDailyLogs.destroy({ where: { spraying_work_id: booking_id } });

//       // Insert new logs
//       for (const log of daily_logs) {
//         if (!log.working_date) continue;

//         await SprayingDailyLogs.create({
//           spraying_work_id: booking_id,
//           working_date: log.working_date,
//           land_image_original_name: log.land_image_original_name,
//           land_image_new_name: log.land_image_new_name,
//           land_image_url: log.land_image_url,
//           is_verified: log.is_verified,
//           verified_on: log.verified_on,
//           verified_by: log.verified_by,
//           verification_comment: log.verification_comment,
//           pilot_user_id: log.pilot_user_id || null,       // ✅ from daily log
//           co_pilot_user_id: log.co_pilot_user_id || null, // ✅ from daily log
//         });
//       }
//     }

//     // ✅ Final response
//     res.status(200).json({
//       message: "Order, address, work assignee, and daily logs updated successfully",
//     });

//   } catch (error) {
//     console.error("Error updating order:", error);
//     res.status(500).json({ error: error.message });
//   }
// };

// export const updateOrder = async (req, res) => {
//   try {
//     const {
//       booking_id,       // Required
//       order_status,
//       is_paid,
//       transcation_id,
//       num_of_days,
//       crop_type_id,
//       land_in_acers,
//       price,
//       tax,
//       total_price,
//       cupon_id,
//       discount,
//       user_id,
//       address,          // Optional object
//       work_assignee,
//       daily_logs        // Optional array
//     } = req.body;

//     if (!booking_id) {
//       return res.status(400).json({ message: "booking_id is required" });
//     }

//     // Find order
//     const order = await SprayingOrder.findOne({ where: { booking_id } });
//     if (!order) return res.status(404).json({ message: "Order not found" });

//     // ✅ Determine start_date and end_date from daily_logs
//     let calculatedStartDate = order.start_date;
//     let calculatedEndDate = order.end_date;

//     if (daily_logs && daily_logs.length > 0) {
//       const dates = daily_logs
//         .filter(log => log.working_date)
//         .map(log => new Date(log.working_date));

//       if (dates.length > 0) {
//         calculatedStartDate = new Date(Math.min(...dates));
//         calculatedEndDate = new Date(Math.max(...dates));
//       }
//     }

//     // ✅ Update order with calculated start/end
//     await order.update({
//       start_date: calculatedStartDate,
//       end_date: calculatedEndDate,
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

//     // ✅ Update or recreate address
//     if (address) {
//       const existingAddress = await SprayingOrderAddress.findOne({ where: { order_id: booking_id } });
//       if (existingAddress) await existingAddress.destroy();

//       await SprayingOrderAddress.create({
//         order_id: booking_id,
//         state: address.state,
//         district: address.district,
//         block: address.block,
//         village: address.village,
//         address1: address.address1,
//         address2: address.address2,
//       });
//     }

//     // ✅ Handle work_assignee (create new when pilot/copilot changes)
//     if (work_assignee) {
//       const existingAssignee = await SprayingWorkAssignee.findOne({
//         where: { booking_id },
//         order: [["createdAt", "DESC"]]
//       });

//       let shouldCreateNew = false;

//       if (
//         !existingAssignee ||
//         existingAssignee.pilot_user_id !== work_assignee.pilot_user_id ||
//         existingAssignee.co_pilot_user_id !== work_assignee.co_pilot_user_id
//       ) {
//         shouldCreateNew = true;
//       }

//       if (shouldCreateNew) {
//         await SprayingWorkAssignee.create({
//           booking_id,
//           drone_id: work_assignee.drone_id,
//           pilot_user_id: work_assignee.pilot_user_id,
//           co_pilot_user_id: work_assignee.co_pilot_user_id,
//           is_pilot_confirm: work_assignee.is_pilot_confirm,
//           is_copilot_confirm: work_assignee.is_copilot_confirm,
//         });
//       } else {
//         await existingAssignee.update({
//           is_pilot_confirm: work_assignee.is_pilot_confirm,
//           is_copilot_confirm: work_assignee.is_copilot_confirm,
//         });
//       }
//     }

//     // ✅ Replace daily_logs — uses pilot/co-pilot from daily_logs itself
//     if (daily_logs && daily_logs.length > 0) {
//       // Delete existing logs for this booking
//       await SprayingDailyLogs.destroy({ where: { spraying_work_id: booking_id } });

//       // Insert new logs
//       for (const log of daily_logs) {
//         if (!log.working_date) continue;

//         await SprayingDailyLogs.create({
//           spraying_work_id: booking_id,
//           working_date: log.working_date,
//           land_image_original_name: log.land_image_original_name,
//           land_image_new_name: log.land_image_new_name,
//           land_image_url: log.land_image_url,
//           is_verified: log.is_verified,
//           verified_on: log.verified_on,
//           verified_by: log.verified_by,
//           verification_comment: log.verification_comment,
//           pilot_user_id: log.pilot_user_id || null,       // ✅ from daily log
//           co_pilot_user_id: log.co_pilot_user_id || null, // ✅ from daily log
//         });
//       }
//     }

//     // ✅ Final response
//     res.status(200).json({
//       message: "Order, address, work assignee, and daily logs updated successfully",
//       updated_start_date: calculatedStartDate,
//       updated_end_date: calculatedEndDate
//     });

//   } catch (error) {
//     console.error("Error updating order:", error);
//     res.status(500).json({ error: error.message });
//   }
// };


// export const updateOrder = async (req, res) => {
//   try {
//     const {
//       booking_id,       // Required
//       order_status,
//       is_paid,
//       transcation_id,
//       num_of_days,
//       crop_type_id,
//       land_in_acers,
//       price,
//       tax,
//       total_price,
//       cupon_id,
//       discount,
//       user_id,
//       address,          // Optional object
//       daily_logs        // Optional array
//     } = req.body;

//     if (!booking_id) {
//       return res.status(400).json({ message: "booking_id is required" });
//     }

//     // ✅ Find order
//     const order = await SprayingOrder.findOne({ where: { booking_id } });
//     if (!order) return res.status(404).json({ message: "Order not found" });

//     // ✅ Determine start_date and end_date from daily_logs
//     let calculatedStartDate = order.start_date;
//     let calculatedEndDate = order.end_date;

//     if (daily_logs && daily_logs.length > 0) {
//       const dates = daily_logs
//         .filter(log => log.working_date)
//         .map(log => new Date(log.working_date));

//       if (dates.length > 0) {
//         calculatedStartDate = new Date(Math.min(...dates));
//         calculatedEndDate = new Date(Math.max(...dates));
//       }
//     }

//     // ✅ Update order with calculated start/end
//     await order.update({
//       start_date: calculatedStartDate,
//       end_date: calculatedEndDate,
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

//     // ✅ Update or recreate address
//     if (address) {
//       const existingAddress = await SprayingOrderAddress.findOne({ where: { order_id: booking_id } });
//       if (existingAddress) await existingAddress.destroy();

//       await SprayingOrderAddress.create({
//         order_id: booking_id,
//         state: address.state,
//         district: address.district,
//         block: address.block,
//         village: address.village,
//         address1: address.address1,
//         address2: address.address2,
//       });
//     }

//     // ✅ Determine pilot and co-pilot from daily_logs dynamically
//  // ✅ Determine pilot and co-pilot from daily_logs dynamically
// let pilot_user_id = null;
// let co_pilot_user_id = null;
// let drone_id = null;

// if (daily_logs && daily_logs.length > 0) {
//   for (const log of daily_logs) {
//     if (log.pilot_user_id && !pilot_user_id) pilot_user_id = log.pilot_user_id;
//     if (log.co_pilot_user_id && !co_pilot_user_id) co_pilot_user_id = log.co_pilot_user_id;
//     if (log.drone_id && !drone_id) drone_id = log.drone_id;
//     if (pilot_user_id && co_pilot_user_id && drone_id) break; // stop once all found
//   }
// }

// // ✅ Handle work_assignee based on daily_logs (not from body)
// if (pilot_user_id || co_pilot_user_id) {
//   const existingAssignee = await SprayingWorkAssignee.findOne({
//     where: { booking_id },
//     order: [["createdAt", "DESC"]],
//   });

//   // 🔥 Always delete if exists, then create new one
//   if (existingAssignee) {
//     await existingAssignee.destroy();
//   }

//   await SprayingWorkAssignee.create({
//     booking_id,
//     drone_id: drone_id || existingAssignee?.drone_id || null,
//     pilot_user_id,
//     co_pilot_user_id,
//     is_pilot_confirm: false,
//     is_copilot_confirm: false,
//   });
// }

//     // ✅ Replace daily_logs — uses pilot/co-pilot from daily_logs itself
//     if (daily_logs && daily_logs.length > 0) {
//       // Delete existing logs for this booking
//       await SprayingDailyLogs.destroy({ where: { spraying_work_id: booking_id } });

//       // Insert new logs
//       for (const log of daily_logs) {
//         if (!log.working_date) continue;

//         await SprayingDailyLogs.create({
//           spraying_work_id: booking_id,
//           working_date: log.working_date,
//           land_image_original_name: log.land_image_original_name,
//           land_image_new_name: log.land_image_new_name,
//           land_image_url: log.land_image_url,
//           is_verified: log.is_verified,
//           verified_on: log.verified_on,
//           verified_by: log.verified_by,
//           verification_comment: log.verification_comment,
//           pilot_user_id: log.pilot_user_id || null,
//           co_pilot_user_id: log.co_pilot_user_id || null,
//           drone_id: log.drone_id || null,
//         });
//       }
//     }

//     // ✅ Final response
//     res.status(200).json({
//       message: "Order, address, work assignee (from daily logs), and daily logs updated successfully",
//       updated_start_date: calculatedStartDate,
//       updated_end_date: calculatedEndDate,
//     });

//   } catch (error) {
//     console.error("Error updating order:", error);
//     res.status(500).json({ error: error.message });
//   }
// };

export const updateOrder = async (req, res) => {
  try {
    const {
      booking_id,
      order_status,
      is_paid,
      transcation_id,
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
      daily_logs
    } = req.body;

    if (!booking_id) {
      return res.status(400).json({ message: "booking_id is required" });
    }

    // ✅ Find order
    const order = await SprayingOrder.findOne({
      where: { booking_id },
      attributes: ["booking_id", "start_date", "end_date"],
    });
    if (!order) return res.status(404).json({ message: "Order not found" });

    // ✅ Calculate start and end dates
    let calculatedStartDate = order.start_date;
    let calculatedEndDate = order.end_date;

    if (daily_logs?.length > 0) {
      const validDates = daily_logs
        .filter(log => log.working_date)
        .map(log => new Date(log.working_date));
      if (validDates.length > 0) {
        calculatedStartDate = new Date(Math.min(...validDates));
        calculatedEndDate = new Date(Math.max(...validDates));
      }
    }

    // ✅ Update Order
    await order.update({
      start_date: calculatedStartDate,
      end_date: calculatedEndDate,
      num_of_days: num_of_days ?? order.num_of_days,
      crop_type_id: crop_type_id ?? order.crop_type_id,
      land_in_acers: land_in_acers ?? order.land_in_acers,
      price: price ?? order.price,
      tax: tax ?? order.tax,
      total_price: total_price ?? order.total_price,
      cupon_id: cupon_id ?? order.cupon_id,
      discount: discount ?? order.discount,
      user_id: user_id ?? order.user_id,
      is_paid: is_paid ?? order.is_paid,
      transcation_id: transcation_id ?? order.transcation_id,
    });

    if (order_status && order_status !== order.order_status) {
      await updateOrderStatus(booking_id, order_status, "Status updated by Booking Controller");
    }

    // ✅ Update or recreate address
    if (address) {
      const existingAddress = await SprayingOrderAddress.findOne({
        where: { order_id: booking_id },
      });
      if (existingAddress) await existingAddress.destroy();

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

    // ✅ Handle work_assignees dynamically (for all unique pilot_user_id)
    if (daily_logs?.length > 0) {
      // Delete old assignees for this booking
      await SprayingWorkAssignee.destroy({ where: { booking_id } });

      // Extract unique pilot_user_ids
      const uniquePilotIds = [
        ...new Set(daily_logs.map(log => log.pilot_user_id).filter(Boolean))
      ];

      // Create assignees for each unique pilot_user_id
      for (const pilotId of uniquePilotIds) {
        // Find any log for this pilot to extract related info
        const logForPilot = daily_logs.find(log => log.pilot_user_id === pilotId);

        await SprayingWorkAssignee.create({
          booking_id,
          drone_id: logForPilot?.drone_id || null,
          pilot_user_id: pilotId,
          co_pilot_user_id: logForPilot?.co_pilot_user_id || null,
          is_pilot_confirm: false,
          is_copilot_confirm: false,
        });
      }
    }

    // ✅ Replace daily_logs
    if (daily_logs?.length > 0) {
      await SprayingDailyLogs.destroy({ where: { spraying_work_id: booking_id } });

      const logsToInsert = daily_logs
        .filter(log => log.working_date)
        .map(log => ({
          spraying_work_id: booking_id,
          working_date: log.working_date,
          land_image_original_name: log.land_image_original_name,
          land_image_new_name: log.land_image_new_name,
          land_image_url: log.land_image_url,
          is_verified: log.is_verified,
          verified_on: log.verified_on,
          verified_by: log.verified_by,
          verification_comment: log.verification_comment,
          pilot_user_id: log.pilot_user_id || null,
          co_pilot_user_id: log.co_pilot_user_id || null,
          drone_id: log.drone_id || null,
        }));

      // Bulk insert for performance
      await SprayingDailyLogs.bulkCreate(logsToInsert, { validate: false });
    }

    // ✅ Final Response
    res.status(200).json({
      message: "Order, address, work assignees (for unique pilots), and daily logs updated successfully",
      updated_start_date: calculatedStartDate,
      updated_end_date: calculatedEndDate,
    });

  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ error: error.message });
  }
};





export const createComment = async (req, res) => {
  try {
    const user_id = req.user.id; // from auth middleware
    const { comment_type, comment, booking_id, working_date } = req.body;

    // ✅ Validate booking_id and comment
    if (!booking_id || !comment) {
      return res.status(400).json({ message: "booking_id and comment are required" });
    }

    // ✅ Find spraying_order_id from booking_id
    const order = await SprayingOrder.findOne({ where: { booking_id } });
    if (!order) {
      return res.status(404).json({ message: "No Spraying Order found for the given booking_id" });
    }

    // ✅ Fetch user's name from UserProfile
    // const userProfile = await UserProfile.findOne({ where: { user_id } });
    // let createdByName = "Unknown User";
    // if (userProfile) {
    //   createdByName = `${userProfile.first_name}${userProfile.last_name ? " " + userProfile.last_name : ""}`;
    // }

    // ✅ Determine working_date and created_on
    const currentTimestamp = new Date();
    const finalWorkingDate = working_date ? new Date(working_date) : currentTimestamp;

    // ✅ Create new comment
    const newComment = await SprayingOrderComment.create({
      user_id,
      comment_type,
      comment,
      spraying_order_id: order.booking_id,
      working_date: finalWorkingDate,
      created_by: user_id,
      created_on: currentTimestamp,
    });

    res.status(201).json({
      message: "Comment added successfully",
      data: newComment,
    });

  } catch (error) {
    console.error("Error creating comment:", error);
    res.status(500).json({
      message: "Failed to create comment",
      error: error.message,
    });
  }
};



export const getAllComments = async (req, res) => {
  try {
    const comments = await SprayingOrderComment.findAll();
    res.status(200).json(comments);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch comments", error: error.message });
  }
};

export const getCommentById = async (req, res) => {
  try {
    const { id } = req.params;
    const comment = await SprayingOrderComment.findByPk(id);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    res.status(200).json(comment);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch comment", error: error.message });
  }
};

export const updateComment = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { id } = req.params;
    const { comment_type, comment, working_date } = req.body;

    // Find user name from UserProfile
    const userProfile = await UserProfile.findOne({ where: { user_id } });
    if (!userProfile) {
      return res.status(404).json({ message: "User profile not found" });
    }

    const modified_by_name = userProfile.full_name;

    // Find the existing comment
    const existingComment = await SprayingOrderComment.findByPk(id);
    if (!existingComment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Update the comment with modified_on timestamp
    await existingComment.update({
      comment_type,
      comment,
      working_date,
      modified_by: modified_by_name, // store name instead of ID
      modified_on: new Date(),       // add modified_on date
    });

    res.status(200).json({
      message: "Comment updated successfully",
      data: existingComment,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update comment",
      error: error.message,
    });
  }
};


export const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const comment = await SprayingOrderComment.findByPk(id);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    await comment.destroy();
    res.status(200).json({ message: "Comment deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete comment", error: error.message });
  }
};






export const filterComments = async (req, res) => {
  try {
    const {
      booking_id,
      working_date,
      comment_type,
      working_day_start_date,
      working_day_end_date,
      created_on_start_date,
      created_on_end_date,
      modified_on_start_date,
      modified_on_end_date,
      page = 1,
      limit = 10,
    } = req.body;

    const offset = (page - 1) * limit;
    const where = {};

    // ✅ 1. Filter by booking_id → find related spraying_order_id
    if (booking_id) {
      const order = await SprayingOrder.findOne({
        where: { booking_id },
        attributes: ["booking_id"],
      });

      if (!order) {
        return res
          .status(404)
          .json({ message: "No Spraying Order found for the given booking_id" });
      }

      where.spraying_order_id = order.booking_id;
    }

    // ✅ 2. Filter by exact working_date (single day match)
    if (working_date) {
      where.working_date = working_date;
    }

    // ✅ 3. Filter by comment_type (case-insensitive)
    if (comment_type) {
      where.comment_type = { [Op.iLike]: `%${comment_type}%` };
    }

    // ✅ 4. Filter by Working Day Range
    if (working_day_start_date && working_day_end_date) {
      where.working_date = {
        [Op.between]: [
          new Date(working_day_start_date),
          new Date(working_day_end_date),
        ],
      };
    }

    // ✅ 5. Filter by Created On Range
    if (created_on_start_date && created_on_end_date) {
      where.created_on = {
        [Op.between]: [
          new Date(created_on_start_date),
          new Date(created_on_end_date),
        ],
      };
    }

    // ✅ 6. Filter by Modified On Range
    if (modified_on_start_date && modified_on_end_date) {
      where.modified_on = {
        [Op.between]: [
          new Date(modified_on_start_date),
          new Date(modified_on_end_date),
        ],
      };
    }

    // ✅ 7. Fetch filtered data with pagination
    const { count, rows } = await SprayingOrderComment.findAndCountAll({
      where,
      offset,
      limit: parseInt(limit),
      order: [["created_on", "DESC"]],
    });

    // ✅ 8. Return paginated response
    res.status(200).json({
      message: "Comments filtered successfully",
      totalRecords: count,
      currentPage: parseInt(page),
      totalPages: Math.ceil(count / limit),
      data: rows,
    });
  } catch (error) {
    console.error("Error filtering comments:", error);
    res.status(500).json({
      message: "Failed to filter comments",
      error: error.message,
    });
  }
};




export const SprayingDailyLogsFilter = async (req, res) => {
  try {
    const body = req.body;

    let whereConditions = {};

    /* -------------------------------------------------
       BOOKING ID (independent)
    -------------------------------------------------- */
    if (body.booking_id) {
      whereConditions.spraying_work_id = body.booking_id;
    }

    /* -------------------------------------------------
       DRONE IDS (independent ✅)
    -------------------------------------------------- */
    if (Array.isArray(body.drone_ids) && body.drone_ids.length > 0) {
      whereConditions.drone_id = {
        [Op.in]: body.drone_ids
      };
    }

    /* -------------------------------------------------
       WORKING DATES (specific days)
    -------------------------------------------------- */
    if (Array.isArray(body.working_dates) && body.working_dates.length > 0) {
      whereConditions.working_date = {
        [Op.in]: body.working_dates
      };
    }

    /* -------------------------------------------------
       WORKING DATE RANGE
       (only applied if working_dates NOT provided)
    -------------------------------------------------- */
    if (
      !body.working_dates &&
      (body.working_start_date || body.working_end_date)
    ) {
      whereConditions.working_date = {
        ...(body.working_start_date && { [Op.gte]: body.working_start_date }),
        ...(body.working_end_date && { [Op.lte]: body.working_end_date }),
      };
    }

    /* -------------------------------------------------
       PILOT IDS
    -------------------------------------------------- */
    if (Array.isArray(body.pilot_ids) && body.pilot_ids.length > 0) {
      whereConditions.pilot_user_id = {
        [Op.in]: body.pilot_ids
      };
    }

    /* -------------------------------------------------
       CO-PILOT IDS
    -------------------------------------------------- */
    if (Array.isArray(body.copilot_ids) && body.copilot_ids.length > 0) {
      whereConditions.co_pilot_user_id = {
        [Op.in]: body.copilot_ids
      };
    }

    /* -------------------------------------------------
       VERIFIED FLAG
    -------------------------------------------------- */
    if (typeof body.is_verified === "boolean") {
      whereConditions.is_verified = body.is_verified;
    }

    /* -------------------------------------------------
       VERIFIED BY NAME (independent)
    -------------------------------------------------- */
    if (body.verified_by_name) {
      const users = await UserProfile.findAll({
        where: {
          [Op.or]: [
            { first_name: { [Op.iLike]: `%${body.verified_by_name}%` } },
            { last_name: { [Op.iLike]: `%${body.verified_by_name}%` } }
          ]
        },
        attributes: ["user_id"],
        raw: true
      });

      const verifierIds = users.map(u => u.user_id);

      if (verifierIds.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          data: []
        });
      }

      whereConditions.verified_by = {
        [Op.in]: verifierIds
      };
    }

    /* -------------------------------------------------
       MODIFIED DATE RANGE
    -------------------------------------------------- */
    if (body.modified_on_start_date || body.modified_on_end_date) {
      whereConditions.modified_on = {
        ...(body.modified_on_start_date && { [Op.gte]: body.modified_on_start_date }),
        ...(body.modified_on_end_date && { [Op.lte]: body.modified_on_end_date }),
      };
    }

    /* -------------------------------------------------
       FINAL QUERY
    -------------------------------------------------- */
    const logs = await SprayingDailyLogs.findAll({
      where: whereConditions,
      order: [["working_date", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      count: logs.length,
      data: logs
    });

  } catch (error) {
    console.error("SprayingDailyLogsFilter error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};




export const getAllCropsForSelect = async (req, res) => {
  try {
    const crops = await MasterCrop.findAll({
      attributes: ["id", "name","price_per_acre"],   // 🔥 only what frontend needs
      order: [["name", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      data: crops,
    });
  } catch (error) {
    console.error("GET CROPS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch crops",
    });
  }
};


export const getOrderById = async (req, res) => {
  try {
    const { booking_id } = req.params;

    // ♻️ Helper to remove unwanted fields
    const cleanData = (data) => {
      if (!data) return null;
      const { id, createdAt, updatedAt, created_by, modified_by, ...rest } =
        data.dataValues || data;
      return rest;
    };

    // Helper to get full name from UserProfile by user_id
    const getUserName = async (user_id) => {
      if (!user_id) return null;
      const user = await UserProfile.findOne({ where: { user_id } });
      return user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : null;
    };

    // 1️⃣ Fetch the main order
    const order = await SprayingOrder.findOne({ where: { booking_id } });
    if (!order) return res.status(404).json({ message: "Order not found" });

    // 2️⃣ Fetch the address linked to this order
    const address = await SprayingOrderAddress.findOne({
      where: { order_id: booking_id },
    });

    let fullAddress = null;
    if (address) {
      const [state, district, block] = await Promise.all([
        MasterState.findOne({ where: { id: address.state } }),
        MasterDistrict.findOne({ where: { id: address.district } }),
        MasterBlock.findOne({ where: { id: address.block } }),
      ]);

      fullAddress = {
        ...cleanData(address),
        state_name: state ? state.state_name : null,
        district_name: district ? district.district_name : null,
        block_name: block ? block.block_name : null,
      };
    }

    // 3️⃣ Fetch Daily Logs
    const dailyLogs = await SprayingDailyLogs.findAll({
      where: { spraying_work_id: booking_id },
    });

    // Add pilot and co-pilot names for each daily log
    const cleanDailyLogs = await Promise.all(
      dailyLogs.map(async (log) => {
        const data = cleanData(log);

        const pilot_name = await getUserName(data.pilot_user_id);
        const co_pilot_name = await getUserName(data.co_pilot_user_id);

        const { pilot_user_id, co_pilot_user_id, ...rest } = data;
        return {
          ...rest,
          pilot_name,
          co_pilot_name,
        };
      })
    );

    // 4️⃣ Fetch Comments
    const comments = await SprayingOrderComment.findAll({
      where: { spraying_order_id: booking_id },
    });

    // 5️⃣ Fetch Work Assignee
    // 🧩 Fetch all assignees for this booking
    const assigneeRecords = await SprayingWorkAssignee.findAll({
      where: { booking_id },
    });

    let cleanAssignee = [];

    if (assigneeRecords && assigneeRecords.length > 0) {
      for (const assignee of assigneeRecords) {
        const data = cleanData(assignee);

        // Get pilot, co-pilot, and drone name for each record
        const [pilot_name, co_pilot_name, drone] = await Promise.all([
          getUserName(data.pilot_user_id),
          getUserName(data.co_pilot_user_id),
          Drone1.findOne({ where: { id: data.drone_id } }),
        ]);

        const { pilot_user_id, co_pilot_user_id, drone_id, ...rest } = data;

        cleanAssignee.push({
          ...rest,
          pilot_name,
          co_pilot_name,
          drone_name:
            drone?.drone_name || drone?.name || drone?.droneName || null,
        });
      }
    } else {
      cleanAssignee = []; // Return empty array if no assignee found
    }

    // 6️⃣ Fetch user name using created_by
    const createdByUser = await UserProfile.findOne({
      where: { user_id: order.created_by },
    });
    const createdByName = createdByUser
      ? `${createdByUser.first_name || ""} ${createdByUser.last_name || ""}`.trim()
      : null;

    // Get Modified By user details
    const modifiedByUser = await UserProfile.findOne({
      where: { user_id: order.modified_by },
    });
    const modifiedByName = modifiedByUser
      ? `${modifiedByUser.first_name || ""} ${modifiedByUser.last_name || ""}`.trim()
      : null;

    // 7️⃣ Construct final response
    const fullOrder = {
      ...cleanData(order),
      created_by_name: createdByName,
      modified_by_name: modifiedByName,
      address: fullAddress,
      daily_logs: cleanDailyLogs,
      comments: comments.map(cleanData),
      assignee: cleanAssignee,
    };

    res.status(200).json(fullOrder);
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ error: error.message });
  }
};


export const getOrdersByUserId = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { order_status } = req.query;

    if (!user_id) {
      return res.status(400).json({ message: "user_id is required" });
    }

    // ♻️ Helper
    const cleanData = (data) => {
      if (!data) return null;
      const { id, createdAt, updatedAt, created_by, modified_by, ...rest } =
        data.dataValues || data;
      return rest;
    };

    // 1️⃣ Orders CREATED by user or assigned to user (as farmer)
    const createdOrders = await SprayingOrder.findAll({
      where: {
        [Op.or]: [
          { user_id: user_id },
          { created_by: user_id },
        ],
      },
    });

    // 2️⃣ Orders where user is PILOT / CO-PILOT (Assignee)
    const assigneeOrders = await SprayingWorkAssignee.findAll({
      where: {
        [Op.or]: [
          { pilot_user_id: user_id },
          { co_pilot_user_id: user_id },
        ],
      },
      attributes: ["booking_id"],
    });

    // 3️⃣ Orders where user appears in DAILY LOGS
    const dailyLogOrders = await SprayingDailyLogs.findAll({
      where: {
        [Op.or]: [
          { pilot_user_id: user_id },
          { co_pilot_user_id: user_id },
        ],
      },
      attributes: ["spraying_work_id"],
    });

    // 🧠 Collect unique booking_ids
    const bookingIds = new Set([
      ...createdOrders.map(o => o.booking_id),
      ...assigneeOrders.map(a => a.booking_id),
      ...dailyLogOrders.map(d => d.spraying_work_id),
    ]);

    if (bookingIds.size === 0) {
      return res.status(200).json([]);
    }

    // Prepare where clause with optional status filtering
    const whereClause = { booking_id: [...bookingIds] };
    if (order_status) {
      const statuses = order_status.split(',').map(s => s.trim());
      whereClause.order_status = { [Op.in]: statuses };
    }

    // 4️⃣ Fetch full orders
    const orders = await SprayingOrder.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
    });

    // Helper to get user name
    const getUserName = async (uId) => {
      if (!uId) return null;
      const user = await UserProfile.findOne({ where: { user_id: uId } });
      return user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : null;
    };

    // 5️⃣ Enrich each order with names and nested details
    const enrichedOrders = await Promise.all(
      orders.map(async (o) => {
        const orderData = cleanData(o);
        const bookingId = orderData.booking_id;

        // Fetch Crop Name
        let crop_name = null;
        if (orderData.crop_type_id) {
          const crop = await MasterCrop.findOne({ where: { id: orderData.crop_type_id } });
          crop_name = crop ? crop.name : null;
        }

        // Fetch Address
        const address = await SprayingOrderAddress.findOne({ where: { order_id: bookingId } });
        let fullAddress = null;
        if (address) {
          const [state, district, block] = await Promise.all([
            MasterState.findOne({ where: { id: address.state } }),
            MasterDistrict.findOne({ where: { id: address.district } }),
            MasterBlock.findOne({ where: { id: address.block } }),
          ]);
          fullAddress = {
            ...cleanData(address),
            state_name: state ? state.state_name : null,
            district_name: district ? district.district_name : null,
            block_name: block ? block.block_name : null,
          };
        }

        // Fetch Assignees
        const assigneeRecords = await SprayingWorkAssignee.findAll({ where: { booking_id: bookingId } });
        const cleanAssignees = await Promise.all(
          assigneeRecords.map(async (assignee) => {
            const aData = cleanData(assignee);
            const [pilot_name, co_pilot_name, drone] = await Promise.all([
              getUserName(aData.pilot_user_id),
              getUserName(aData.co_pilot_user_id),
              Drone1.findOne({ where: { id: aData.drone_id } }),
            ]);
            const { pilot_user_id, co_pilot_user_id, drone_id, ...rest } = aData;
            return {
              ...rest,
              pilot_name,
              co_pilot_name,
              drone_name: drone?.drone_name || drone?.name || drone?.droneName || null,
            };
          })
        );

        // Created by User Name
        const created_by_name = await getUserName(orderData.created_by) || await getUserName(orderData.user_id);

        const { crop_type_id, ...restOrderData } = orderData;
        return {
          ...restOrderData,
          crop_name,
          created_by_name,
          address: fullAddress,
          assignees: cleanAssignees,
        };
      })
    );

    res.status(200).json(enrichedOrders);

  } catch (error) {
    console.error("Error fetching orders by user:", error);
    res.status(500).json({ error: error.message });
  }
};


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

    // ---------------- BASE WHERE ----------------
    const orderWhere = {};
    if (filters.booking_id) orderWhere.booking_id = filters.booking_id;
    if (filters.is_paid !== undefined) orderWhere.is_paid = filters.is_paid;
    if (filters.is_active !== undefined)
      orderWhere.is_active = filters.is_active;

    // ---------------- USER-ID SCOPE FILTER (NEW) ----------------
    let effectiveUserId = filters.user_id || req.user?.id;
    if (!effectiveUserId && req.headers?.authorization && req.headers.authorization.startsWith("Bearer ")) {
      try {
        const token = req.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded?.id) {
          if (decoded.user_type === 1 || decoded.user_type === 3) {
            effectiveUserId = decoded.id;
          } else if (decoded.user_type === 2) {
            // Admin user: do not scope automatically unless filters.user_id provided
          } else {
            const userRec = await User.findOne({ where: { id: decoded.id }, attributes: ["id", "user_type"] });
            if (userRec && userRec.user_type !== 2) {
              effectiveUserId = userRec.id;
            }
          }
        }
      } catch (e) { /* ignore */ }
    }

    if (effectiveUserId) {
      // 1️⃣ Orders created by user or where user is farmer
      const createdOrders = await SprayingOrder.findAll({
        where: {
          [Op.or]: [
            { user_id: effectiveUserId },
            { created_by: effectiveUserId },
          ],
        },
        attributes: ["booking_id"],
      });

      // 2️⃣ Orders where user is pilot / co-pilot (assignee)
      const assigneeOrders = await SprayingWorkAssignee.findAll({
        where: {
          [Op.or]: [
            { pilot_user_id: effectiveUserId },
            { co_pilot_user_id: effectiveUserId },
          ],
        },
        attributes: ["booking_id"],
      });

      // 3️⃣ Orders where user appears in daily logs
      const dailyLogOrders = await SprayingDailyLogs.findAll({
        where: {
          [Op.or]: [
            { pilot_user_id: effectiveUserId },
            { co_pilot_user_id: effectiveUserId },
          ],
        },
        attributes: ["spraying_work_id"],
      });

      const bookingIds = new Set([
        ...createdOrders.map(o => o.booking_id),
        ...assigneeOrders.map(a => a.booking_id),
        ...dailyLogOrders.map(d => d.spraying_work_id),
      ]);

      if (bookingIds.size === 0) {
        return res.status(200).json({
          total: 0,
          currentPage: page,
          totalPages: 0,
          orders: [],
        });
      }

      orderWhere.booking_id = [...bookingIds];
    }

    // ---------------- FETCH ORDERS ----------------
    const orders = await SprayingOrder.findAll({
      where: orderWhere,
      order: [[orderBy, orderType]],
    });

    const filteredOrders = [];

    for (const order of orders) {
      const orderData = cleanData(order);

      // ---------------- ADDRESS ----------------
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

      // ---------------- DAILY LOGS ----------------
      const dailyLogs = await SprayingDailyLogs.findAll({
        where: { spraying_work_id: orderData.booking_id },
      });

      const cleanDailyLogs = [];
      for (const log of dailyLogs) {
        const logData = cleanData(log);
        cleanDailyLogs.push({
          ...logData,
          pilot_name: await getUserName(logData.pilot_user_id),
          co_pilot_name: await getUserName(logData.co_pilot_user_id),
          verifiedByName: await getUserName(logData.verified_by),
        });
      }

      // ---------------- COMMENTS ----------------
      const comments = await SprayingOrderComment.findAll({
        where: { spraying_order_id: orderData.booking_id },
      });

      // ---------------- ASSIGNEE ----------------
      const assignees = await SprayingWorkAssignee.findAll({
        where: { booking_id: orderData.booking_id },
      });

      const cleanAssignee = [];
      for (const a of assignees) {
        const data = cleanData(a);
        const drone = await Drone1.findOne({ where: { id: data.drone_id } });

        cleanAssignee.push({
          ...data,
          pilot_name: await getUserName(data.pilot_user_id),
          co_pilot_name: await getUserName(data.co_pilot_user_id),
          drone_name:
            drone?.drone_name || drone?.name || drone?.droneName || null,
        });
      }

      const enriched = {
        ...orderData,
        created_by_name: await getUserName(orderData.created_by),
        modified_by_name: await getUserName(orderData.modified_by),
        address: fullAddress,
        daily_logs: cleanDailyLogs,
        comments: comments.map(cleanData),
        assignee: cleanAssignee,
      };

      // ---------------- APPLY EXTRA FILTERS ----------------
      let includeOrder = true;

      if (filters.order_status &&
        !matchInsensitive(orderData.order_status, filters.order_status))
        includeOrder = false;

      if (filters.state &&
        !matchInsensitive(enriched.address?.state_name, filters.state))
        includeOrder = false;

      if (filters.pilot_name &&
        !cleanDailyLogs.some(dl =>
          matchInsensitive(dl.pilot_name, filters.pilot_name)))
        includeOrder = false;

      if (includeOrder) filteredOrders.push(enriched);
    }

    // ---------------- PAGINATION ----------------
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


export const getAvailablePilotsForDates = async (req, res) => {
  try {
    const { booking_id } = req.body;
 
    if (!booking_id) {
      return res.status(400).json({ message: "booking_id is required" });
    }
 
    /* ── 1. Booking ─────────────────────────────────────────── */
    const booking = await SprayingOrder.findOne({
      where: { booking_id },
      attributes: ["booking_id", "start_date", "end_date", "num_of_days"],
      raw: true,
    });
 
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
 
    /* ── 2. Booking address ─────────────────────────────────── */
    const bookingAddress = await SprayingOrderAddress.findOne({
      where: { order_id: booking_id },
      attributes: ["state", "district", "block", "village"],
      raw: true,
    });
 
    let bookingAddressWithNames = null;
    let localUsers = [];
    let locationFiltered = false;
 
    if (bookingAddress) {
      locationFiltered = true;
 
      /* ── 3. Resolve location names ──────────────────────── */
      const [stateObj, districtObj, blockObj] = await Promise.all([
        MasterState.findOne({ where: { id: bookingAddress.state }, attributes: ["id", "state_name"], raw: true }),
        MasterDistrict.findOne({ where: { id: bookingAddress.district }, attributes: ["id", "district_name"], raw: true }),
        MasterBlock.findOne({ where: { id: bookingAddress.block }, attributes: ["id", "block_name"], raw: true }),
      ]);
 
      bookingAddressWithNames = {
        state:         bookingAddress.state,
        district:      bookingAddress.district,
        block:         bookingAddress.block,
        state_name:    stateObj?.state_name    || null,
        district_name: districtObj?.district_name || null,
        block_name:    blockObj?.block_name    || null,
      };
 
      /* ── 4. Find user_ids in same state / district / block ─ */
      const localUserAddresses = await UserAddress.findAll({
        where: {
          state:    bookingAddress.state,
          district: bookingAddress.district,
          block:    bookingAddress.block,
          is_active: true,
        },
        attributes: ["user_id"],
        raw: true,
      });
 
      const localUserIds = [...new Set(localUserAddresses.map(a => a.user_id))];
 
      if (localUserIds.length > 0) {
        /* ── 5. Fetch users + profiles + roles ────────────── */
        const [users, profiles, userRoles] = await Promise.all([
          User.findAll({
            where: { id: localUserIds, is_active: true },
            attributes: ["id", "username", "mobile_number", "email"],
            raw: true,
          }),
          UserProfile.findAll({
            where: { user_id: localUserIds },
            attributes: ["user_id", "first_name", "last_name", "user_image_url"],
            raw: true,
          }),
          UserRole.findAll({
            where: { user_id: localUserIds },
            attributes: ["user_id", "role_id"],
            raw: true,
          }),
        ]);
 
        /* ── 6. Role names via raw query (MasterRole not in db exports) */
        const roleIds = [...new Set(userRoles.map(r => r.role_id).filter(Boolean))];
        let roleMap = {};
 
        if (roleIds.length > 0) {
          const roleRows = await db.sequelize.query(
            `SELECT id, role_name FROM "MASTER_ROLE" WHERE id IN (:roleIds)`,
            { replacements: { roleIds }, type: db.QueryTypes.SELECT }
          );
          roleRows.forEach(r => { roleMap[r.id] = r.role_name; });
        }
 
        /* ── 7. Merge into clean local user objects ─────── */
        localUsers = users.map(u => {
          const profile  = profiles.find(p => p.user_id === u.id) || {};
          const userRole = userRoles.find(r => r.user_id === u.id) || {};
          return {
            id:            u.id,
            username:      u.username      || null,
            mobile_number: u.mobile_number || null,
            email:         u.email         || null,
            full_name:     [profile.first_name, profile.last_name].filter(Boolean).join(" ") || u.username || `User #${u.id}`,
            role_id:       userRole.role_id || null,
            role_name:     roleMap[userRole.role_id] || "—",
            user_image_url: profile.user_image_url || null,
          };
        });
      }
    }
 
    /* ── 8. Date window: booking start_date → +90 days ────────── */
    const windowStart = booking.start_date ? new Date(booking.start_date) : new Date();
    windowStart.setUTCHours(0, 0, 0, 0);
 
    const windowEnd = new Date(windowStart);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 90);
 
    /* ── 9. All daily logs in this window for OTHER bookings ─── */
    const busyLogs = await SprayingDailyLogs.findAll({
      where: {
        working_date:    { [Op.between]: [windowStart, windowEnd] },
        spraying_work_id: { [Op.ne]: booking_id },
        is_active: true,
      },
      attributes: ["working_date", "pilot_user_id", "co_pilot_user_id", "drone_id"],
      raw: true,
    });
 
    /* ── 10. Build per-date busy map ─────────────────────────── */
    /*
      Structure:
      {
        "2025-04-15": {
          busy_pilot_ids:   [1, 3],   ← user IDs assigned as pilot
          busy_copilot_ids: [2],      ← user IDs assigned as co-pilot
          busy_drone_ids:   [5]       ← drone IDs assigned
        }
      }
 
      Frontend uses this to compute:
        isUserBusy(userId, ymd) =
          busy_pilot_ids.includes(userId) || busy_copilot_ids.includes(userId)
      Because a user can't be pilot on booking A and copilot on booking B same day.
    */
    const perDateBusy = {};
 
    const addToBusy = (key, dateKey, val) => {
      if (!perDateBusy[dateKey]) {
        perDateBusy[dateKey] = { busy_pilot_ids: [], busy_copilot_ids: [], busy_drone_ids: [] };
      }
      if (val != null && !perDateBusy[dateKey][key].includes(val)) {
        perDateBusy[dateKey][key].push(val);
      }
    };
 
    busyLogs.forEach(log => {
      const dateKey = new Date(log.working_date).toISOString().split("T")[0];
      addToBusy("busy_pilot_ids",   dateKey, log.pilot_user_id);
      addToBusy("busy_copilot_ids", dateKey, log.co_pilot_user_id);
      addToBusy("busy_drone_ids",   dateKey, log.drone_id);
    });
 
    /* ── 11. Existing daily logs for THIS booking ─────────────── */
    const existingLogs = await SprayingDailyLogs.findAll({
      where: { spraying_work_id: booking_id },
      attributes: ["id", "working_date", "pilot_user_id", "co_pilot_user_id", "drone_id", "is_verified"],
      order: [["working_date", "ASC"]],
      raw: true,
    });
 
    const existingLogsWithYMD = existingLogs.map(l => ({
      ...l,
      working_date_ymd: new Date(l.working_date).toISOString().split("T")[0],
    }));
 
    /* ── 12. All active drones ───────────────────────────────── */
    const allDrones = await Drone1.findAll({
      where: { is_active: true },
      attributes: ["id", "name", "model"],
      raw: true,
    });
 
    /* ── 13. Current assignees for this booking ──────────────── */
    const currentAssignees = await SprayingWorkAssignee.findAll({
      where: { booking_id, is_active: true },
      order: [["created_on", "DESC"]],
      raw: true,
    });
 
    /* ── Response ────────────────────────────────────────────── */
    return res.status(200).json({
      success: true,
      booking: {
        booking_id,
        start_date:  booking.start_date,
        end_date:    booking.end_date,
        num_of_days: booking.num_of_days,
      },
      booking_address:   bookingAddressWithNames,
      location_filtered: locationFiltered,
      local_users:       localUsers,        // pilots/copilots from same area
      all_drones:        allDrones,         // all active drones (no location filter)
      per_date_busy:     perDateBusy,       // busy schedule for next 90 days
      existing_daily_logs:  existingLogsWithYMD,
      current_assignees: currentAssignees,
      window_start: windowStart.toISOString().split("T")[0],
      window_end:   windowEnd.toISOString().split("T")[0],
    });
 
  } catch (error) {
    console.error("Error in getAvailablePilotsForDates:", error);
    return res.status(500).json({ error: error.message });
  }
};

export const getAllOrderStatuses = (req, res) => {
  try {
    const statuses = Object.values(OrderStatusEnum).map(status => ({
      value: status,
      label: status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    }));
    res.status(200).json({ success: true, statuses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};