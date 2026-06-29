import db from './models/index.js';

async function test() {
  try {
    const f = await db.Fertilizer.findAll({ limit: 5 });
    console.log("VALUES:", f.map(r => ({ id: r.id, name: r.name, created_on: r.created_on })));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
test();
