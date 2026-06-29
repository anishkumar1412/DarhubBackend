/**
 * controllers/droneStatus.controller.js
 *
 * NO SEQUELIZE ASSOCIATIONS ARE USED ANYWHERE IN THIS FILE.
 * Every "join" between DRONE, USER, USER_PROFILE, USER_ROLE, MASTER_ROLE, and
 * SPRAYING_DAILY_LOGS is done manually: each table is queried independently
 * with plain findAll()/findOne() calls (no `include`, no `model:`, no `as:`),
 * and the results are stitched together in plain JavaScript using Maps/objects
 * keyed by id. This avoids relying on Sequelize's association/include system
 * entirely, as requested.
 *
 * Handles:
 *  1. GET   /api/inventory/drone-status        — list all drones with daily_status,
 *                                                manually joined with pilot name from USER table
 *  2. PATCH /api/inventory/drone-status/:id    — pilot toggles their drone active/inactive for today
 *  3. GET   /api/inventory/drone-status/active — drones scheduled to work TODAY
 *                                                (per SPRAYING_DAILY_LOGS.working_date),
 *                                                each tagged with daily_status = true/false
 *                                                (used by the "Drones Active Today" page)
 *  4. POST  /api/inventory/drone-status/reset  — admin-triggered or cron-triggered midnight reset
 *  5. GET   /api/inventory/pilots              — active pilots from USER (role = 'pilot', is_active = true)
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * "Drones Active Today" — business rule
 * ──────────────────────────────────────────────────────────────────────────────
 * A drone shows up on this page ONLY if it has a SPRAYING_DAILY_LOGS row whose
 * working_date falls within TODAY (00:00:00 → 23:59:59, server-local date).
 * That log table is the source of truth for "which drone has work today".
 *
 * Once we know which drones have work today, we look at that SAME drone's
 * DRONE.daily_status column (the boolean the pilot toggles each morning) to
 * decide whether to label it "Active" or "Inactive":
 *
 *   daily_status === true   → label: "Active"    (pilot confirmed drone is up)
 *   daily_status === false  → label: "Inactive"  (drone has work today, but pilot
 *                                                  has NOT yet marked it active)
 *
 * Drones with NO daily-log entry for today are NOT returned at all.
 *
 * Daily Reset Logic
 * ─────────────────
 * The nightly cron job (or manual POST /reset) calls resetDailyStatus():
 *   UPDATE DRONE SET daily_status = false, daily_status_date = NULL
 *   WHERE daily_status = true
 *     AND (daily_status_date IS NULL OR daily_status_date < CURRENT_DATE)
 *
 * Scheduling (choose one approach):
 *  Option A – node-cron inside the Express process (zero infra):
 *    import cron from 'node-cron';
 *    cron.schedule('0 0 * * *', resetDailyStatusJob, { timezone: 'Asia/Kolkata' });
 *
 *  Option B – OS-level cron calling POST /api/inventory/drone-status/reset
 *    (recommended for production — no in-process scheduler needed)
 */

import db from "../models/index.js";

const { Drone1, User, UserProfile, UserRole, MasterRole, SprayingDailyLogs, Op } = db;

/** Returns [startOfTodayDate, endOfTodayDate] as JS Date objects (server-local). */
const getTodayRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return [start, end];
};

// ─── Manual-Join Helpers (NO associations / include / model / as) ────────────

/**
 * Given an array of user ids, manually fetch USER + USER_PROFILE rows
 * (two independent queries, no include) and return a Map<user_id, shapedPilot>.
 */
const fetchUsersWithProfilesById = async (userIds = []) => {
  const ids = [...new Set(userIds.filter((id) => id !== null && id !== undefined))];
  if (ids.length === 0) return new Map();

  const [users, profiles] = await Promise.all([
    User.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ["id", "email", "mobile_number", "username"],
    }),
    UserProfile.findAll({
      where: { user_id: { [Op.in]: ids } },
      attributes: ["user_id", "first_name", "last_name", "user_image_url"],
    }),
  ]);

  // Manual join: profile rows keyed by user_id
  const profileByUserId = new Map();
  profiles.forEach((p) => {
    const raw = p.toJSON ? p.toJSON() : p;
    profileByUserId.set(raw.user_id, raw);
  });

  const result = new Map();
  users.forEach((u) => {
    const raw = u.toJSON ? u.toJSON() : u;
    const profile = profileByUserId.get(raw.id) || null;
    const firstName = profile?.first_name || "";
    const lastName = profile?.last_name || "";
    result.set(raw.id, {
      id: raw.id,
      email: raw.email,
      mobile_number: raw.mobile_number,
      username: raw.username,
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim() || raw.username || raw.email,
      user_image_url: profile?.user_image_url || null,
    });
  });

  return result;
};

