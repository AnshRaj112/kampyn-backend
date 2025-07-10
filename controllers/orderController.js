// src/controllers/orderController.js

const orderUtils = require("../utils/orderUtils");
const Vendor = require("../models/account/Vendor");
const User = require("../models/account/User");
const Order = require("../models/order/Order");
const Uni = require("../models/account/Uni");
const mongoose = require("mongoose");
const { atomicCache } = require("../utils/cacheUtils");

// Import the shared atomic cancellation function
const { cancelOrderAtomically } = require("../utils/orderUtils");
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

    // Call generateRazorpayOrderForUser instead of createOrderForUser
    const { razorpayOptions, cart, vendorId, orderType: type, collectorName: name, collectorPhone: phone, address: addr, finalTotal } = await orderUtils.generateRazorpayOrderForUser({
      userId,
      orderType,
      collectorName,
      collectorPhone,
      address, // may be undefined if not delivery
    });

    return res.status(201).json({
      success: true,
      razorpayOptions,
      cart,
      vendorId,
      orderType: type,
      collectorName: name,
      collectorPhone: phone,
      address: addr,
      finalTotal,
    });
  } catch (err) {
    console.error("Error in placeOrderHandler:", err);
    
    if (err.code === 11000) {
      // MongoDB duplicate key error
      return res.status(409).json({ 
        success: false, 
        message: "Order number already exists. Please try again.",
        errorType: "DUPLICATE_ORDER_NUMBER"
      });
    }
    
    return res.status(400).json({ success: false, message: err && err.message ? err.message : 'Unknown error occurred' });
  }
};

/**
 * POST /orders/store-details
 * Store order details for mobile payment flow
 */
exports.storeOrderDetails = async (req, res) => {
  try {
    const { razorpayOrderId, userId, cart, vendorId, orderType, collectorName, collectorPhone, address, finalTotal } = req.body;

    console.log("📦 Storing order details for mobile payment:", {
      razorpayOrderId,
      userId,
      cartLength: cart?.length || 0,
      finalTotal
    });

    // Store order details in the pendingOrderDetails map
    const orderUtils = require("../utils/orderUtils");
    const orderDetailsToStore = {
      userId,
      cart,
      vendorId,
      orderType,
      collectorName,
      collectorPhone,
      address,
      finalTotal,
      timestamp: Date.now()
    };
    
    console.log("📦 Storing order details with key:", razorpayOrderId);
    orderUtils.storePendingOrderDetails(razorpayOrderId, orderDetailsToStore);
    
    // Verify storage
    const storedDetails = orderUtils.getPendingOrderDetails(razorpayOrderId);
    console.log("📦 Verification - order details stored successfully:", storedDetails ? "YES" : "NO");

    res.json({
      success: true,
      message: "Order details stored successfully"
    });
  } catch (err) {
    console.error("Error in storeOrderDetails:", err);
    return res.status(500).json({ success: false, message: err.message });
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

    // Orders stay in activeOrders until delivered
    // Only move to pastOrders when status becomes "delivered"

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

    // 1) flip status - handle both "completed" and "onTheWay" statuses
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: { $in: ["completed", "onTheWay"] } },
      { $set: { status: "delivered" } },
      { new: true }
    );

    if (!order) {
      return res.status(400).json({ message: "No completed or on-the-way order found." });
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
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: "completed" }, // only target completed orders
      { status: "onTheWay" },
      { new: true }
    );
    if (!order)
      return res.status(404).json({ success: false, message: "No completed order found." });
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

    // 2) Clean up delivered orders - move them from activeOrders to pastOrders if they're not already there
    if (user.activeOrders && user.activeOrders.length > 0) {
      console.log(`Checking ${user.activeOrders.length} active orders for delivered status`);
      
      const activeOrderIds = user.activeOrders.map(id => id.toString());
      const deliveredOrders = await Order.find(
        { _id: { $in: activeOrderIds }, status: "delivered", deleted: false }
      ).lean();
      
      if (deliveredOrders.length > 0) {
        console.log(`Found ${deliveredOrders.length} delivered orders in active orders, moving to past orders`);
        
        const deliveredOrderIds = deliveredOrders.map(order => order._id);
        await User.updateOne(
          { _id: userId },
          {
            $pull: { activeOrders: { $in: deliveredOrderIds } },
            $push: { pastOrders: { $each: deliveredOrderIds } }
          }
        );
        
        console.log(`Moved ${deliveredOrders.length} delivered orders to past orders`);
      }
    }

    // 3) Fetch updated user data after cleanup
    const updatedUser = await User.findById(userId).lean();
    const pastOrderIds = updatedUser.pastOrders || [];

    // 4) If no past orders, return empty array
    if (pastOrderIds.length === 0) {
      console.log('No past orders found');
      return res.json({
        success: true,
        orders: []
      });
    }

    // 5) Fetch orders from the Order database using the IDs
    const orderIds = pastOrderIds.map(id => id.toString());
    console.log(`Fetching orders with IDs:`, orderIds);

    const orders = await Order.find({ _id: { $in: orderIds }, deleted: false }).lean();

    console.log(`Found ${orders.length} orders in database`);

    // 6) Get vendor details for all orders
    const vendorIds = [...new Set(orders.map(order => order.vendorId).filter(Boolean))];
    console.log(`Fetching vendors with IDs:`, vendorIds);
    
    const vendors = await Vendor.find({ _id: { $in: vendorIds } }, 'fullName uniID').lean();
    const vendorMap = Object.fromEntries(vendors.map(v => [v._id.toString(), v]));
    
    // 7) Get college details for all vendors
    const collegeIds = [...new Set(vendors.map(v => v.uniID).filter(Boolean))];
    console.log(`Fetching colleges with IDs:`, collegeIds);
    
    const colleges = await Uni.find({ _id: { $in: collegeIds } }, 'fullName shortName').lean();
    const collegeMap = Object.fromEntries(colleges.map(c => [c._id.toString(), c]));
    
    // 8) Attach vendor and college details to orders
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

    // 9) Filter orders by college if specified
    let filteredOrders = ordersWithVendors;
    if (collegeId) {
      filteredOrders = ordersWithVendors.filter(order => 
        order.vendorId && 
        order.vendorId.uniID && 
        order.vendorId.uniID.toString() === collegeId
      );
      console.log(`Orders after college filter: ${filteredOrders.length}`);
    }

    // 10) Get detailed order information with items
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
              orderNumber: order.orderNumber || 'Unknown',
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
            orderNumber: order.orderNumber || 'Unknown',
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

