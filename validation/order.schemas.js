import { z, id, integer, number, optional, optionalText, pincode, bookingDate } from './common.js';

/** Upper bounds that stop a typo (or a hand-made request) from creating a booking decades long or crores in price. */
export const MAX_ORDER_ACRES = 1000;
export const MAX_ORDER_DAYS = 60;

const orderAddress = z.object({
  state: id('address.state'),
  district: id('address.district'),
  block: id('address.block'),
  village: optionalText('address.village'),
  lane1: optionalText('address.lane1'),
  lane2: optionalText('address.lane2'),
  address1: optionalText('address.address1'),
  address2: optionalText('address.address2'),
  pincode: optional(pincode()),
}, { required_error: 'address is required', invalid_type_error: 'address must be an object' });

const money = (label) => optional(number(label, { min: 0, max: 100_000_000 }));

// POST /order/create-order
// price / tax / discount / user_id / farmer_details are only honoured for administrators (the handler ignores them
// for a farmer), so here they are only checked for shape.
export const createOrderSchema = z.object({
  start_date: bookingDate('start_date', { maxDaysAhead: 365 }),
  crop_type_id: id('crop_type_id'),
  land_in_acers: number('land_in_acers', { positive: true, max: MAX_ORDER_ACRES }),
  num_of_days: optional(integer('num_of_days', { min: 1, max: MAX_ORDER_DAYS })),
  address: orderAddress,
  price: money('price'),
  tax: money('tax'),
  discount: money('discount'),
  user_id: z.any().optional(),
  farmer_details: z.object({
    name: optionalText('farmer_details.name', { max: 60 }),
    mobile: z.any().optional(),
    email: z.any().optional(),
  }).optional().catch(undefined),
});