/**
 * Manually attaches pilot_name / co_pilot_name / pilot_email / pilot_mobile /
 * pilot_image / co_pilot_name fields onto a plain array of drone rows (already
 * plain objects, not Sequelize instances), based on pilot_user_id / co_pilot_user_id.
 *
 * No `include` is used — pilots are fetched separately via fetchUsersWithProfilesById
 * and merged in plain JS.
 */
const attachPilotInfoToDrones = async (droneRows) => {
  const pilotIds = droneRows.map((d) => d.pilot_user_id).filter(Boolean);
  const coPilotIds = droneRows.map((d) => d.co_pilot_user_id).filter(Boolean);
  const usersById = await fetchUsersWithProfilesById([...pilotIds, ...coPilotIds]);

  return droneRows.map((d) => {
    const pilot = d.pilot_user_id ? usersById.get(d.pilot_user_id) : null;
    const coPilot = d.co_pilot_user_id ? usersById.get(d.co_pilot_user_id) : null;
    return {
      ...d,
      pilot_name: pilot?.full_name || "Unassigned",
      pilot_email: pilot?.email || null,
      pilot_mobile: pilot?.mobile_number || null,
      pilot_image: pilot?.user_image_url || null,
      co_pilot_name: coPilot?.full_name || null,
    };
  });
};

/**
 * Fetches drones matching whereClause (plain findAll, no include) and manually
 * attaches pilot info via attachPilotInfoToDrones().
 */
const getDronesWithPilotInfo = async (whereClause = {}) => {
  const drones = await Drone1.findAll({
    where: whereClause,
    order: [["id", "ASC"]],
  });
  const plainDrones = drones.map((d) => (d.toJSON ? d.toJSON() : d));
  return attachPilotInfoToDrones(plainDrones);
};

// ─── 1. GET ALL DRONES (with daily_status, pilot info) ───────────────────────

/**
 * GET /api/inventory/drone-status
 * Query: status (true|false|all), search, page, limit
 */
