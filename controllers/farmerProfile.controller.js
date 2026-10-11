import db from '../models/index.js';
import { OrderStatusEnum } from '../utils/enums.js';
import { respondWithError } from '../middleware/errorHandler.js';
import { parseOrThrow } from '../middleware/validate.js';
import { personalProfileUpdateSchema } from '../validation/farmer.schemas.js';
import { checkLocationChain } from '../services/registration.service.js';
import { resolveIdentityChange, consumeIdentityVerification } from '../services/identity.service.js';
import { ApiError } from '../utils/apiError.js';

// Resolve state/district/block ids to display names for a list of address rows (3 queries total).
export const withLocationNames = async (addresses) => {
  const list = addresses.filter(Boolean);
  const ids = (key) => [...new Set(list.map((a) => a[key]).filter(Boolean))];
  const [states, districts, blocks] = await Promise.all([
    ids('state').length ? db.MasterState.findAll({ where: { id: ids('state') }, attributes: ['id', 'state_name'], raw: true }) : [],
    ids('district').length ? db.MasterDistrict.findAll({ where: { id: ids('district') }, attributes: ['id', 'district_name'], raw: true }) : [],
    ids('block').length ? db.MasterBlock.findAll({ where: { id: ids('block') }, attributes: ['id', 'block_name'], raw: true }) : [],
  ]);
  const byId = (rows, nameKey) => Object.fromEntries(rows.map((r) => [r.id, r[nameKey]]));
  const stateNames = byId(states, 'state_name');
  const districtNames = byId(districts, 'district_name');
  const blockNames = byId(blocks, 'block_name');
  return (addr) => addr && ({
    lane_1: addr.lane_1,
    lane_2: addr.lane_2,
    state: addr.state,
    district: addr.district,
    block: addr.block,
    state_name: stateNames[addr.state] || null,
    district_name: districtNames[addr.district] || null,
    block_name: blockNames[addr.block] || null,
    village: addr.village,
    pincode: addr.pincode,
  });
};

// "123456789012" -> "XXXX XXXX 9012"
export const maskAccountNumber = (num) => {
  const digits = String(num || '');
  return digits.length > 4 ? `XXXX XXXX ${digits.slice(-4)}` : digits;
};

export const getFarmerProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { tab } = req.valid.query;

    // Common query to fetch user basic info since it's needed for multiple tabs
    const user = await db.User.findByPk(userId, {
      attributes: { exclude: ['password', 'refresh_token'] }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Farmer not found' });
    }

    const userProfile = await db.UserProfile.findOne({ where: { user_id: userId } });

    let responseData = {};

    switch (tab) {
      case 'main': {
        // High level overview for the main screen
        const primaryAddress = await db.UserAddress.findOne({
          where: { user_id: userId, is_primary: true }
        });

        // Count total farms (addresses where is_primary is false)
        const farmAddresses = await db.UserAddress.findAll({
          where: { user_id: userId, is_primary: false }
        });

        // Count bookings for the farmer
        const upcomingBookingsCount = await db.SprayingOrder.count({
          where: {
            user_id: userId,
            order_status: {
              [db.Op.in]: [OrderStatusEnum.ORDER_ACCEPTED, OrderStatusEnum.ORDER_STARTED]
            }
          }
        });

        // Sum acreage from farm addresses (mocking acreage if not natively supported in UserAddress, or just counting farms)
        // Since we are using UserAddress as farm, we don't have acreage in DB, mocking it.
        const totalAcres = farmAddresses.length * 10.5; // Mock data based on UI

        const mainNames = primaryAddress ? (await withLocationNames([primaryAddress]))(primaryAddress) : null;

        responseData = {
          user_info: {
            name: userProfile ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() : user.username,
            verified: Boolean(user.isMobileVerify || user.isEmailVerify),
            mobile_number: user.mobile_number,
            email: user.email,
            member_since: user.created_on || null,
            account_type: 'Farmer',
            profile_image: userProfile?.user_image_url || null,
            location: primaryAddress
              ? [primaryAddress.village || primaryAddress.lane_1, mainNames.district_name].filter(Boolean).join(', ')
              : null
          },
          farm_summary: {
            total_acres: totalAcres.toFixed(1),
            active_crops: farmAddresses.length > 0 ? farmAddresses.length + 1 : 0, // Mock
            total_fields: farmAddresses.length,
            upcoming_bookings: upcomingBookingsCount
          }
        };
        break;
      }

      case 'personal': {
        const primaryAddress = await db.UserAddress.findOne({
          where: { user_id: userId, is_primary: true }
        });

        responseData = {
          personal_info: {
            first_name: userProfile?.first_name || '',
            last_name: userProfile?.last_name || '',
            mobile_number: user.mobile_number,
            email: user.email,
            dob: userProfile?.dob || null,
            profile_image: userProfile?.user_image_url || null,
            // Mocking fields not present in UserProfile but shown in UI
            gender: 'Male',
            marital_status: 'Married',
            education: 'Graduate',
            occupation: 'Farmer'
          },
          address_details: primaryAddress ? (await withLocationNames([primaryAddress]))(primaryAddress) : null
        };
        break;
      }

      case 'farm': {
        // Fetch non-primary addresses as farm locations
        const farmAddresses = await db.UserAddress.findAll({
          where: { user_id: userId, is_primary: false }
        });

        const farmAddr = await withLocationNames(farmAddresses);
        const farms = farmAddresses.map((addr, index) => {
          return {
            id: addr.id,
            farm_name: addr.lane_1 || `Farm ${index + 1}`,
            farm_type: 'Owner', // Mock
            total_land_owned: 12.5, // Mock
            irrigation_type: 'Borewell', // Mock
            primary_soil_type: 'Clay Loam', // Mock
            water_source: 'Borewell', // Mock
            description: 'Agricultural farm focused on essential crops.',
            address: farmAddr(addr),
            fields: [
              { name: 'Field A', acres: 5, soil_type: 'Clay Loam', irrigation: 'Borewell' },
              { name: 'Field B', acres: 7.5, soil_type: 'Sandy Loam', irrigation: 'Drip' }
            ]
          };
        });

        responseData = { farms };
        break;
      }

      case 'address': {
        const allAddresses = await db.UserAddress.findAll({
          where: { user_id: userId },
          order: [['is_primary', 'DESC']]
        });

        const toNamed = await withLocationNames(allAddresses);
        responseData = {
          addresses: allAddresses.map(addr => ({
            id: addr.id,
            is_primary: addr.is_primary,
            type: addr.is_primary ? 'Home' : 'Farm/Warehouse',
            ...toNamed(addr),
          }))
        };
        break;
      }

      case 'bank': {
        const bankDetails = await db.UserBankDetails.findAll({
          where: { user_id: userId },
          order: [['is_primary', 'DESC']]
        });

        const upiDetails = await db.UserUpiDetails.findAll({
          where: { user_id: userId }
        });

        responseData = {
          bank_accounts: bankDetails.map((b) => ({
            id: b.id,
            bank_name: b.bank_name,
            acc_holder_name: b.acc_holder_name,
            acc_number: maskAccountNumber(b.acc_number),
            ifsc_code: b.ifsc_code,
            is_primary: b.is_primary,
            passbook_image_url: b.passbook_image_url || null,
          })),
          upi_details: upiDetails.map((u) => ({ id: u.id, upi_id: u.upi_id })),
        };
        break;
      }

      default:
        return res.status(400).json({ success: false, message: 'Invalid tab specified' });
    }

    return res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    return respondWithError(req, res, error, 'getFarmerProfile');
  }
};