/**
 * GET /orders/:orderId
 * Get a specific order by ID with full details
 */
exports.getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required." });
    }

    console.log(`Fetching order details for orderId: ${orderId}`);

    // Get order details using the existing utility function
    const orderDetails = await orderUtils.getOrderWithDetails(orderId);
    
    if (!orderDetails) {
      return res.status(404).json({ message: "Order not found." });
    }

    // Get vendor details
    const vendor = await Vendor.findById(orderDetails.vendorId).select('fullName uniID').lean();
    
    // Get college details if vendor has uniID
    let college = null;
    if (vendor && vendor.uniID) {
      college = await Uni.findById(vendor.uniID).select('fullName shortName').lean();
    }

    // Build the response with vendor and college details
    const response = {
      ...orderDetails,
      vendorId: vendor ? {
        ...vendor,
        college: college
      } : null
    };

    console.log(`Successfully fetched order details for orderId: ${orderId}`);

    return res.json({
      success: true,
      order: response
    });
  } catch (err) {
    console.error("Error in getOrderById:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * Clean up delivered orders - move them from activeOrders to pastOrders
 * This function can be called to fix data inconsistencies
 */
exports.cleanupDeliveredOrders = async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`Cleaning up delivered orders for user: ${userId}`);

    // 1) Fetch user
    const user = await User.findById(userId).lean();

    if (!user) {
      console.log(`User not found: ${userId}`);
      return res.status(404).json({ message: "User not found." });
    }

    if (!user.activeOrders || user.activeOrders.length === 0) {
      console.log('No active orders to check');
      return res.json({ message: "No active orders to check." });
    }

    // 2) Find delivered orders in active orders
    const activeOrderIds = user.activeOrders.map(id => id.toString());
    const deliveredOrders = await Order.find(
      { _id: { $in: activeOrderIds }, status: "delivered", deleted: false }
    ).lean();

    if (deliveredOrders.length === 0) {
      console.log('No delivered orders found in active orders');
      return res.json({ message: "No delivered orders found in active orders." });
    }

    // 3) Move delivered orders to past orders
    const deliveredOrderIds = deliveredOrders.map(order => order._id);
    await User.updateOne(
      { _id: userId },
      {
        $pull: { activeOrders: { $in: deliveredOrderIds } },
        $push: { pastOrders: { $each: deliveredOrderIds } }
      }
    );

    console.log(`Moved ${deliveredOrders.length} delivered orders to past orders`);

    return res.json({ 
      message: `Successfully moved ${deliveredOrders.length} delivered orders to past orders.`,
      movedOrders: deliveredOrderIds
    });
  } catch (err) {
    console.error("Error in cleanupDeliveredOrders:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * GET /orders/active/:userId
 * Get active orders for a user
 */
exports.getUserActiveOrders = async (req, res) => {
  try {
    const { userId } = req.params;
    const { collegeId } = req.query; // Optional college filter

    console.log(`Fetching active orders for user: ${userId}, college filter: ${collegeId || 'none'}`);

    // 1) Fetch user to get active order IDs
    const user = await User.findById(userId).lean();

    if (!user) {
      console.log(`User not found: ${userId}`);
      return res.status(404).json({ message: "User not found." });
    }

    console.log(`User found: ${user.fullName}, active orders count: ${user.activeOrders?.length || 0}`);

    // 2) Clean up delivered orders - move them from activeOrders to pastOrders if they're not already there
    if (user.activeOrders && user.activeOrders.length > 0) {
      console.log(`Checking ${user.activeOrders.length} active orders for delivered status`);
      
      const activeOrderIds = user.activeOrders.map(id => id.toString());
      const deliveredOrders = await Order.find(
        { _id: { $in: activeOrderIds }, status: "delivered", deleted: false }
      ).lean();
      
      if (deliveredOrders.length > 0) {
        console.log(`Found ${deliveredOrders.length} delivered orders in active orders, moving to past orders`);
        
        const deliveredOrderIds = deliveredOrders.map(order => order._id);
        await User.updateOne(
          { _id: userId },
          {
            $pull: { activeOrders: { $in: deliveredOrderIds } },
            $push: { pastOrders: { $each: deliveredOrderIds } }
          }
        );
        
        console.log(`Moved ${deliveredOrders.length} delivered orders to past orders`);
      }
    }

    // 3) Fetch updated user data after cleanup
    const updatedUser = await User.findById(userId).lean();

    // 4) If no active orders, return empty array
    if (!updatedUser.activeOrders || updatedUser.activeOrders.length === 0) {
      console.log('No active orders found');
      return res.json({
        success: true,
        orders: []
      });
    }

    // 5) Fetch orders from the Order database using the IDs
    const orderIds = updatedUser.activeOrders.map(id => id.toString());
    console.log(`Fetching orders with IDs:`, orderIds);

    const orders = await Order.find({ _id: { $in: orderIds }, deleted: false }).lean();

    console.log(`Found ${orders.length} orders in database`);

    // 6) Get vendor details for all orders
    const vendorIds = [...new Set(orders.map(order => order.vendorId).filter(Boolean))];
    console.log(`Fetching vendors with IDs:`, vendorIds);
    
    const vendors = await Vendor.find({ _id: { $in: vendorIds } }, 'fullName uniID').lean();
    const vendorMap = Object.fromEntries(vendors.map(v => [v._id.toString(), v]));
    
    // 7) Get college details for all vendors
    const collegeIds = [...new Set(vendors.map(v => v.uniID).filter(Boolean))];
    console.log(`Fetching colleges with IDs:`, collegeIds);
    
    const colleges = await Uni.find({ _id: { $in: collegeIds } }, 'fullName shortName').lean();
    const collegeMap = Object.fromEntries(colleges.map(c => [c._id.toString(), c]));
    
    // 8) Attach vendor and college details to orders
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

    // 9) Filter orders by college if specified
    let filteredOrders = ordersWithVendors;
    if (collegeId) {
      filteredOrders = ordersWithVendors.filter(order => 
        order.vendorId && 
        order.vendorId.uniID && 
        order.vendorId.uniID.toString() === collegeId
      );
      console.log(`Orders after college filter: ${filteredOrders.length}`);
    }

    // 10) Get detailed order information with items
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
              orderNumber: order.orderNumber || 'Unknown',
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
            orderNumber: order.orderNumber || 'Unknown',
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
    console.error("Error in getUserActiveOrders:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * GET /orders/vendor-past/:vendorId
 * Get past orders for a vendor
 */
exports.getVendorPastOrders = async (req, res) => {
  try {
    const { vendorId } = req.params;

    console.log(`Fetching past orders for vendor: ${vendorId}`);

    // 1) Fetch vendor name
    const vendor = await Vendor.findById(vendorId, "fullName").lean();
    if (!vendor) {
      console.log(`Vendor not found: ${vendorId}`);
      return res.status(404).json({ message: "Vendor not found." });
    }

    // 2) Fetch all past orders (completed, delivered, failed) + item details
    const orders = await orderUtils.getVendorPastOrdersWithDetails(vendorId);

    console.log(`Found ${orders.length} past orders for vendor`);

    // 3) Return combined payload
    return res.json({
      vendorId: vendor._id,
      vendorName: vendor.fullName,
      orders, // array of { orderId, orderType, status, collectorName, collectorPhone, items }
    });
  } catch (err) {
    console.error("Error in getVendorPastOrders:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * POST /orders/guest
 * Creates a guest order for vendors
 * Expects:
 *   Body JSON:
 *     {
 *       vendorId: String,
 *       items: Array,
 *       total: Number,
 *       collectorName: String,
 *       collectorPhone: String,
 *       orderType: "cash",
 *       isGuest: Boolean
 *     }
 */
exports.createGuestOrder = async (req, res) => {
  try {
    const { vendorId, items, total, collectorName, collectorPhone, orderType, paymentMethod, isGuest } = req.body;

    // Basic validation
    if (!vendorId || !items || !total || !collectorName || !collectorPhone || !orderType) {
      return res.status(400).json({
        success: false,
        message: "vendorId, items, total, collectorName, collectorPhone, and orderType are required.",
      });
    }

    // Validate orderType
    if (!["dinein", "takeaway"].includes(orderType)) {
      return res.status(400).json({
        success: false,
        message: "orderType must be either 'dinein' or 'takeaway'.",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Items array must not be empty.",
      });
    }

    // Check if vendor exists
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found.",
      });
    }

    // Check if user exists with the provided phone number
    let userId = null;
    let isNewUser = false;
    const existingUser = await User.findOne({ phone: collectorPhone });
    
    if (existingUser) {
      userId = existingUser._id;
    } else {
      // Create a guest user account
      const guestUser = new User({
        fullName: collectorName,
        phone: collectorPhone,
        email: `guest_${Date.now()}@kiitbites.com`, // Temporary email
        password: "guest_password", // Temporary password
        type: "user-standard",
        isVerified: true,
        uniID: vendor.uniID,
      });
      
      const savedGuestUser = await guestUser.save();
      userId = savedGuestUser._id;
      isNewUser = true;
    }

    // Generate order number using the valid userId
    const orderNumber = await orderUtils.generateOrderNumber(userId, vendorId);

    // Create the order
    const newOrder = await Order.create({
      orderNumber,
      userId,
      orderType: orderType, // Use the orderType from request
      collectorName,
      collectorPhone,
      items: items.map(item => ({
        itemId: item.itemId,
        kind: item.kind,
        quantity: item.quantity
      })),
      total,
      status: "inProgress", // Start directly as in progress since it's cash payment
      vendorId,
      isGuest: true,
      paymentMethod: paymentMethod || "cash", // Store payment method
    });

    // If user exists, add to their active orders
    if (existingUser) {
      await User.findByIdAndUpdate(userId, {
        $push: { activeOrders: newOrder._id }
      });
    }

    return res.status(201).json({
      success: true,
      orderId: newOrder._id,
      orderNumber: newOrder.orderNumber,
      message: "Guest order created successfully",
      isNewUser,
    });

  } catch (err) {
    console.error("Error in createGuestOrder:", err);
    
    if (err.code === 11000) {
      return res.status(409).json({ 
        success: false, 
        message: "Order number already exists. Please try again.",
        errorType: "DUPLICATE_ORDER_NUMBER"
      });
    }
    
    return res.status(400).json({ success: false, message: err && err.message ? err.message : 'Unknown error occurred' });
  }
};

/**
 * GET /api/order/vendor/:vendorId/active
 * Returns all active orders for a vendor with detailed item information
 */
exports.getActiveOrdersByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!vendorId) return res.status(400).json({ error: "Missing vendorId" });

    // Use the utility function that properly populates item details
    const orders = await orderUtils.getOrdersWithDetails(vendorId);
    
    console.log("getActiveOrdersByVendor - Orders found:", orders.length);
    if (orders.length > 0) {
      console.log("First order sample:", {
        orderNumber: orders[0].orderNumber,
        total: orders[0].total,
        totalType: typeof orders[0].total
      });
    }

    res.json({ orders });
  } catch (err) {
    console.error("Error in getActiveOrdersByVendor:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
};

/**
 * POST /orders/:orderId/cancel
 * Cancel a pending order and release item locks
 */
exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log(`Cancelling order: ${orderId}`);

    // Validate orderId
    if (!orderId || orderId === 'undefined') {
      console.log(`Invalid orderId: ${orderId}`);
      return res.status(400).json({ message: "Invalid order ID." });
    }

    // 1) Find the order
    const order = await Order.findOne({ _id: orderId }).lean();
    if (!order) {
      console.log(`Order not found: ${orderId}`);
      return res.status(404).json({ message: "Order not found." });
    }

    // 2) Check if order can be cancelled (only pendingPayment orders)
    if (order.status !== "pendingPayment") {
      console.log(`Order ${orderId} cannot be cancelled - status is ${order.status}`);
      return res.status(400).json({ 
        message: `Order cannot be cancelled. Current status: ${order.status}` 
      });
    }

    // 3) Use database transaction for atomic hard delete
    const session = await mongoose.startSession();
    try {
      const { locksReleased, failedLocks } = await session.withTransaction(async () => {
        // Remove order from user and vendor
        await User.updateOne(
          { _id: order.userId },
          {
            $pull: { activeOrders: orderId, pastOrders: orderId }
          },
          { session }
        );
        await Vendor.updateOne(
          { _id: order.vendorId },
          { $pull: { activeOrders: orderId } },
          { session }
        );
        // Delete the order
        await Order.deleteOne({ _id: orderId }, { session });
        // Release item locks
        const lockReleaseResult = atomicCache.releaseOrderLocks(order.items, order.userId);
        return {
          locksReleased: lockReleaseResult.released.length,
          failedLocks: lockReleaseResult.failed.length
        };
      });
      
      console.log(`Order ${orderId} hard deleted successfully with transaction`);
      return res.json({
        success: true,
        message: "Order cancelled and deleted successfully",
        locksReleased: locksReleased,
        failedLocks: failedLocks
      });
    } catch (error) {
      console.error(`Failed to hard delete order ${orderId} atomically:`, error);
      return res.status(500).json({ 
        message: "Failed to cancel and delete order. Please try again.",
        error: error.message 
      });
    } finally {
      await session.endSession();
    }

  } catch (err) {
    console.error("Error in cancelOrder:", err);
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * POST /orders/:orderId/cancel-manual
 * Manually cancel a pending order (for users who need to cancel manually)
 */
exports.cancelOrderManual = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { userId } = req.body; // User ID for verification
    
    console.log(`Manual cancellation requested for order: ${orderId} by user: ${userId}`);

    // Validate orderId
    if (!orderId || orderId === 'undefined') {
      console.log(`Invalid orderId: ${orderId}`);
      return res.status(400).json({ message: "Invalid order ID." });
    }

    // 1) Find the order and verify ownership
    const order = await Order.findOne({ _id: orderId }).lean();
    if (!order) {
      console.log(`Order not found: ${orderId}`);
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.userId.toString() !== userId) {
      console.log(`User ${userId} not authorized to cancel order ${orderId}`);
      return res.status(403).json({ message: "Not authorized to cancel this order." });
    }

    // 2) Check if order can be cancelled (only pendingPayment orders)
    if (order.status !== "pendingPayment") {
      console.log(`Order ${orderId} cannot be cancelled - status is ${order.status}`);
      return res.status(400).json({ 
        message: `Order cannot be cancelled. Current status: ${order.status}` 
      });
    }

    // 3) Use database transaction for atomic hard delete
    const session = await mongoose.startSession();
    try {
      const { locksReleased, failedLocks } = await session.withTransaction(async () => {
        // Remove order from user and vendor
        await User.updateOne(
          { _id: order.userId },
          {
            $pull: { activeOrders: orderId, pastOrders: orderId }
          },
          { session }
        );
        await Vendor.updateOne(
          { _id: order.vendorId },
          { $pull: { activeOrders: orderId } },
          { session }
        );
        // Delete the order
        await Order.deleteOne({ _id: orderId }, { session });
        // Release item locks
        const lockReleaseResult = atomicCache.releaseOrderLocks(order.items, order.userId);
        return {
          locksReleased: lockReleaseResult.released.length,
          failedLocks: lockReleaseResult.failed.length
        };
      });
      
      console.log(`Order ${orderId} manually hard deleted successfully with transaction`);
      return res.json({
        success: true,
        message: "Order cancelled and deleted successfully",
        locksReleased: locksReleased,
        failedLocks: failedLocks
      });
    } catch (error) {
      console.error(`Failed to manually hard delete order ${orderId} atomically:`, error);
      return res.status(500).json({ 
        message: "Failed to cancel and delete order. Please try again.",
        error: error.message 
      });
    } finally {
      await session.endSession();
    }

  } catch (err) {
    console.error("Error in cancelOrderManual:", err);
    return res.status(500).json({ message: "Server error." });
  }
};
