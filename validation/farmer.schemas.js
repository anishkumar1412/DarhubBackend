import {
  z, text, optional, optionalText, id, integer, booleanish, email, mobile, password, dob, pincode, ifsc, accountNumber, upiId,
  bookingDate, pagination, uuidParam,
} from './common.js';

// ── Profile: PATCH /api/farmer/profile?tab=personal ─────────────

/**
 * A profile photo URL must be one this server uploaded (our Cloudinary account). Any other URL would let a client
 * point the profile at arbitrary content that the apps then load.
 */
const ownCloudinaryUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com'
      && (!process.env.CLOUD_NAME || url.pathname.startsWith(`/${process.env.CLOUD_NAME}/`));
  } catch {
    return false;
  }
};

const personalFields = z.object({
  first_name: optionalText('First name', { max: 60 }),
  last_name: optionalText('Last name', { max: 60 }),
  mobile_number: optional(mobile()),
  email: optional(email()),
  dob: dob(),
  profile_image: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().trim().max(500).refine(ownCloudinaryUrl, 'profile_image must be a photo uploaded through the app').optional(),
  ),
  whatsapp_number: optional(mobile('WhatsApp number')),
});

const addressPatchFields = z.object({
  lane_1: optionalText('lane_1 (address)'),
  lane_2: optionalText('lane_2'),
  state: optional(id('state')),
  district: optional(id('district')),
  block: optional(id('block')),
  village: optionalText('village'),
  pincode: optional(pincode()),
});

// The mobile app sends { personal_info, address_details }; the Postman contract uses flat fields.
export const personalProfileUpdateSchema = z.preprocess(
  (body) => {
    const b = body && typeof body === 'object' ? body : {};
    return { personal: b.personal_info ?? b, address: b.address_details ?? undefined };
  },
  z.object({ personal: personalFields, address: addressPatchFields.optional() }),
);

export const profileQuerySchema = z.object({
  tab: z.string({ required_error: 'tab query parameter is required' }).trim().min(1, 'tab query parameter is required'),
});

// ── Addresses ────────────────────────────────────────────────────

export const addressCreateSchema = z.object({
  lane_1: text('lane_1 (address)'),
  lane_2: optionalText('lane_2'),
  state: id('state'),
  district: id('district'),
  block: id('block'),
  village: text('village'),
  pincode: pincode(),
  is_primary: optional(booleanish('is_primary')),
});

export const addressUpdateSchema = addressCreateSchema.partial();

// ── Bank accounts / UPI ──────────────────────────────────────────

export const bankCreateSchema = z.object({
  bank_name: text('bank_name', { max: 100 }),
  acc_holder_name: text('acc_holder_name', { max: 100 }),
  acc_number: accountNumber(),
  ifsc_code: ifsc(),
  is_primary: optional(booleanish('is_primary')),
});

export const bankUpdateSchema = bankCreateSchema.partial();

export const upiSchema = z.object({ upi_id: upiId() });

// ── Bookings ─────────────────────────────────────────────────────

export const bookingParams = uuidParam('booking_id');

export const bookingListQuerySchema = pagination({ defaultLimit: 10, maxLimit: 50 }).extend({
  status: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : undefined), z.string().max(30).optional()),
});

export const rateBookingSchema = z.object({ rating: integer('Rating', { min: 1, max: 5 }) });

export const cancelBookingSchema = z.object({ cancellation_reason: optionalText('cancellation_reason', { max: 500 }) });

export const rescheduleBookingSchema = z.object({
  new_date: bookingDate('new_date', { maxDaysAhead: 365 }),
  new_time_window: optionalText('new_time_window', { max: 50 }),
});

// ── PUT /api/user/farmer-edit (multipart) ────────────────────────
// Addresses are read separately (parseAddressInput + buildAddresses check them against the location tables).
export const farmerEditSchema = z.object({
  user_id: optional(id('user_id')),
  first_name: optionalText('First name', { max: 60 }),
  last_name: optionalText('Last name', { max: 60 }),
  dob: dob(),
  password: optional(password()),
  username: optionalText('username', { max: 50 }),
  email: optional(email()),
  mobile_number: optional(mobile()),
});
