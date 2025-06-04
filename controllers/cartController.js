// controllers/cartController.js
const User = require("../models/account/User");
const Vendor = require("../models/account/Vendor");
const cartUtils = require("../utils/cartUtils");


exports.addToCart = async (req, res) => {
 try {
   const { userId } = req.params;
   const { itemId, kind, quantity, vendorId } = req.body;


   // 1) Basic validation
   if (!itemId || !kind || !quantity || quantity <= 0 || !vendorId) {
     return res.status(400).json({
       message:
         "itemId, kind, vendorId, and a positive quantity are required.",
     });
   }


   // 2) Ensure the user exists
   const user = await User.findById(userId).select("_id");
   if (!user) {
     return res.status(404).json({ message: "User not found." });
   }


   // 3) Ensure the vendor exists (so we return 404 if the client passed a bogus vendorId)
   const vendor = await Vendor.findById(vendorId).select("_id");
   if (!vendor) {
     return res.status(404).json({ message: "Vendor not found." });
   }


   // 4) Delegate all “inventory,” “one-vendor-per-cart,” and “save” logic into cartUtils
   //    We pass exactly the same vendorId that the client sent.
   await cartUtils.addToCart(userId, itemId, kind, Number(quantity), vendorId);


   return res
     .status(200)
     .json({ message: "Item added to cart successfully." });
 } catch (err) {
   console.error("Add to cart error:", err.message);
   return res.status(400).json({ message: err.message });
 }
};


exports.getCart = async (req, res) => {
 try {
   const { userId } = req.params;
   const data = await cartUtils.getCartDetails(userId);
   return res.status(200).json({
     cart: data.cart,
     vendorId: data.vendorId,
     vendorName: data.vendorName,
   });
 } catch (err) {
   console.error("Get cart error:", err.message);
   return res.status(400).json({ message: err.message });
 }
};


exports.increaseOne = async (req, res) => {
 try {
   const { userId } = req.params;
   const { itemId, kind } = req.body;
   if (!itemId || !kind) {
     return res.status(400).json({ message: "itemId and kind are required." });
   }
   await cartUtils.changeQuantity(userId, itemId, kind, +1);
   return res.status(200).json({ message: "Quantity increased." });
 } catch (err) {
   console.error("Increase one error:", err.message);
   return res.status(400).json({ message: err.message });
 }
};


exports.decreaseOne = async (req, res) => {
 try {
   const { userId } = req.params;
   const { itemId, kind } = req.body;
   if (!itemId || !kind) {
     return res.status(400).json({ message: "itemId and kind are required." });
   }
   await cartUtils.changeQuantity(userId, itemId, kind, -1);
   return res.status(200).json({ message: "Quantity decreased." });
 } catch (err) {
   console.error("Decrease one error:", err.message);
   return res.status(400).json({ message: err.message });
 }
};


exports.removeItem = async (req, res) => {
 try {
   const { userId } = req.params;
   const { itemId, kind } = req.body;
   if (!itemId || !kind) {
     return res.status(400).json({ message: "itemId and kind are required." });
   }
   await cartUtils.removeItem(userId, itemId, kind);
   return res.status(200).json({ message: "Item removed from cart." });
 } catch (err) {
   console.error("Remove item error:", err.message);
   return res.status(400).json({ message: err.message });
 }
};


exports.getExtras = async (req, res) => {
 try {
   const { userId } = req.params;
   const extras = await cartUtils.getExtras(userId);
   return res.status(200).json({
     message: extras.length
       ? "Extras from the same vendor."
       : "No extra items found.",
     extras,
   });
 } catch (err) {
   console.error("Get extras error:", err.message);
   return res.status(400).json({ message: err.message });
 }
};