/**
 * Demo data for showing the farmer and pilot apps to clients.
 *
 *   node scripts/seed-demo.js            dry run: prints what would be created, writes nothing
 *   node scripts/seed-demo.js --apply    creates it (one transaction: all or nothing)
 *   node scripts/seed-demo.js --remove   deletes everything this script created, and nothing else
 *   node scripts/seed-demo.js --assign-today [--apply]
 *                                        live demo helper = the admin's "assign work" step: takes the newest booking made
 *                                        by a demo farmer that has no pilot yet and assigns it to Drone 02 + Vikram
 *                                        (the free crew) for its dates, through the same code the admin panel uses
 *
 * It uses the database in .env (or ENV_FILE=... for another one) and is safe to run again: whatever already exists
 * is left as it is, and `--apply` only adds what is missing. Dates are relative to today, so to refresh the bookings
 * before a demo run `--remove --apply` and then `--apply`.
 *
 * What it creates (all clearly demo: mobile numbers 90000 00xxx, e-mails @example.com):
 *   - a fresh location: villages for the Sanand and Daskroi blocks of Ahmedabad (the master table has almost none)
 *   - 2 farmers (home address + a farm) and 2 pilots (bank + UPI) with profiles
 *   - 2 drones (pilot + co-pilot assigned, active today) with their service area: Drone 01 (Arjun) is busy with the
 *     running job, Drone 02 (Vikram) is free for a live demo
 *   - 7 bookings in every state the apps show: pending, a pilot request, upcoming, ongoing today, completed
 *     and rated, cancelled
 */
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';
import db, { syncPromise } from '../models/index.js';
import { OrderStatusEnum as S } from '../utils/enums.js';
import { addDaysUTC, todayIST } from '../utils/dateUtils.js';

const apply = process.argv.includes('--apply');
const remove = process.argv.includes('--remove');
const assignToday = process.argv.includes('--assign-today');
const PASSWORD = 'Demo@1234';
const DEMO_DRONE_NAME = 'Darhub Demo Drone 01';
// Second drone with the OTHER pilot: a pilot and a drone can only be on one booking per day, so the first drone and
// Arjun are busy with the running job; this crew is free for a live "book -> assign -> accept -> start" demo today.
const DEMO_DRONE_2_NAME = 'Darhub Demo Drone 02';
const DEMO_DRONE_NAMES = [DEMO_DRONE_NAME, DEMO_DRONE_2_NAME];

// ── What gets created ────────────────────────────────────────────────────────────────────────────────────────
const VILLAGES = {
  Sanand: ['Moraiya', 'Chharodi', 'Nidhrad', 'Iyava', 'Kolat', 'Hirapur'],
  Daskroi: ['Aslali', 'Kuha', 'Bhat', 'Vinzol'],
};

const PEOPLE = [
  { key: 'farmer1', type: 3, role: 'Farmer', ref: 'FAM', first: 'Ramesh', last: 'Patel', mobile: '9000000101', email: 'ramesh.patel.demo@example.com', dob: '1984-03-12', block: 'Sanand', village: 'Moraiya', lane1: 'Survey No. 214, near Moraiya Gram Panchayat', farm: { block: 'Sanand', village: 'Chharodi', lane1: 'Chharodi Cotton Field, Survey 88' } },
  { key: 'farmer2', type: 3, role: 'Farmer', ref: 'FAM', first: 'Sunita', last: 'Desai', mobile: '9000000102', email: 'sunita.desai.demo@example.com', dob: '1990-08-25', block: 'Daskroi', village: 'Aslali', lane1: 'Plot 18, Aslali Road', farm: { block: 'Daskroi', village: 'Kuha', lane1: 'Kuha Paddy Field, Block 5' } },
  { key: 'pilot1', type: 2, role: 'Pilot', ref: 'PIL', first: 'Arjun', last: 'Rathod', mobile: '9000000201', email: 'arjun.rathod.demo@example.com', dob: '1993-01-17', block: 'Sanand', village: 'Sanand', lane1: '12, Drone Colony, Sanand', bank: ['State Bank of India', 'Arjun Rathod', '10000000201', 'SBIN0000300'], upi: 'arjun.rathod@oksbi' },
  { key: 'pilot2', type: 2, role: 'Pilot', ref: 'PIL', first: 'Vikram', last: 'Shinde', mobile: '9000000202', email: 'vikram.shinde.demo@example.com', dob: '1995-06-09', block: 'Sanand', village: 'Sanand', lane1: '47, Green Park, Sanand', bank: ['HDFC Bank', 'Vikram Shinde', '10000000202', 'HDFC0000240'], upi: 'vikram.shinde@okhdfcbank' },
];

