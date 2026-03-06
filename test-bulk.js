const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const mongoose = require('mongoose');
const Order = require('./models/order/Order');
const Produce = require('./models/item/Produce');
const db = require('./config/db');

async function check() {
  await db.connectDB();
  const order = await Order.findOne({ "items.kind": "Produce" }).sort({ createdAt: -1 });
  if (order) {
    const produceIds = new Set();
    order.items.forEach(item => {
      if (item.kind === 'Produce') produceIds.add(item.itemId.toString());
    });

    // Simulate what the controller does:
    const produces = await Produce.find({ _id: { $in: [...produceIds] } }, "name").lean();
    console.log("Raw produces from DB:", JSON.stringify(produces));

    const produceMap = Object.fromEntries(produces.map(p => [p._id.toString(), p.name]));
    console.log("Produce Map:", JSON.stringify(produceMap));

    order.items.forEach(item => {
      if (item.kind === 'Produce') {
        console.log(`Lookup for ${item.itemId}:`, produceMap[item.itemId.toString()] || "NOT FOUND");
      }
    });

  }
  process.exit(0);
}
check();