export const getAllDroneStatuses = async (req, res) => {
  try {
    const { status, search = "", page = 1, limit = 50 } = req.query;

    const where = { is_active: true };

    if (status === "true") where.daily_status = true;
    else if (status === "false") where.daily_status = false;

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { model: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const allDrones = await getDronesWithPilotInfo(where);

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginated = allDrones.slice(offset, offset + parseInt(limit));

    return res.status(200).json({
      success: true,
      data: paginated,
      total: allDrones.length,
      page: parseInt(page),
      totalPages: Math.ceil(allDrones.length / parseInt(limit)),
    });
  } catch (err) {
    console.error("getAllDroneStatuses error:", err);
    return res.status(500).json({ success: false, message: "Internal server error.", error: err.message });
  }
};

// ─── 2. GET DRONES WITH WORK TODAY (tagged Active / Inactive) ────────────────

/**
 * GET /api/inventory/drone-status/active
 *
 * "Drones Active Today" page data source.
 *
 * Step 1 — Query SPRAYING_DAILY_LOGS directly (no include) for rows whose
 *          working_date is today. Collect distinct drone_id values.
 * Step 2 — Query DRONE directly (no include) for those drone ids.
 * Step 3 — Query USER + USER_PROFILE directly (no include) for the pilots on
 *          those drones, and manually merge pilot_name onto each drone in JS.
 * Step 4 — Tag each drone Active/Inactive based on its own daily_status column.
 *
 * Also auto-resets stale (previous-day) activations before responding.
 */
export const getActiveDrones = async (req, res) => {
  try {
    await _resetStaleDrones();

    const [todayStart, todayEnd] = getTodayRange();

    // Step 1 — plain query on SPRAYING_DAILY_LOGS, no include
    const todaysLogs = await SprayingDailyLogs.findAll({
      where: {
        is_active: true,
        drone_id: { [Op.ne]: null },
        working_date: { [Op.between]: [todayStart, todayEnd] },
      },
      attributes: ["drone_id", "working_date", "pilot_user_id", "co_pilot_user_id", "spraying_work_id"],
      order: [["working_date", "ASC"]],
    });

    const droneIdsWithWorkToday = [...new Set(todaysLogs.map((l) => l.drone_id).filter(Boolean))];

    if (droneIdsWithWorkToday.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        total: 0,
        active_count: 0,
        inactive_count: 0,
        message: "No drones have scheduled spraying work for today.",
      });
    }

    // Keep earliest log per drone_id for extra context fields
    const logByDroneId = {};
    todaysLogs.forEach((log) => {
      const raw = log.toJSON ? log.toJSON() : log;
      if (!logByDroneId[raw.drone_id]) logByDroneId[raw.drone_id] = raw;
    });

    // Step 2 — plain query on DRONE, no include
    const drones = await getDronesWithPilotInfo({
      is_active: true,
      id: { [Op.in]: droneIdsWithWorkToday },
    });

    // Step 4 — tag Active/Inactive from each drone's own daily_status
    const shaped = drones.map((d) => {
      const todayLog = logByDroneId[d.id] || null;
      const isActive = Boolean(d.daily_status);
      return {
        ...d,
        has_work_today: true,
        today_booking_id: todayLog?.spraying_work_id || null,
        today_scheduled_pilot_id: todayLog?.pilot_user_id || null,
        today_scheduled_copilot_id: todayLog?.co_pilot_user_id || null,
        status_label: isActive ? "Active" : "Inactive",
        daily_status: isActive,
      };
    });

    return res.status(200).json({
      success: true,
      data: shaped,
      total: shaped.length,
      active_count: shaped.filter((d) => d.daily_status).length,
      inactive_count: shaped.filter((d) => !d.daily_status).length,
    });
  } catch (err) {
    console.error("getActiveDrones error:", err);
    return res.status(500).json({ success: false, message: "Internal server error.", error: err.message });
  }
};

// ─── 3. TOGGLE DAILY STATUS (pilot marks drone active/inactive for today) ────

/**
 * PATCH /api/inventory/drone-status/:id
 * Body: { daily_status: true | false }
 */
export const updateDroneStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { daily_status } = req.body;

    if (daily_status === undefined || daily_status === null) {
      return res.status(400).json({ success: false, message: "daily_status (boolean) is required." });
    }

    const drone = await Drone1.findOne({ where: { id, is_active: true } });
    if (!drone) return res.status(404).json({ success: false, message: "Drone not found." });

    // Optional: verify requesting user is the assigned pilot or superuser
    // const requestingUserId = req.user?.id;
    // if (drone.pilot_user_id !== requestingUserId && !req.user?.is_superuser) {
    //   return res.status(403).json({ success: false, message: "Only the assigned pilot can update this drone's daily status." });
    // }

    const isActive = Boolean(daily_status);
    const today = new Date().toISOString().split("T")[0];

    await drone.update({
      daily_status: isActive,
      daily_status_date: isActive ? today : null,
      modified_on: new Date(),
      modified_by: req.user?.id || null,
    });

    // Manual re-fetch + manual pilot merge (no include)
    const [shaped] = await getDronesWithPilotInfo({ id: drone.id });

    return res.status(200).json({
      success: true,
      data: shaped,
      message: isActive
        ? `Drone ${drone.name || drone.model || id} marked ACTIVE for today.`
        : `Drone ${drone.name || drone.model || id} marked INACTIVE for today.`,
    });
  } catch (err) {
    console.error("updateDroneStatus error:", err);
    return res.status(500).json({ success: false, message: "Internal server error.", error: err.message });
  }
};

// ─── 4. MIDNIGHT RESET ───────────────────────────────────────────────────────