const ADDRESS_FIELDS = ['lane_1', 'lane_2', 'state', 'district', 'block', 'village', 'pincode'];

export const updateFarmerProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    if (req.valid.query.tab !== 'personal') {
      return res.status(400).json({ success: false, message: 'Updating this tab is not supported yet' });
    }

    // Field rules: validation/farmer.schemas.js (personalProfileUpdateSchema)
    const { personal, address } = parseOrThrow(personalProfileUpdateSchema, req.body);

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Farmer not found' });
    }

    // E-mail / mobile: normalised, unique, and verified with an OTP before they change. This endpoint used to write
    // whatever was sent, which let anyone take another person's number (and, through it, see their bookings).
    const identity = await resolveIdentityChange(user, personal, { editedByAdmin: false });

    // Address: only the parts that were sent change, and the resulting state -> district -> block chain must hold
    let primaryAddress = null;
    let addressValues = null;
    if (address && Object.keys(address).length > 0) {
      primaryAddress = await db.UserAddress.findOne({ where: { user_id: userId, is_primary: true } });
      addressValues = Object.fromEntries(ADDRESS_FIELDS.map((k) => [k, address[k] ?? primaryAddress?.[k] ?? null]));
      if (!primaryAddress) {
        const missing = ['state', 'district', 'block', 'village', 'pincode'].filter((k) => !addressValues[k]);
        if (missing.length) throw new ApiError(400, `address_details: ${missing.join(', ')} required for a new address`);
      }
      const problem = await checkLocationChain(db, addressValues);
      if (problem) throw new ApiError(400, `address_details: ${problem}`);
    }

    const profileFields = {};
    if (personal.first_name !== undefined) profileFields.first_name = personal.first_name;
    if (personal.last_name !== undefined) profileFields.last_name = personal.last_name;
    if (personal.dob !== undefined) profileFields.dob = personal.dob;
    if (personal.profile_image !== undefined) profileFields.user_image_url = personal.profile_image;
    if (personal.whatsapp_number !== undefined) profileFields.whatsapp_number = personal.whatsapp_number;

    await db.sequelize.transaction(async (t) => {
      if (Object.keys(identity).length > 0) {
        await user.update({ ...identity, modified_by: userId, modified_on: new Date() }, { transaction: t });
        await consumeIdentityVerification(identity, t);
      }

      if (Object.keys(profileFields).length > 0) {
        const profile = await db.UserProfile.findOne({ where: { user_id: userId }, transaction: t });
        if (profile) {
          await profile.update({ ...profileFields, modified_by: userId, modified_on: new Date() }, { transaction: t });
        } else {
          await db.UserProfile.create({
            user_id: userId, first_name: user.username || '', ...profileFields, created_by: userId,
          }, { transaction: t });
        }
      }

      if (addressValues) {
        if (primaryAddress) {
          await primaryAddress.update({ ...addressValues, modified_by: userId, modified_on: new Date() }, { transaction: t });
        } else {
          await db.UserAddress.create({ user_id: userId, is_primary: true, ...addressValues, created_by: userId }, { transaction: t });
        }
      }
    });

    return res.status(200).json({ success: true, message: 'Personal profile updated successfully' });
  } catch (error) {
    return respondWithError(req, res, error, 'updateFarmerProfile');
  }
};
