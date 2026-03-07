
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, 'kampyn-backend', '.env') });

const mongoose = require('mongoose');
const { Cluster_Order, Cluster_Accounts } = require('./kampyn-backend/config/db');

// Define models if not already defined on connections
const orderSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    status: String,
    deleted: { type: Boolean, default: false }
}, { strict: false });

const userSchema = new mongoose.Schema({
    email: String,
    pastOrders: [mongoose.Schema.Types.ObjectId]
}, { strict: false });

async function check() {
    try {
        const Order = Cluster_Order.model('Order', orderSchema);
        const User = Cluster_Accounts.model('User', userSchema);

        // Wait for connections to be ready
        await Promise.all([
            Cluster_Order.asPromise(),
            Cluster_Accounts.asPromise()
        ]);

        const totalOrders = await Order.countDocuments({});
        const deletedFalseOrders = await Order.countDocuments({ deleted: false });
        const deletedTrueOrders = await Order.countDocuments({ deleted: true });
        const deletedMissingOrders = await Order.countDocuments({ deleted: { $exists: false } });

        console.log('Total Orders:', totalOrders);
        console.log('Deleted False:', deletedFalseOrders);
        console.log('Deleted True:', deletedTrueOrders);
        console.log('Deleted Missing:', deletedMissingOrders);

        const users = await User.find({ pastOrders: { $exists: true, $not: { $size: 0 } } }).limit(5);
        for (const user of users) {
            console.log(`User ${user.email} has ${user.pastOrders.length} past orders`);
            const foundOrders = await Order.find({ _id: { $in: user.pastOrders }, deleted: false });
            console.log(`  Found with {deleted: false}: ${foundOrders.length}`);

            const foundAllOrders = await Order.find({ _id: { $in: user.pastOrders } });
            console.log(`  Found total (without filter): ${foundAllOrders.length}`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