const _resetStaleDrones = async () => {
  const today = new Date().toISOString().split("T")[0];
  await Drone1.update(
    { daily_status: false, daily_status_date: null, modified_on: new Date() },
    {
      where: {
        daily_status: true,
        [Op.or]: [
          { daily_status_date: null },
          { daily_status_date: { [Op.lt]: today } },
        ],
      },
    }
  );
};

/**
 * POST /api/inventory/drone-status/reset
 */
export const resetDailyStatus = async (req, res) => {
  try {
    await _resetStaleDrones();

    const stillActive = await Drone1.count({ where: { is_active: true, daily_status: true } });

    return res.status(200).json({
      success: true,
      message: "Daily status reset complete.",
      still_active_today: stillActive,
    });
  } catch (err) {
    console.error("resetDailyStatus error:", err);
    return res.status(500).json({ success: false, message: "Internal server error.", error: err.message });
  }
};

// ─── 5. GET ACTIVE PILOTS from USER table (manual joins, no associations) ───

/**
 * GET /api/inventory/pilots
 *
 * Returns users where:
 *   - User.is_active = true  (used as "status = active" for USER table)
 *   - The user has a USER_ROLE row whose role_id points to a MASTER_ROLE
 *     row with role_name = 'pilot' (case-insensitive)
 *
 * Implementation note: instead of Sequelize `include`, this is done as three
 * independent queries, manually joined in JS:
 *   1. MASTER_ROLE  → find the role id(s) where role_name ILIKE 'pilot'
 *   2. USER_ROLE    → find user_id(s) that reference those role id(s)
 *   3. USER (+ USER_PROFILE) → find active users among those user_id(s)
 */
export const getActivePilots = async (req, res) => {
  try {
    // Step 1 — find the 'pilot' role id(s) directly from MASTER_ROLE
    const pilotRoles = await MasterRole.findAll({
      where: {
        role_name: { [Op.iLike]: "pilot" },
        is_active: true,
      },
      attributes: ["id"],
    });
    const pilotRoleIds = pilotRoles.map((r) => r.id);

    if (pilotRoleIds.length === 0) {
      return res.status(200).json({ success: true, data: [], total: 0 });
    }

    // Step 2 — find user_ids assigned to those role id(s) via USER_ROLE
    const userRoleRows = await UserRole.findAll({
      where: {
        role_id: { [Op.in]: pilotRoleIds },
        is_active: true,
      },
      attributes: ["user_id"],
    });
    const pilotUserIds = [...new Set(userRoleRows.map((r) => r.user_id).filter(Boolean))];

    if (pilotUserIds.length === 0) {
      return res.status(200).json({ success: true, data: [], total: 0 });
    }

    // Step 3 — find active USER rows among those ids, plus USER_PROFILE separately
    const [users, profiles] = await Promise.all([
      User.findAll({
        where: {
          id: { [Op.in]: pilotUserIds },
          is_active: true,
        },
        attributes: ["id", "email", "mobile_number", "username"],
        order: [["id", "ASC"]],
      }),
      UserProfile.findAll({
        where: { user_id: { [Op.in]: pilotUserIds } },
        attributes: ["user_id", "first_name", "last_name", "user_image_url"],
      }),
    ]);

    // Manual join: profile rows keyed by user_id
    const profileByUserId = new Map();
    profiles.forEach((p) => {
      const raw = p.toJSON ? p.toJSON() : p;
      profileByUserId.set(raw.user_id, raw);
    });

    const shaped = users.map((u) => {
      const raw = u.toJSON ? u.toJSON() : u;
      const profile = profileByUserId.get(raw.id) || null;
      const firstName = profile?.first_name || "";
      const lastName = profile?.last_name || "";
      return {
        id: raw.id,
        email: raw.email,
        mobile_number: raw.mobile_number,
        username: raw.username,
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`.trim() || raw.username || raw.email,
        user_image_url: profile?.user_image_url || null,
        role_name: "pilot",
      };
    });

    return res.status(200).json({
      success: true,
      data: shaped,
      total: shaped.length,
    });
  } catch (err) {
    console.error("getActivePilots error:", err);
    return res.status(500).json({ success: false, message: "Internal server error.", error: err.message });
  }
};