// src/controllers/orderController.js

const orderUtils = require("../utils/orderUtils");
const Vendor = require("../models/account/Vendor");
const User = require("../models/account/User");
const Order = require("../models/order/Order");
const Uni = require("../models/account/Uni");
/**
 * POST /orders/:userId
 * Expects:
 *   URL param:  userId
 *   Body JSON:
 *     {
 *       orderType:       "takeaway" | "delivery" | "dinein",
 *       collectorName:   String,
 *       collectorPhone:  String,
 *       address?:        String   // required if orderType === "delivery"
 *     }
 */
exports.placeOrderHandler = async (req, res) => {
  try {
    const { userId } = req.params;
    const { orderType, collectorName, collectorPhone, address } = req.body;

    // Basic validation: ensure those fields exist
    if (!orderType || !collectorName || !collectorPhone) {
      return res.status(400).json({
        success: false,
        message:
          "orderType, collectorName, and collectorPhone are required in the request body.",
      });
    }

    // Call createOrderForUser with the new signature
    const { orderId, razorpayOptions } = await orderUtils.createOrderForUser({
      userId,
      orderType,
      collectorName,
      collectorPhone,
      address, // may be undefined if not delivery
    });

    return res.status(201).json({
      success: true,
      orderId,
      razorpayOptions,
    });
  } catch (err) {
    console.error("Error in placeOrderHandler:", err);
    return res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * GET /orders/active/:vendorId/:orderType?
 */
exports.getActiveOrders = async (req, res) => {
  try {
    const { vendorId, orderType } = req.params;

    // 1) Fetch vendor name
    const vendor = await Vendor.findById(vendorId, "fullName").lean();
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found." });
    }

    // 2) Fetch all matching orders + item details
    const orders = await orderUtils.getOrdersWithDetails(vendorId, orderType);

    // 3) Return combined payload
    return res.json({
      vendorId: vendor._id,
      vendorName: vendor.fullName,
      orders, // array of { orderId, orderType, status, collectorName, collectorPhone, items }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * PATCH /orders/:orderId/complete
 */
exports.completeOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await Order.findOneAndUpdate(
      { _id: orderId, status: "inProgress" }, // only target in-progress
      { $set: { status: "completed" } }, // only update status
      { new: true } // return the updated doc
    );

    if (!result) {
      return res
        .status(400)
        .json({ message: "No active in-progress order found." });
    }

    return res.json({ message: "Order marked as completed." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * PATCH /orders/:orderId/deliver
 */
exports.deliverOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    // 1) flip status
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: "completed" },
      { $set: { status: "delivered" } },
      { new: true }
    );

    if (!order) {
      return res.status(400).json({ message: "No completed order found." });
    }

    // 2) move in User doc
    await User.updateOne(
      { _id: order.userId },
      {
        $pull: { activeOrders: order._id },
        $push: { pastOrders: order._id },
      }
    );

    return res.json({ message: "Order delivered and user records updated." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * Move an order from completed ➔ onTheWay
 */
exports.startDelivery = async (req, res) => {
  const { orderId } = req.params;
  try {
    const order = await Order.findByIdAndUpdate(
      orderId,
      { status: "onTheWay" },
      { new: true }
    );
    if (!order)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /orders/past/:userId
 * Get past orders for a user
 */
exports.getPastOrders = async (req, res) => {
  try {
    const { userId } = req.params;
    const { collegeId } = req.query; // Optional college filter

    console.log(`Fetching past orders for user: ${userId}, college filter: ${collegeId || 'none'}`);

    // 1) Fetch user to get past order IDs
    const user = await User.findById(userId).lean();

    if (!user) {
      console.log(`User not found: ${userId}`);
      return res.status(404).json({ message: "User not found." });
    }

    console.log(`User found: ${user.fullName}, past orders count: ${user.pastOrders?.length || 0}`);

    // 2) If no past orders, return empty array
    if (!user.pastOrders || user.pastOrders.length === 0) {
      console.log('No past orders found');
      return res.json({
        success: true,
        orders: []
      });
    }

    // 3) Fetch orders from the Order database using the IDs
    const orderIds = user.pastOrders.map(id => id.toString());
    console.log(`Fetching orders with IDs:`, orderIds);

    const orders = await Order.find({ _id: { $in: orderIds } }).lean();

    console.log(`Found ${orders.length} orders in database`);

    // 4) Get vendor details for all orders
    const vendorIds = [...new Set(orders.map(order => order.vendorId).filter(Boolean))];
    console.log(`Fetching vendors with IDs:`, vendorIds);
    
    const vendors = await Vendor.find({ _id: { $in: vendorIds } }, 'fullName uniID').lean();
    const vendorMap = Object.fromEntries(vendors.map(v => [v._id.toString(), v]));
    
    // 5) Get college details for all vendors
    const collegeIds = [...new Set(vendors.map(v => v.uniID).filter(Boolean))];
    console.log(`Fetching colleges with IDs:`, collegeIds);
    
    const colleges = await Uni.find({ _id: { $in: collegeIds } }, 'fullName shortName').lean();
    const collegeMap = Object.fromEntries(colleges.map(c => [c._id.toString(), c]));
    
    // 6) Attach vendor and college details to orders
    const ordersWithVendors = orders.map(order => {
      const vendor = order.vendorId ? vendorMap[order.vendorId.toString()] : null;
      const college = vendor && vendor.uniID ? collegeMap[vendor.uniID.toString()] : null;
      
      const result = {
        ...order,
        vendorId: vendor ? {
          ...vendor,
          college: college
        } : null
      };
      
      console.log(`Order ${order._id} vendor data:`, result.vendorId);
      return result;
    });

    // 7) Filter orders by college if specified
    let filteredOrders = ordersWithVendors;
    if (collegeId) {
      filteredOrders = ordersWithVendors.filter(order => 
        order.vendorId && 
        order.vendorId.uniID && 
        order.vendorId.uniID.toString() === collegeId
      );
      console.log(`Orders after college filter: ${filteredOrders.length}`);
    }

    // 8) Get detailed order information with items
    console.log(`Processing ${filteredOrders.length} orders for detailed information`);
    const detailedOrders = await Promise.all(
      filteredOrders.map(async (order, index) => {
        try {
          console.log(`Processing order ${index + 1}/${filteredOrders.length}: ${order._id}`);
          const orderDetails = await orderUtils.getOrderWithDetails(order._id);
          if (orderDetails) {
            return {
              ...order,
              ...orderDetails,
              vendorId: order.vendorId // Preserve the vendor info we built with college details
            };
          } else {
            console.log(`No details found for order: ${order._id}`);
            // If order details not found, return basic order info
            return {
              _id: order._id,
              orderId: order._id,
              orderType: order.orderType || 'unknown',
              status: order.status || 'unknown',
              createdAt: order.createdAt,
              collectorName: order.collectorName || 'Unknown',
              collectorPhone: order.collectorPhone || 'Unknown',
              address: order.address || '',
              total: order.total || 0,
              vendorId: order.vendorId, // Preserve the vendor info we built
              items: []
            };
          }
        } catch (error) {
          console.error(`Error getting details for order ${order._id}:`, error);
          // Return basic order info if details fetch fails
          return {
            _id: order._id,
            orderId: order._id,
            orderType: order.orderType || 'unknown',
            status: order.status || 'unknown',
            createdAt: order.createdAt,
            collectorName: order.collectorName || 'Unknown',
            collectorPhone: order.collectorPhone || 'Unknown',
            address: order.address || '',
            total: order.total || 0,
            vendorId: order.vendorId, // Preserve the vendor info we built
            items: []
          };
        }
      })
    );

    console.log(`Successfully processed ${detailedOrders.length} orders`);

    // Debug: Log the first order to see the structure
    if (detailedOrders.length > 0) {
      console.log('Sample order vendor data:', detailedOrders[0].vendorId);
    }

    return res.json({
      success: true,
      orders: detailedOrders
    });
  } catch (err) {
    console.error("Error in getPastOrders:", err);
    return res.status(500).json({ message: "Server error." });
  }
};