/** offset = days from today. `days` = working days. `farmer` owns the booking. */
const ORDERS = [
  { key: 'pending',   farmer: 'farmer1', acres: 12, start: 6,  days: 2, status: S.WAITING_FOR_CONFIRMATION, crop: 0, farm: 'Moraiya Wheat Farm' },
  { key: 'upcoming',  farmer: 'farmer1', acres: 8,  start: 2,  days: 2, status: S.ORDER_ACCEPTED,           crop: 1, farm: 'Moraiya Cotton Plot', assign: 'confirmed' },
  { key: 'ongoing',   farmer: 'farmer1', acres: 10, start: 0,  days: 2, status: S.JOB_STARTED,              crop: 2, farm: 'Chharodi Field', assign: 'ongoing' },
  { key: 'completed', farmer: 'farmer1', acres: 6,  start: -7, days: 1, status: S.PAYMENT_SUCCESSFUL,       crop: 0, farm: 'Moraiya Wheat Farm', assign: 'completed', paid: true },
  { key: 'cancelled', farmer: 'farmer1', acres: 5,  start: 9,  days: 1, status: S.ORDER_CANCELLED,          crop: 1, farm: 'Nidhrad Plot', cancelReason: 'Bad weather forecast' },
  { key: 'request',   farmer: 'farmer2', acres: 7,  start: 4,  days: 1, status: S.WAITING_FOR_CONFIRMATION, crop: 2, farm: 'Aslali Farm', assign: 'unconfirmed' },
  { key: 'pending2',  farmer: 'farmer2', acres: 4,  start: 8,  days: 1, status: S.ORDER_PLACED,             crop: 0, farm: 'Aslali Farm' },
];

const TAX = 0.05;
const money = (n) => Math.round(n * 100) / 100;

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────
const log = (...a) => console.log(...a);
const day = (offset) => addDaysUTC(new Date(`${todayIST()}T00:00:00.000Z`), offset);

const { User, UserRole, UserProfile, UserAddress, UserBankDetails, UserUpiDetails, MasterRole, MasterState, MasterDistrict, MasterBlock,
  MasterGramPanchayat, MasterCrop, Drone1, DroneAddress, SprayingOrder, SprayingOrderAddress, SprayingOrderTimeline,
  SprayingOrderExtras, SprayingWorkAssignee, SprayingDailyLogs } = db;
const Model = { Drone1, DroneAddress };

const findBlock = async (name) => {
  const block = await MasterBlock.findOne({ where: { block_name: name }, include: [] });
  if (!block) throw new Error(`Block "${name}" is not in MASTER_BLOCK: pick another block in scripts/seed-demo.js`);
  const district = await MasterDistrict.findByPk(block.district_id);
  const state = await MasterState.findByPk(district.state_id);
  return { block, district, state };
};

const roleFor = async (name) => {
  const role = await MasterRole.findOne({ where: { role_name: { [Op.iLike]: name } } });
  if (!role) throw new Error(`Role "${name}" is missing from MASTER_ROLE`);
  return role;
};

const demoUsers = () => User.findAll({ where: { mobile_number: PEOPLE.map((p) => p.mobile) } });

