const VendorCart = require('../models/account/VendorCart');

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
    }

    res.json({
      success: true,
      data: vendorCart
    });
  } catch (error) {
    console.error('Error getting vendor cart:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
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

    await vendorCart.save();

    res.json({
      success: true,
      data: vendorCart
    });
  } catch (error) {
    console.error('Error adding item to vendor cart:', error);
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

    await vendorCart.save();

    res.json({
      success: true,
      data: vendorCart
    });
  } catch (error) {
    console.error('Error updating item quantity in vendor cart:', error);
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

    await vendorCart.save();

    res.json({
      success: true,
      data: vendorCart
    });
  } catch (error) {
    console.error('Error removing item from vendor cart:', error);
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
    await vendorCart.save();

    res.json({
      success: true,
      data: vendorCart
    });
  } catch (error) {
    console.error('Error clearing vendor cart:', error);
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
    await vendorCart.save();

    res.json({
      success: true,
      data: vendorCart
    });
  } catch (error) {
    console.error('Error updating vendor cart:', error);
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