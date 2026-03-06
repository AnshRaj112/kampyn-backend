const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const mongoose = require('mongoose');
const Order = require('./models/order/Order');
const Produce = require('./models/item/Produce');
const db = require('./config/db');

async function check() {
  await db.connectDB();
  const unknownOrder = await Order.findOne({ "items.itemId": "690c3de0e5bef9f6c36fbdd6" }).lean();
  console.log("Found Order with that ID:", unknownOrder ? "Yes" : "No");

  const produce = await Produce.findById("690c3de0e5bef9f6c36fbdd6").lean();
  console.log("Produce item exists in DB:", produce ? produce.name : "NO - DELETED");
  process.exit(0);
}
check();