// ── Remove ───────────────────────────────────────────────────────────────────────────────────────────────────
const removeDemo = async () => {
  const users = await demoUsers();
  const ids = users.map((u) => u.id);
  const drones = await Drone1.findAll({ where: { name: DEMO_DRONE_NAMES } });
  const orders = ids.length ? await SprayingOrder.findAll({ where: { user_id: ids }, attributes: ['booking_id'] }) : [];
  const bookingIds = orders.map((o) => o.booking_id);
  log(`Would remove: ${users.length} users, ${drones.length} drone(s), ${bookingIds.length} booking(s) and their rows.`);
  if (!apply) return log('Dry run. Add --apply to delete (node scripts/seed-demo.js --remove --apply).');

  await db.sequelize.transaction(async (t) => {
    const w = (where) => ({ where, transaction: t });
    if (bookingIds.length) {
      await SprayingOrderExtras.destroy(w({ booking_id: bookingIds }));
      await SprayingOrderTimeline.destroy(w({ booking_id: bookingIds }));
      await SprayingOrderAddress.destroy(w({ order_id: bookingIds }));
      await SprayingDailyLogs.destroy(w({ spraying_work_id: bookingIds }));
      await SprayingWorkAssignee.destroy(w({ booking_id: bookingIds }));
      await SprayingOrder.destroy(w({ booking_id: bookingIds }));
    }
    for (const d of drones) { await DroneAddress.destroy(w({ drone_id: d.id })); await d.destroy({ transaction: t }); }
    if (ids.length) {
      await UserUpiDetails.destroy(w({ user_id: ids }));
      await UserBankDetails.destroy(w({ user_id: ids }));
      await UserAddress.destroy(w({ user_id: ids }));
      await UserProfile.destroy(w({ user_id: ids }));
      await UserRole.destroy(w({ user_id: ids }));
      await User.destroy(w({ id: ids }));
    }
    // villages added for the demo, if nothing uses them any more
    for (const [blockName, names] of Object.entries(VILLAGES)) {
      const block = await MasterBlock.findOne({ where: { block_name: blockName } });
      if (block) await MasterGramPanchayat.destroy(w({ block_id: block.id, gram_panchayat_name: names }));
    }
  });
  log('Demo data removed.');
};

