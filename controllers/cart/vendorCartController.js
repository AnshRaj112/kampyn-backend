const VendorCart = require('../../models/account/VendorCart');
const logger = require('../../utils/pinoLogger');

// Get vendor cart
const getVendorCart = async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID is required'
      });
    }

    let vendorCart = await VendorCart.findOne({ vendorId });
    
    // If no cart exists, create an empty one
    if (!vendorCart) {
      vendorCart = new VendorCart({
        vendorId,
        items: [],
        total: 0
      });
      await vendorCart.save();
    } else {
      // Recalculate total with current packing charges to ensure accuracy
      vendorCart.total = await calculateTotalWithPacking(vendorCart.items, vendorId);
      await vendorCart.save();
    }

    res.json({
      success: true,
      data: vendorCart
    });
  } catch (error) {
    logger.error('Error getting vendor cart:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Calculate total with packing charges
const calculateTotalWithPacking = async (items, vendorId) => {
  const itemTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  // Use consistent logic: produce items are always packable, retail items only if packable property is true
  const packableItems = items.filter(item => 
    item.kind === "Produce" || item.packable === true
  );
  
  // Get university packing charge
  let packingCharge = 5; // Default packing charge
  try {
    const Vendor = require('../models/account/Vendor');
    const Uni = require('../models/account/Uni');
    
    const vendor = await Vendor.findById(vendorId).select('uniID').lean();
    if (vendor && vendor.uniID) {
      const university = await Uni.findById(vendor.uniID).select('packingCharge').lean();
      if (university && university.packingCharge !== undefined) {
        packingCharge = university.packingCharge;
      }
    }
  } catch (error) {
    logger.error('Error fetching university packing charge:', error);
    // Use default packing charge if fetch fails
  }
  
  const packingTotal = packableItems.reduce((sum, item) => sum + (packingCharge * item.quantity), 0);
  return itemTotal + packingTotal;
};

// Add item to vendor cart
const addItemToCart = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { item } = req.body;
    
    if (!vendorId || !item) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID and item are required'
      });
    }

    let vendorCart = await VendorCart.findOne({ vendorId });
    
    if (!vendorCart) {
      vendorCart = new VendorCart({
        vendorId,
        items: [],
        total: 0
      });
    }

    // Check if item already exists in cart
    const existingItemIndex = vendorCart.items.findIndex(
      cartItem => cartItem.itemId === item.itemId
    );

    if (existingItemIndex !== -1) {
      // Update quantity of existing item
      vendorCart.items[existingItemIndex].quantity += item.quantity || 1;
    } else {
      // Add new item
      vendorCart.items.push({
        itemId: item.itemId,
        name: item.name,
        price: item.price,
        quantity: item.quantity || 1,
        kind: item.kind,
        type: item.type,
        isSpecial: item.isSpecial || 'N',
        isAvailable: item.isAvailable || 'Y'
      });
    }

    // Calculate total with packing charges
    vendorCart.total = await calculateTotalWithPacking(vendorCart.items, vendorId);
    await vendorCart.save();

    res.json({
      success: true,
      data: vendorCart
    });
  } catch (error) {
    logger.error('Error adding item to vendor cart:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update item quantity in vendor cart
const updateItemQuantity = async (req, res) => {
  try {
    const { vendorId, itemId } = req.params;
    const { quantity } = req.body;
    
    if (!vendorId || !itemId || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID, item ID, and quantity are required'
      });
    }

    const vendorCart = await VendorCart.findOne({ vendorId });
    
    if (!vendorCart) {
      return res.status(404).json({
        success: false,
        message: 'Vendor cart not found'
      });
    }

    const itemIndex = vendorCart.items.findIndex(
      item => item.itemId === itemId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    if (quantity <= 0) {
      // Remove item if quantity is 0 or negative
      vendorCart.items.splice(itemIndex, 1);
    } else {
      // Update quantity
      vendorCart.items[itemIndex].quantity = quantity;
    }

    // Calculate total with packing charges
    vendorCart.total = await calculateTotalWithPacking(vendorCart.items, vendorId);
    await vendorCart.save();

    res.json({
      success: true,
      data: vendorCart
    });
  } catch (error) {
    logger.error('Error updating item quantity in vendor cart:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Remove item from vendor cart
const removeItemFromCart = async (req, res) => {
  try {
    const { vendorId, itemId } = req.params;
    
    if (!vendorId || !itemId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID and item ID are required'
      });
    }

    const vendorCart = await VendorCart.findOne({ vendorId });
    
    if (!vendorCart) {
      return res.status(404).json({
        success: false,
        message: 'Vendor cart not found'
      });
    }

    vendorCart.items = vendorCart.items.filter(
      item => item.itemId !== itemId
    );

    // Calculate total with packing charges
    vendorCart.total = await calculateTotalWithPacking(vendorCart.items, vendorId);
    await vendorCart.save();

    res.json({
      success: true,
      data: vendorCart
    });
  } catch (error) {
    logger.error('Error removing item from vendor cart:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Clear vendor cart
const clearVendorCart = async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID is required'
      });
    }

    const vendorCart = await VendorCart.findOne({ vendorId });
    
    if (!vendorCart) {
      return res.status(404).json({
        success: false,
        message: 'Vendor cart not found'
      });
    }

    vendorCart.items = [];
    vendorCart.total = 0;
    await vendorCart.save();

    res.json({
      success: true,
      data: vendorCart
    });
  } catch (error) {
    logger.error('Error clearing vendor cart:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update entire vendor cart
const updateVendorCart = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { items } = req.body;
    
    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID is required'
      });
    }

    let vendorCart = await VendorCart.findOne({ vendorId });
    
    if (!vendorCart) {
      vendorCart = new VendorCart({
        vendorId,
        items: [],
        total: 0
      });
    }

    vendorCart.items = items || [];
    
    // Calculate total with packing charges
    vendorCart.total = await calculateTotalWithPacking(vendorCart.items, vendorId);
    await vendorCart.save();

    res.json({
      success: true,
      data: vendorCart
    });
  } catch (error) {
    logger.error('Error updating vendor cart:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getVendorCart,
  addItemToCart,
  updateItemQuantity,
  removeItemFromCart,
  clearVendorCart,
  updateVendorCart
}; 