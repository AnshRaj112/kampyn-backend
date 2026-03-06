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
    console.log("Recent order with produce:");
    console.log(JSON.stringify(order.items, null, 2));

    const id = order.items.find(i => i.kind === 'Produce').itemId;
    const produce = await Produce.findById(id).lean();
    console.log("Mapped Produce name:", produce?.name);
  } else {
    console.log("No orders found");
  }
  process.exit(0);
}
check();
