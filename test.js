import db from './models/index.js';

async function test() {
  const assignees = await db.SprayingWorkAssignee.findAll({
    where: { booking_id: '9158e507-5312-49ec-9a78-883569c38dca' }
  });
  console.log("ASSIGNEES:");
  console.log(assignees.map(a => a.toJSON()));
  process.exit(0);
}
test();
