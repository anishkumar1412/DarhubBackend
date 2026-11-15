/**
 * Who is a pilot / a farmer. user_type alone is not reliable for older rows (pilot accounts with user_type 1 or 3
 * exist, farmer accounts have user_type 1 or 3), so the role decides first:
 *  - pilot:  has the Pilot role, or user_type 2 (pilot registration; admins also have 2 and keep their access)
 *  - farmer: does not have the Pilot role, and has the Farmer role or user_type 1 / 3
 * `roles` are lower-cased role names (middleware/access.js loadRoleNames).
 */
export const isPilotAccount = (userType, roles) => roles.includes('pilot') || userType === 2;

export const isFarmerAccount = (userType, roles) =>
  !roles.includes('pilot') && (roles.includes('farmer') || userType === 1 || userType === 3);
