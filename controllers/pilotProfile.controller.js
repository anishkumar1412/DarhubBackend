import db from '../models/index.js';

export const getPilotProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { tab } = req.query;

    if (!tab) {
      return res.status(400).json({ success: false, message: 'tab query parameter is required' });
    }

    const user = await db.User.findByPk(userId, {
      attributes: { exclude: ['password', 'refresh_token'] }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Pilot not found' });
    }

    const userProfile = await db.UserProfile.findOne({ where: { user_id: userId } });

    let responseData = {};

    switch (tab) {
      case 'main': {
        const primaryAddress = await db.UserAddress.findOne({
          where: { user_id: userId, is_primary: true }
        });
        
        // Count total orders assigned to the pilot
        const totalOrders = await db.SprayingWorkAssignee.count({
          where: { pilot_user_id: userId }
        });
        
        const activeOrders = await db.SprayingWorkAssignee.count({
          where: { pilot_user_id: userId, is_active: true }
        });

        responseData = {
          user_info: {
            name: userProfile ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() : user.username,
            verified: user.isEmailVerify || user.isMobileVerify,
            mobile_number: user.mobile_number,
            email: user.email,
            member_since: user.createdAt,
            account_type: 'Pilot',
            profile_image: userProfile?.user_image_url || null,
            location: primaryAddress 
              ? `${primaryAddress.village || primaryAddress.lane_1}, ${primaryAddress.district || ''}`
              : null
          },
          work_summary: {
            total_orders_assigned: totalOrders,
            active_orders: activeOrders
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
            aadhar_number: userProfile?.aadhar_number || null,
            pan_card_number: userProfile?.pan_card_number || null,
            profile_image: userProfile?.user_image_url || null
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

      case 'address': {
        const allAddresses = await db.UserAddress.findAll({
          where: { user_id: userId },
          order: [['is_primary', 'DESC']]
        });
        
        responseData = {
          addresses: allAddresses.map(addr => ({
            id: addr.id,
            is_primary: addr.is_primary,
            type: addr.is_primary ? 'Home' : 'Secondary',
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

      case 'documents': {
        const documents = await db.UserDocuments.findAll({
          where: { user_id: userId, is_active: true }
        });
        
        const docTypeMap = {
          5: 'Profile Image',
          10: 'Aadhar Card',
          15: 'PAN Card',
          20: 'DGCA Pilot Certificate',
          25: 'DGCA License',
          30: 'Medical Certificate',
          35: 'Insurance Document'
        };

        responseData = {
          documents: documents.map(doc => ({
            id: doc.id,
            document_type_id: doc.document_type,
            document_type_name: docTypeMap[doc.document_type] || 'Unknown Document',
            original_name: doc.document_original_name,
            url: doc.document_url,
            uploaded_at: doc.createdAt
          }))
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
    console.error('Error fetching pilot profile:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
  }
};
