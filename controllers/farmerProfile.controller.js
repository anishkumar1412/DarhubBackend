import db from '../models/index.js';

export const getFarmerProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { tab } = req.query;

    if (!tab) {
      return res.status(400).json({ success: false, message: 'tab query parameter is required' });
    }

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
            order_status: 'UPCOMING'
          }
        });

        // Sum acreage from farm addresses (mocking acreage if not natively supported in UserAddress, or just counting farms)
        // Since we are using UserAddress as farm, we don't have acreage in DB, mocking it.
        const totalAcres = farmAddresses.length * 10.5; // Mock data based on UI

        console.log("farmAddress", farmAddresses);


        responseData = {
          user_info: {
            name: userProfile ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() : user.username,
            verified: true, // Assuming true for now or map from isMobileVerify/isEmailVerify
            mobile_number: user.mobile_number,
            email: user.email,
            member_since: user.createdAt,
            account_type: 'Farmer',
            profile_image: userProfile?.user_image_url || null,
            location: primaryAddress
              ? `${primaryAddress.village || primaryAddress.lane_1}, ${primaryAddress.district || ''}`
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
          address_details: primaryAddress ? {
            lane_1: primaryAddress.lane_1,
            lane_2: primaryAddress.lane_2,
            state: primaryAddress.state,
            district: primaryAddress.district,
            block: primaryAddress.block,
            village: primaryAddress.village,
            pincode: primaryAddress.pincode
          } : null
        };
        break;
      }

      case 'farm': {
        // Fetch non-primary addresses as farm locations
        const farmAddresses = await db.UserAddress.findAll({
          where: { user_id: userId, is_primary: false }
        });

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
            address: {
              lane_1: addr.lane_1,
              lane_2: addr.lane_2,
              state: addr.state,
              district: addr.district,
              block: addr.block,
              village: addr.village,
              pincode: addr.pincode
            },
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

        responseData = {
          addresses: allAddresses.map(addr => ({
            id: addr.id,
            is_primary: addr.is_primary,
            type: addr.is_primary ? 'Home' : 'Farm/Warehouse',
            lane_1: addr.lane_1,
            lane_2: addr.lane_2,
            state: addr.state,
            district: addr.district,
            block: addr.block,
            village: addr.village,
            pincode: addr.pincode
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
          bank_accounts: bankDetails,
          upi_details: upiDetails
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
    console.error('Error fetching farmer profile:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
  }
};

export const updateFarmerProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { tab } = req.query;

    if (!tab) {
      return res.status(400).json({ success: false, message: 'tab query parameter is required' });
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Farmer not found' });
    }

    let userProfile = await db.UserProfile.findOne({ where: { user_id: userId } });
    if (!userProfile) {
      userProfile = await db.UserProfile.create({
        user_id: userId,
        first_name: user.username || 'Unknown'
      });
    }

    switch (tab) {
      case 'personal': {
        const { personal_info, address_details } = req.body;

        if (personal_info) {
          if (personal_info.mobile_number !== undefined || personal_info.email !== undefined) {
            await user.update({
              mobile_number: personal_info.mobile_number !== undefined ? personal_info.mobile_number : user.mobile_number,
              email: personal_info.email !== undefined ? personal_info.email : user.email,
            });
          }

          await userProfile.update({
            first_name: personal_info.first_name !== undefined ? personal_info.first_name : userProfile.first_name,
            last_name: personal_info.last_name !== undefined ? personal_info.last_name : userProfile.last_name,
            dob: personal_info.dob !== undefined ? personal_info.dob : userProfile.dob,
            user_image_url: personal_info.profile_image !== undefined ? personal_info.profile_image : userProfile.user_image_url,
          });
        }

        if (address_details) {
          let primaryAddress = await db.UserAddress.findOne({
            where: { user_id: userId, is_primary: true }
          });

          if (primaryAddress) {
            await primaryAddress.update({
              lane_1: address_details.lane_1 !== undefined ? address_details.lane_1 : primaryAddress.lane_1,
              lane_2: address_details.lane_2 !== undefined ? address_details.lane_2 : primaryAddress.lane_2,
              state: address_details.state !== undefined ? address_details.state : primaryAddress.state,
              district: address_details.district !== undefined ? address_details.district : primaryAddress.district,
              block: address_details.block !== undefined ? address_details.block : primaryAddress.block,
              village: address_details.village !== undefined ? address_details.village : primaryAddress.village,
              pincode: address_details.pincode !== undefined ? address_details.pincode : primaryAddress.pincode,
            });
          } else {
            await db.UserAddress.create({
              user_id: userId,
              is_primary: true,
              lane_1: address_details.lane_1,
              lane_2: address_details.lane_2,
              state: address_details.state,
              district: address_details.district,
              block: address_details.block,
              village: address_details.village,
              pincode: address_details.pincode,
            });
          }
        }

        return res.status(200).json({ success: true, message: 'Personal profile updated successfully' });
      }

      default:
        return res.status(400).json({ success: false, message: 'Updating this tab is not supported yet' });
    }
  } catch (error) {
    console.error('Error updating farmer profile:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
  }
};

