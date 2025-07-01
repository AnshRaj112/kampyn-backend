const express = require('express');
const router = express.Router();
const {
  getVendorCart,
  addItemToCart,
  updateItemQuantity,
  removeItemFromCart,
  clearVendorCart,
  updateVendorCart
} = require('../controllers/vendorCartController');

// Get vendor cart
router.get('/:vendorId', getVendorCart);

// Add item to vendor cart
router.post('/:vendorId/items', addItemToCart);

// Update item quantity in vendor cart
router.put('/:vendorId/items/:itemId', updateItemQuantity);

// Remove item from vendor cart
router.delete('/:vendorId/items/:itemId', removeItemFromCart);

// Clear vendor cart
router.delete('/:vendorId', clearVendorCart);

// Update entire vendor cart
router.put('/:vendorId', updateVendorCart);

module.exports = router; 