// ── Create ───────────────────────────────────────────────────────────────────────────────────────────────────
const seed = async () => {
  const crops = await MasterCrop.findAll({ where: { is_active: true }, order: [['id', 'ASC']], limit: 3 });
  if (crops.length < 3) throw new Error('Need at least 3 active crops in MASTER_CROP');
  const roles = { Farmer: await roleFor('Farmer'), Pilot: await roleFor('Pilot') };
  const places = { Sanand: await findBlock('Sanand'), Daskroi: await findBlock('Daskroi') };

  log(`Database: ${db.sequelize.config.host}/${db.sequelize.config.database}`);
  log(`Location: ${places.Sanand.state.state_name} > ${places.Sanand.district.district_name} > Sanand, Daskroi (+${Object.values(VILLAGES).flat().length} villages)`);
  log(`People:   ${PEOPLE.map((p) => `${p.first} ${p.last} (${p.role})`).join(', ')}`);
  log(`Drones:   ${DEMO_DRONE_NAME} (pilot ${PEOPLE[2].first}, co-pilot ${PEOPLE[3].first}), ${DEMO_DRONE_2_NAME} (pilot ${PEOPLE[3].first}, co-pilot ${PEOPLE[2].first})`);
  log(`Bookings: ${ORDERS.map((o) => o.key).join(', ')}`);
  if (!apply) return log('\nDry run: nothing written. Add --apply to create it.');

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const created = { users: 0, villages: 0, orders: 0 };

  await db.sequelize.transaction(async (t) => {
    const tx = { transaction: t };

    // 1. fresh location: villages
    const villageIds = {};
    for (const [blockName, names] of Object.entries(VILLAGES)) {
      const { block } = places[blockName];
      for (const name of names) {
        const [row, isNew] = await MasterGramPanchayat.findOrCreate({
          where: { block_id: block.id, gram_panchayat_name: name }, defaults: { is_active: true }, ...tx,
        });
        villageIds[`${blockName}/${name}`] = row.id;
        if (isNew) created.villages += 1;
      }
    }

    // 2. people
    const users = {};
    for (const p of PEOPLE) {
      let user = await User.findOne({ where: { mobile_number: p.mobile }, ...tx });
      if (!user) {
        user = await User.create({
          email: p.email, password: passwordHash, username: `${p.first}_${p.last}`.toLowerCase(), mobile_number: p.mobile,
          is_superuser: false, user_type: p.type, isEmailVerify: true, isMobileVerify: true, is_active: true,
        }, tx);
        await user.update({ user_ref_id: `${p.ref}-${String(user.id).padStart(5, '0')}`, created_by: user.id }, tx);
        await UserRole.create({ user_id: user.id, role_id: roles[p.role].id, created_by: user.id }, tx);
        await UserProfile.create({ user_id: user.id, first_name: p.first, last_name: p.last, whatsapp_number: p.mobile, dob: new Date(p.dob), created_by: user.id }, tx);
        const { block, district, state } = places[p.block];
        await UserAddress.create({
          user_id: user.id, lane_1: p.lane1, lane_2: '', state: state.id, district: district.id, block: block.id,
          village: p.village, pincode: '382110', is_primary: true, is_active: true, created_by: user.id,
        }, tx);
        if (p.farm) {   // a second (non-primary) address is what the app's Farm tab lists
          const f = places[p.farm.block];
          await UserAddress.create({
            user_id: user.id, lane_1: p.farm.lane1, lane_2: '', state: f.state.id, district: f.district.id, block: f.block.id,
            village: p.farm.village, pincode: '382110', is_primary: false, is_active: true, created_by: user.id,
          }, tx);
        }
        if (p.bank) {
          await UserBankDetails.create({
            user_id: user.id, bank_name: p.bank[0], acc_holder_name: p.bank[1], acc_number: p.bank[2], ifsc_code: p.bank[3],
            is_primary: true, is_active: true, created_by: user.id,
          }, tx);
          await UserUpiDetails.create({ user_id: user.id, upi_id: p.upi, created_by: user.id }, tx);
        }
        created.users += 1;
      }
      users[p.key] = user;
    }

    // 3. the drones, their crews and service area
    const droneSpecs = [
      { name: DEMO_DRONE_NAME, pilot: users.pilot1, copilot: users.pilot2, lane: 'Darhub Drone Hub, Sanand GIDC' },
      { name: DEMO_DRONE_2_NAME, pilot: users.pilot2, copilot: users.pilot1, lane: 'Darhub Drone Hub 2, Sanand GIDC' },
    ];
    const drones = {};
    for (const spec of droneSpecs) {
      let drone = await Drone1.findOne({ where: { name: spec.name }, ...tx });
      if (!drone) {
        drone = await Drone1.create({
          name: spec.name, model: 'DJI Agras T40', range: 7000, speed: 10, weight: 38, acres_per_day: 8,
          pilot_user_id: spec.pilot.id, co_pilot_user_id: spec.copilot.id,
          daily_status: true, daily_status_date: todayIST(), is_active: true, created_by: spec.pilot.id,
        }, tx);
        const { block, district, state } = places.Sanand;
        await DroneAddress.create({
          drone_id: drone.id, lane_1: spec.lane, lane_2: '', state: state.id, district: district.id, block: block.id,
          village: 'Sanand', panchayat: villageIds['Sanand/Moraiya'], pincode: '382110', is_active: true, created_by: spec.pilot.id,
        }, tx);
      } else {
        await drone.update({ daily_status: true, daily_status_date: todayIST() }, tx);   // keep it "active today" for the demo
      }
      drones[spec.name] = drone;
    }
    const drone = drones[DEMO_DRONE_NAME];

    // 4. bookings (skipped when this farm + start date already has one)
    for (const o of ORDERS) {
      const farmer = users[o.farmer];
      const start = day(o.start);
      const exists = await SprayingOrder.findOne({ where: { user_id: farmer.id, start_date: start, land_in_acers: o.acres }, ...tx });
      if (exists) continue;

      const crop = crops[o.crop];
      const price = money(Number(crop.price_per_acre || 0) * o.acres);
      const tax = money(price * TAX);
      const bookingId = uuidv4();
      const owner = PEOPLE.find((p) => p.key === o.farmer);
      const { block, district, state } = places[owner.block];

      await SprayingOrder.create({
        booking_id: bookingId, start_date: start, end_date: addDaysUTC(start, o.days - 1), num_of_days: o.days,
        crop_type_id: crop.id, land_in_acers: o.acres, price, tax, discount: 0, total_price: money(price + tax),
        user_id: farmer.id, order_status: o.status, is_paid: Boolean(o.paid),
        created_on: addDaysUTC(new Date(), Math.min(o.start, 0) - 1), created_by: farmer.id,
      }, tx);
      await SprayingOrderAddress.create({
        order_id: bookingId, state: state.id, district: district.id, block: block.id, village: owner.village,
        lane1: o.farm, lane2: '', address1: o.farm, address2: '', pincode: '382110',
      }, tx);

      // timeline: the statuses it passed through
      const path = {
        [S.ORDER_PLACED]: [S.ORDER_PLACED],
        [S.WAITING_FOR_CONFIRMATION]: [S.ORDER_PLACED, S.WAITING_FOR_CONFIRMATION],
        [S.ORDER_ACCEPTED]: [S.ORDER_PLACED, S.WAITING_FOR_CONFIRMATION, S.ORDER_ACCEPTED],
        [S.JOB_STARTED]: [S.ORDER_PLACED, S.WAITING_FOR_CONFIRMATION, S.ORDER_ACCEPTED, S.JOB_STARTED],
        [S.PAYMENT_SUCCESSFUL]: [S.ORDER_PLACED, S.WAITING_FOR_CONFIRMATION, S.ORDER_ACCEPTED, S.JOB_STARTED, S.JOB_ENDED, S.ORDER_COMPLETED, S.PAYMENT_SUCCESSFUL],
        [S.ORDER_CANCELLED]: [S.ORDER_PLACED, S.WAITING_FOR_CONFIRMATION, S.ORDER_CANCELLED],
      }[o.status];
      let when = addDaysUTC(new Date(), Math.min(o.start, 0) - 1);
      for (const status of path) {
        when = new Date(when.getTime() + 3 * 3600 * 1000);
        await SprayingOrderTimeline.create({
          booking_id: bookingId, order_status: status, created_by: farmer.id, created_on: when,
          remarks: status === S.ORDER_CANCELLED ? (o.cancelReason || 'Cancelled by farmer') : undefined,
        }, tx);
      }

      // extras: title, cancellation reason, payment and rating
      const extras = { booking_id: bookingId, service_title: `${crop.name} Spraying`, scheduled_time: '10:00 AM - 12:00 PM', total_payable: money(price + tax) };
      if (o.cancelReason) extras.cancellation_reason = o.cancelReason;
      if (o.paid) Object.assign(extras, {
        farmer_rating: 5, payment_method: 'UPI', payment_status_label: 'Paid', invoice_no: `INV-DEMO-${String(created.orders + 1).padStart(4, '0')}`,
        base_amount: price, total_payable: money(price + tax), online_amount_paid: money(price + tax),
        usage_total_acres_covered: o.acres, usage_fertilizer_kg: 12, usage_pesticide_ltr: 18, usage_water_ltr: 360,
        pilot_rating: 4.9, pilot_review_count: 42, pilot_experience_years: 6,
      });
      await SprayingOrderExtras.create(extras, tx);

      // pilot assignment and working days
      if (o.assign) {
        const crew = { drone, pilot: users.pilot1, copilot: users.pilot2 };
        await SprayingWorkAssignee.create({
          booking_id: bookingId, drone_id: crew.drone.id, pilot_user_id: crew.pilot.id, co_pilot_user_id: crew.copilot.id,
          is_pilot_confirm: o.assign !== 'unconfirmed', is_copilot_confirm: false, is_active: true, created_by: crew.pilot.id,
        }, tx);
        for (let i = 0; i < o.days; i++) {
          const date = addDaysUTC(start, i);
          const confirmed = o.assign !== 'unconfirmed';
          let dayData = null;
          if (o.assign === 'completed') dayData = { day_status: 'completed', started_at: date.toISOString(), saved_at: date.toISOString(), completed_acres: o.acres, fertilizer_used: '12 kg Urea', pesticide_used: '18 L', water_used: '360 L', notes: 'Spraying completed, no issues.' };
          if (o.assign === 'ongoing' && i === 0) dayData = { day_status: 'started', started_at: new Date().toISOString(), completed_acres: 4 };
          await SprayingDailyLogs.create({
            spraying_work_id: bookingId, drone_id: crew.drone.id, pilot_user_id: crew.pilot.id, co_pilot_user_id: crew.copilot.id,
            working_date: date, is_active: true, is_pilot_confirmed: confirmed ? true : null, pilot_confirmed_at: confirmed ? new Date() : null,
            is_verified: o.assign === 'completed' ? true : null, verified_on: o.assign === 'completed' ? date : null,
            verified_by: o.assign === 'completed' ? crew.pilot.id : null,
            verification_comment: dayData ? JSON.stringify(dayData) : null, created_by: crew.pilot.id,
          }, tx);
        }
      }
      created.orders += 1;
    }
  });

  log(`\nCreated ${created.users} user(s), ${created.villages} village(s), ${created.orders} booking(s).`);
  log('\nLogins (password for all: ' + PASSWORD + ')');
  for (const p of PEOPLE) log(`  ${p.role.padEnd(6)} ${p.first} ${p.last}: mobile ${p.mobile}  or  ${p.email}`);
};

