// src/controllers/orderController.js

const orderUtils = require("../../utils/orderUtils");
const Vendor = require("../../models/account/Vendor");
const User = require("../../models/account/User");
const Order = require("../../models/order/Order");
const Uni = require("../../models/account/Uni");
const Retail = require("../../models/item/Retail");
const Produce = require("../../models/item/Produce");
const mongoose = require("mongoose");
const { atomicCache } = require("../../utils/cacheUtils");
const logger = require("../../utils/pinoLogger");

// Import the shared atomic cancellation function
const { cancelOrderAtomically } = require("../../utils/orderUtils");
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
    logger.error({ error: err.message }, "Error in placeOrderHandler");
    
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

    logger.info({
      razorpayOrderId,
      userId,
      cartLength: cart?.length || 0,
      finalTotal
    }, "Storing order details for mobile payment");

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
    
    logger.debug({ razorpayOrderId }, "Storing order details with key");
    orderUtils.storePendingOrderDetails(razorpayOrderId, orderDetailsToStore);
    
    // Verify storage
    const storedDetails = orderUtils.getPendingOrderDetails(razorpayOrderId);
    logger.debug({ stored: !!storedDetails }, "Verification - order details stored successfully");

    res.json({
      success: true,
      message: "Order details stored successfully"
    });
  } catch (err) {
    logger.error({ error: err.message }, "Error in storeOrderDetails");
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
    logger.error({ error: err.message }, "Error in getActiveOrders");
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
      { _id: orderId, status: { $in: ["inProgress", "ready"] } }, // allow both in-progress and ready orders
      { $set: { status: "completed" } }, // update status to completed
      { new: true } // return the updated doc
    );

    if (!result) {
      return res
        .status(400)
        .json({ message: "No active in-progress or ready order found." });
    }

    // Orders stay in activeOrders until delivered
    // Only move to pastOrders when status becomes "delivered"

    return res.json({ message: "Order marked as completed." });
  } catch (err) {
    logger.error({ error: err.message }, "Error in getActiveOrders");
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * PATCH /orders/:orderId/deliver
 */
exports.deliverOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    // 1) flip status - handle completed, onTheWay, ready, and inProgress statuses
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: { $in: ["completed", "onTheWay", "ready", "inProgress"] } },
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
    logger.error({ error: err.message }, "Error in getActiveOrders");
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
      { _id: orderId, status: { $in: ["completed", "ready"] } }, // allow both completed and ready orders
      { status: "onTheWay" },
      { new: true }
    );
    if (!order)
      return res.status(404).json({ success: false, message: "No completed or ready order found." });
    res.json({ success: true, data: order });
  } catch (err) {
    logger.error({ error: err.message }, "Error in getPastOrders");
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

    logger.debug({ userId, collegeId: collegeId || 'none' }, 'Fetching past orders for user');

    // 1) Fetch user to get past order IDs
    const user = await User.findById(userId).lean();

    if (!user) {
      logger.info({ userId }, 'User not found');
      return res.status(404).json({ message: "User not found." });
    }

    logger.debug({ userId, userName: user.fullName, pastOrdersCount: user.pastOrders?.length || 0 }, 'User found');

    // 2) Clean up delivered orders - move them from activeOrders to pastOrders if they're not already there
    if (user.activeOrders && user.activeOrders.length > 0) {
      logger.debug({ activeOrdersCount: user.activeOrders.length }, 'Checking active orders for delivered status');
      
      const activeOrderIds = user.activeOrders.map(id => id.toString());
      const deliveredOrders = await Order.find(
        { _id: { $in: activeOrderIds }, status: "delivered", deleted: false }
      ).lean();
      
      if (deliveredOrders.length > 0) {
        logger.info({ deliveredOrdersCount: deliveredOrders.length }, 'Found delivered orders in active orders, moving to past orders');
        
        const deliveredOrderIds = deliveredOrders.map(order => order._id);
        await User.updateOne(
          { _id: userId },
          {
            $pull: { activeOrders: { $in: deliveredOrderIds } },
            $push: { pastOrders: { $each: deliveredOrderIds } }
          }
        );
        
        logger.info({ movedCount: deliveredOrders.length }, 'Moved delivered orders to past orders');
      }
    }

    // 3) Fetch updated user data after cleanup
    const updatedUser = await User.findById(userId).lean();
    const pastOrderIds = updatedUser.pastOrders || [];

    // 4) If no past orders, return empty array
    if (pastOrderIds.length === 0) {
      logger.debug('No past orders found');
      return res.json({
        success: true,
        orders: []
      });
    }

    // 5) Fetch orders from the Order database using the IDs
    const orderIds = pastOrderIds.map(id => id.toString());
    logger.debug({ orderIds }, 'Fetching orders with IDs');

    const orders = await Order.find({ _id: { $in: orderIds }, deleted: false }).lean();

    logger.debug({ ordersCount: orders.length }, 'Found orders in database');

    // 6) Get vendor details for all orders
    const vendorIds = [...new Set(orders.map(order => order.vendorId).filter(Boolean))];
    logger.debug({ vendorIds }, 'Fetching vendors with IDs');
    
    const vendors = await Vendor.find({ _id: { $in: vendorIds } }, 'fullName uniID').lean();
    const vendorMap = Object.fromEntries(vendors.map(v => [v._id.toString(), v]));
    
    // 7) Get college details for all vendors
    const collegeIds = [...new Set(vendors.map(v => v.uniID).filter(Boolean))];
    logger.debug({ collegeIds }, 'Fetching colleges with IDs');
    
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
      
      logger.debug({ orderId: order._id, vendorId: result.vendorId }, 'Order vendor data');
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
      logger.debug({ filteredOrdersCount: filteredOrders.length }, 'Orders after college filter');
    }

    // 10) Get detailed order information with items
    logger.debug({ filteredOrdersCount: filteredOrders.length }, 'Processing orders for detailed information');
    const detailedOrders = await Promise.all(
      filteredOrders.map(async (order, index) => {
        try {
          logger.debug({ orderIndex: index + 1, totalOrders: filteredOrders.length, orderId: order._id }, 'Processing order');
          const orderDetails = await orderUtils.getOrderWithDetails(order._id);
          if (orderDetails) {
            return {
              ...order,
              ...orderDetails,
              vendorId: order.vendorId // Preserve the vendor info we built with college details
            };
          } 
            logger.warn({ orderId: order._id }, 'No details found for order');
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
          
        } catch (error) {
          logger.error({ error: error.message, orderId: order._id }, 'Error getting details for order');
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

    logger.info({ processedOrdersCount: detailedOrders.length }, 'Successfully processed orders');

    // Debug: Log the first order to see the structure
    if (detailedOrders.length > 0) {
      logger.debug({ vendorId: detailedOrders[0].vendorId }, 'Sample order vendor data');
    }

    return res.json({
      success: true,
      orders: detailedOrders
    });
  } catch (err) {
    logger.error({ error: err.message }, "Error in getPastOrders");
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

    logger.debug({ orderId }, 'Fetching order details for orderId');

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

    logger.info({ orderId }, 'Successfully fetched order details for orderId');

    return res.json({
      success: true,
      order: response
    });
  } catch (err) {
    logger.error({ error: err.message }, "Error in getOrderById");
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

    logger.info({ userId }, 'Cleaning up delivered orders for user');

    // 1) Fetch user
    const user = await User.findById(userId).lean();

    if (!user) {
      logger.info({ userId }, 'User not found');
      return res.status(404).json({ message: "User not found." });
    }

    if (!user.activeOrders || user.activeOrders.length === 0) {
      logger.debug('No active orders to check');
      return res.json({ message: "No active orders to check." });
    }

    // 2) Find delivered orders in active orders
    const activeOrderIds = user.activeOrders.map(id => id.toString());
    const deliveredOrders = await Order.find(
      { _id: { $in: activeOrderIds }, status: "delivered", deleted: false }
    ).lean();

    if (deliveredOrders.length === 0) {
      logger.debug('No delivered orders found in active orders');
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

    logger.info({ movedCount: deliveredOrders.length }, 'Moved delivered orders to past orders');

    return res.json({ 
      message: `Successfully moved ${deliveredOrders.length} delivered orders to past orders.`,
      movedOrders: deliveredOrderIds
    });
  } catch (err) {
    logger.error({ error: err.message }, "Error in cleanupDeliveredOrders");
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

    logger.debug({ userId, collegeId: collegeId || 'none' }, 'Fetching active orders for user');

    // 1) Fetch user to get active order IDs
    const user = await User.findById(userId).lean();

    if (!user) {
      logger.info({ userId }, 'User not found');
      return res.status(404).json({ message: "User not found." });
    }

    logger.debug({ userId, userName: user.fullName, activeOrdersCount: user.activeOrders?.length || 0 }, 'User found');

    // 2) Clean up delivered orders - move them from activeOrders to pastOrders if they're not already there
    if (user.activeOrders && user.activeOrders.length > 0) {
      logger.debug({ activeOrdersCount: user.activeOrders.length }, 'Checking active orders for delivered status');
      
      const activeOrderIds = user.activeOrders.map(id => id.toString());
      const deliveredOrders = await Order.find(
        { _id: { $in: activeOrderIds }, status: "delivered", deleted: false }
      ).lean();
      
      if (deliveredOrders.length > 0) {
        logger.info({ deliveredOrdersCount: deliveredOrders.length }, 'Found delivered orders in active orders, moving to past orders');
        
        const deliveredOrderIds = deliveredOrders.map(order => order._id);
        await User.updateOne(
          { _id: userId },
          {
            $pull: { activeOrders: { $in: deliveredOrderIds } },
            $push: { pastOrders: { $each: deliveredOrderIds } }
          }
        );
        
        logger.info({ movedCount: deliveredOrders.length }, 'Moved delivered orders to past orders');
      }
    }

    // 3) Fetch updated user data after cleanup
    const updatedUser = await User.findById(userId).lean();

    // 4) If no active orders, return empty array
    if (!updatedUser.activeOrders || updatedUser.activeOrders.length === 0) {
      logger.debug('No active orders found');
      return res.json({
        success: true,
        orders: []
      });
    }

    // 5) Fetch orders from the Order database using the IDs
    const orderIds = updatedUser.activeOrders.map(id => id.toString());
    logger.debug({ orderIds }, 'Fetching orders with IDs');

    const orders = await Order.find({ _id: { $in: orderIds }, deleted: false }).lean();

    logger.debug({ ordersCount: orders.length }, 'Found orders in database');

    // 6) Get vendor details for all orders
    const vendorIds = [...new Set(orders.map(order => order.vendorId).filter(Boolean))];
    logger.debug({ vendorIds }, 'Fetching vendors with IDs');
    
    const vendors = await Vendor.find({ _id: { $in: vendorIds } }, 'fullName uniID').lean();
    const vendorMap = Object.fromEntries(vendors.map(v => [v._id.toString(), v]));
    
    // 7) Get college details for all vendors
    const collegeIds = [...new Set(vendors.map(v => v.uniID).filter(Boolean))];
    logger.debug({ collegeIds }, 'Fetching colleges with IDs');
    
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
      
      logger.debug({ orderId: order._id, vendorId: result.vendorId }, 'Order vendor data');
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
      logger.debug({ filteredOrdersCount: filteredOrders.length }, 'Orders after college filter');
    }

    // 10) Get detailed order information with items
    logger.debug({ filteredOrdersCount: filteredOrders.length }, 'Processing orders for detailed information');
    const detailedOrders = await Promise.all(
      filteredOrders.map(async (order, index) => {
        try {
          logger.debug({ orderIndex: index + 1, totalOrders: filteredOrders.length, orderId: order._id }, 'Processing order');
          const orderDetails = await orderUtils.getOrderWithDetails(order._id);
          if (orderDetails) {
            return {
              ...order,
              ...orderDetails,
              vendorId: order.vendorId // Preserve the vendor info we built with college details
            };
          } 
            logger.warn({ orderId: order._id }, 'No details found for order');
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
          
        } catch (error) {
          logger.error({ error: error.message, orderId: order._id }, 'Error getting details for order');
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

    logger.info({ processedOrdersCount: detailedOrders.length }, 'Successfully processed orders');

    // Debug: Log the first order to see the structure
    if (detailedOrders.length > 0) {
      logger.debug({ vendorId: detailedOrders[0].vendorId }, 'Sample order vendor data');
    }

    return res.json({
      success: true,
      orders: detailedOrders
    });
  } catch (err) {
    logger.error({ error: err.message }, "Error in getUserActiveOrders");
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

    logger.debug({ vendorId }, 'Fetching past orders for vendor');

    // 1) Fetch vendor name
    const vendor = await Vendor.findById(vendorId, "fullName").lean();
    if (!vendor) {
      logger.info({ vendorId }, 'Vendor not found');
      return res.status(404).json({ message: "Vendor not found." });
    }

    // 2) Fetch all past orders (completed, delivered, failed) + item details
    const orders = await orderUtils.getVendorPastOrdersWithDetails(vendorId);

    logger.info({ ordersCount: orders.length, vendorId }, 'Found past orders for vendor');

    // 3) Return combined payload
    return res.json({
      vendorId: vendor._id,
      vendorName: vendor.fullName,
      orders, // array of { orderId, orderType, status, collectorName, collectorPhone, items }
    });
  } catch (err) {
    logger.error({ error: err.message }, "Error in getVendorPastOrders");
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * GET /orders/delivery/:vendorId
 * Get delivery orders (onTheWay status) for a vendor
 */
exports.getDeliveryOrders = async (req, res) => {
  try {
    const { vendorId } = req.params;

    logger.debug({ vendorId }, 'Fetching delivery orders for vendor');

    // 1) Fetch vendor name
    const vendor = await Vendor.findById(vendorId, "fullName").lean();
    if (!vendor) {
      logger.info({ vendorId }, 'Vendor not found');
      return res.status(404).json({ message: "Vendor not found." });
    }

    // 2) Fetch all delivery orders (onTheWay status) + item details
    const orders = await orderUtils.getDeliveryOrdersWithDetails(vendorId);

    logger.info({ ordersCount: orders.length, vendorId }, 'Found delivery orders for vendor');

    // 3) Return combined payload
    return res.json({
      vendorId: vendor._id,
      vendorName: vendor.fullName,
      orders, // array of { orderId, orderType, status, collectorName, collectorPhone, items }
    });
  } catch (err) {
    logger.error({ error: err.message }, "Error in getDeliveryOrders");
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
    logger.error({ error: err.message }, "Error in createGuestOrder");
    
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
    
    logger.info({ ordersCount: orders.length }, "getActiveOrdersByVendor - Orders found");
    if (orders.length > 0) {
      logger.debug({
        orderNumber: orders[0].orderNumber,
        total: orders[0].total,
        totalType: typeof orders[0].total
      }, "First order sample");
    }

    res.json({ orders });
  } catch (err) {
    logger.error({ error: err.message }, "Error in getActiveOrdersByVendor");
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
    
    logger.info({ orderId }, 'Cancelling order');

    // Validate orderId
    if (!orderId || orderId === 'undefined') {
      logger.warn({ orderId }, 'Invalid orderId');
      return res.status(400).json({ message: "Invalid order ID." });
    }

    // 1) Find the order
    const order = await Order.findOne({ _id: orderId }).lean();
    if (!order) {
      logger.info({ orderId }, 'Order not found');
      return res.status(404).json({ message: "Order not found." });
    }

    // 2) Check if order can be cancelled (only pendingPayment orders)
    if (order.status !== "pendingPayment") {
      logger.warn({ orderId, status: order.status }, 'Order cannot be cancelled - invalid status');
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
      
      logger.info({ orderId }, 'Order hard deleted successfully with transaction');
      return res.json({
        success: true,
        message: "Order cancelled and deleted successfully",
        locksReleased: locksReleased,
        failedLocks: failedLocks
      });
    } catch (error) {
      logger.error({ error: error.message, orderId }, 'Failed to hard delete order atomically');
      return res.status(500).json({ 
        message: "Failed to cancel and delete order. Please try again.",
        error: error.message 
      });
    } finally {
      await session.endSession();
    }

  } catch (err) {
    logger.error({ error: err.message }, "Error in cancelOrder");
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
    
    logger.info({ orderId, userId }, 'Manual cancellation requested for order');

    // Validate orderId
    if (!orderId || orderId === 'undefined') {
      logger.warn({ orderId }, 'Invalid orderId');
      return res.status(400).json({ message: "Invalid order ID." });
    }

    // 1) Find the order and verify ownership
    const order = await Order.findOne({ _id: orderId }).lean();
    if (!order) {
      logger.info({ orderId }, 'Order not found');
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.userId.toString() !== userId) {
      logger.warn({ userId, orderId }, 'User not authorized to cancel order');
      return res.status(403).json({ message: "Not authorized to cancel this order." });
    }

    // 2) Check if order can be cancelled (only pendingPayment orders)
    if (order.status !== "pendingPayment") {
      logger.warn({ orderId, status: order.status }, 'Order cannot be cancelled - invalid status');
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
      
      logger.info({ orderId }, 'Order manually hard deleted successfully with transaction');
      return res.json({
        success: true,
        message: "Order cancelled and deleted successfully",
        locksReleased: locksReleased,
        failedLocks: failedLocks
      });
    } catch (error) {
      logger.error({ error: error.message, orderId }, 'Failed to manually hard delete order atomically');
      return res.status(500).json({ 
        message: "Failed to cancel and delete order. Please try again.",
        error: error.message 
      });
    } finally {
      await session.endSession();
    }

  } catch (err) {
    logger.error({ error: err.message }, "Error in cancelOrderManual");
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * PATCH /orders/:orderId/ready
 */
exports.readyOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await Order.findOneAndUpdate(
      { _id: orderId, status: "inProgress" },
      { $set: { status: "ready" } },
      { new: true }
    );
    if (!result) {
      return res.status(400).json({ message: "No active in-progress order found to mark as ready." });
    }
    return res.json({ message: "Order marked as ready." });
  } catch (err) {
    logger.error({ error: err.message }, "Error in getActiveOrders");
    return res.status(500).json({ message: "Server error." });
  }
};

/**
 * GET /order/analytics/:vendorId?date=YYYY-MM-DD
 * Returns analytics for a vendor for the given day, week, and month
 */
exports.getVendorAnalytics = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const date = req.query.date ? new Date(req.query.date) : new Date();

    // Calculate start/end for day, week, month
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay() + 1); // Monday as first day
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);

    // Helper to fetch orders in a range
    const getOrders = (start) =>
      Order.find({
        vendorId,
        createdAt: { $gte: start, $lte: date },
        deleted: false
      }).lean();

    const [ordersDay, ordersWeek, ordersMonth] = await Promise.all([
      getOrders(startOfDay),
      getOrders(startOfWeek),
      getOrders(startOfMonth)
    ]);

    // Helper to aggregate stats with proper item name resolution
    async function aggregate(orders) {
      const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
      const totalOrders = orders.length;
      const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0;
      const uniqueCustomers = new Set(orders.map(o => o.collectorPhone)).size;
      
      // Collect all item IDs by kind
      const retailIds = new Set();
      const produceIds = new Set();
      orders.forEach(order => {
        (order.items || []).forEach(item => {
          if (item.kind === "Retail") {
            retailIds.add(item.itemId.toString());
          } else if (item.kind === "Produce") {
            produceIds.add(item.itemId.toString());
          }
        });
      });

      // Fetch item details
      const [retails, produces] = await Promise.all([
        Retail.find({ _id: { $in: [...retailIds] } }, "name").lean(),
        Produce.find({ _id: { $in: [...produceIds] } }, "name").lean(),
      ]);

      // Build lookup maps
      const retailMap = Object.fromEntries(retails.map(r => [r._id.toString(), r.name]));
      const produceMap = Object.fromEntries(produces.map(p => [p._id.toString(), p.name]));

      // Aggregate item stats with proper names
      const itemStats = {};
      orders.forEach(order => {
        (order.items || []).forEach(item => {
          let itemName = item.name; // Use existing name if available
          if (!itemName) {
            // Fallback to looking up by ID
            if (item.kind === "Retail") {
              itemName = retailMap[item.itemId.toString()] || `Unknown Retail Item (${item.itemId})`;
            } else if (item.kind === "Produce") {
              itemName = produceMap[item.itemId.toString()] || `Unknown Produce Item (${item.itemId})`;
            } else {
              itemName = `Unknown Item (${item.itemId})`;
            }
          }
          itemStats[itemName] = (itemStats[itemName] || 0) + item.quantity;
        });
      });

      return { totalRevenue, totalOrders, avgOrderValue, uniqueCustomers, itemStats };
    }

    const [dayStats, weekStats, monthStats] = await Promise.all([
      aggregate(ordersDay),
      aggregate(ordersWeek),
      aggregate(ordersMonth)
    ]);

    res.json({
      success: true,
      day: dayStats,
      week: weekStats,
      month: monthStats,
      ordersDay, // for graphing
    });
  } catch (err) {
    logger.error({ error: err.message }, "Error in getPastOrders");
    res.status(500).json({ success: false, message: 'Analytics error', error: err.message });
  }
};