// ── Live demo helper: the admin's "assign work" step ──────────────────────────────────────────────────────────
const assignLatest = async () => {
  const { assignWork } = await import('../controllers/availabilityController.js');
  const farmers = await User.findAll({ where: { mobile_number: ['9000000101', '9000000102'] }, attributes: ['id'] });
  const drone = await Drone1.findOne({ where: { name: DEMO_DRONE_2_NAME } });
  if (!drone) throw new Error(`${DEMO_DRONE_2_NAME} does not exist: run node scripts/seed-demo.js --apply first`);

  const candidates = await SprayingOrder.findAll({
    // only bookings made in the last 6 hours: never the seeded ones
    where: {
      user_id: farmers.map((f) => f.id), is_active: true, order_status: [S.ORDER_PLACED, S.WAITING_FOR_CONFIRMATION],
      created_on: { [Op.gte]: new Date(Date.now() - 6 * 3600 * 1000) },
    },
    order: [['created_on', 'DESC']], limit: 20,
  });
  const assigned = new Set((await SprayingWorkAssignee.findAll({ where: { booking_id: candidates.map((o) => o.booking_id) }, attributes: ['booking_id'] })).map((a) => a.booking_id));
  const order = candidates.find((o) => !assigned.has(o.booking_id) && o.start_date >= day(0));
  if (!order) return log('No booking by a demo farmer is waiting for a pilot. Book one in the farmer app first.');

  const dates = Array.from({ length: order.num_of_days || 1 }, (_, i) => addDaysUTC(order.start_date, i).toISOString().slice(0, 10));
  log(`Booking ${order.booking_id.slice(0, 8)} (${dates.join(', ')}) -> ${DEMO_DRONE_2_NAME}, pilot ${PEOPLE[3].first}`);
  if (!apply) return log('Dry run. Add --apply to assign it.');

  const pilot = await User.findOne({ where: { mobile_number: PEOPLE[3].mobile } });
  const req = { params: { booking_id: order.booking_id }, body: { pilot: pilot.id, drone_id: drone.id, working_date: dates }, auth: { id: pilot.id, isAdmin: true }, user: { id: pilot.id }, headers: {}, method: 'POST', originalUrl: '/order/assign-work' };
  let result;
  const res = { statusCode: 200, headersSent: false, status(c) { this.statusCode = c; return this; }, set() { return this; }, json(b) { result = b; this.headersSent = true; return this; } };
  await assignWork(req, res);
  log(res.statusCode < 300 ? `Assigned. ${PEOPLE[3].first} now has a request to accept in the pilot app.` : `Not assigned (${res.statusCode}): ${result?.message} ${JSON.stringify(result?.conflicts || '')}`);
  if (res.statusCode >= 300) process.exitCode = 1;
};

try {
  await syncPromise;   // the models' startup sync must finish before anything runs or the pool is closed
  await (remove ? removeDemo() : assignToday ? assignLatest() : seed());
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await db.sequelize.close();
}
