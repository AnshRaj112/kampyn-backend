// utils/cartUtils.js


const mongoose = require("mongoose");
const User = require("../models/account/User");
const Vendor = require("../models/account/Vendor");
const Retail = require("../models/item/Retail");
const Produce = require("../models/item/Produce");


/**
* Maximum allowed quantity per single item in cart:
*  - Retail:  15
*  - Produce: 10
*/
const MAX_QTY = {
 Retail: 15,
 Produce: 10,
};


/**
* Convert a string (or ObjectId) → mongoose.Types.ObjectId
*/
function toObjectId(id) {
 return new mongoose.Types.ObjectId(id);
}


/**
* Given "Retail" or "Produce," return the correct Mongoose model
*/
function _itemModel(kind) {
 if (kind === "Retail") return Retail;
 if (kind === "Produce") return Produce;
 throw new Error("Invalid kind");
}


/**
* Fetch a lean copy of the item (so we can read uniId, price, name, etc.)
*/
async function getItem(itemId, kind) {
 return await _itemModel(kind)
   .findById(itemId)
   .select("uniId price name image unit type")
   .lean();
}


/**
* Validate that the given vendorId actually "carries" this item AND that stock/availability
* are okay. Also enforce the "one-vendor-per-cart" rule.
*
* Steps:
*  1) kind must be "Retail" or "Produce"
*  2) the item must exist (so we can read its .uniId)
*  3) the vendor must exist (we queried it in the controller already, but we'll fetch it fresh here)
*  4) check that vendor.uniID === item.uniId. If not, we throw "Vendor does not carry item for that uni."
*  5) look inside vendor.retailInventory or vendor.produceInventory for that itemId
*     – if Retail: check `quantity ≥ desiredQty` AND `(quantity - desiredQty) ≥ MAX_QTY["Retail"]`
*     – if Produce: check `isAvailable === "Y"` and `desiredQty ≤ MAX_QTY["Produce"]`
*  6) enforce "if user.vendorId exists, it must === vendorId."  (One-vendor-per-cart.)
*
* Returns: { vendorId, availableStock } or throws a descriptive Error.
*/
async function _validateAndFetch(
 user,
 itemId,
 kind,
 desiredQty = 1,
 vendorIdFromController
) {
 // 1) kind check
 if (!["Retail", "Produce"].includes(kind)) {
   throw new Error("Invalid kind provided");
 }


 // 2) fetch the item (to read its uniId)
 const itemDoc = await getItem(itemId, kind);
 if (!itemDoc) {
   throw new Error("Item not found");
 }


 // 3) fetch the exact vendor document by _id
 const vendor = await Vendor.findById(vendorIdFromController)
   .select("uniID retailInventory produceInventory")
   .lean();
 if (!vendor) {
   throw new Error("Vendor not found");
 }


 // 4) ensure the vendor's uniID matches the item's uniId
 if (!vendor.uniID || vendor.uniID.toString() !== itemDoc.uniId.toString()) {
   throw new Error("Vendor does not carry item for that university");
 }


 // 5) look inside the correct inventory array for that vendor
 let availableStock;
 if (kind === "Retail") {
   // For retail items, check the retailInventory
   const entry = vendor.retailInventory.find(
     (inv) => inv.itemId.toString() === itemId.toString()
   );
   if (!entry) {
     throw new Error("Vendor does not carry this Retail item");
   }

   // For retail items, check quantity directly from the entry
   const invQty = entry.quantity || 0;
   console.log(`Retail item quantity check:`, {
     itemId,
     vendorId: vendorIdFromController,
     quantity: invQty,
     desiredQty
   });

   if (desiredQty > invQty) {
     throw new Error(`Only ${invQty} unit(s) available`);
   }
   availableStock = invQty;
 } else {
   // kind === "Produce"
   const entry = vendor.produceInventory.find(
     (inv) => inv.itemId.toString() === itemId.toString()
   );
   if (!entry) {
     throw new Error("Vendor does not carry this Produce item");
   }

   if (entry.isAvailable !== "Y") {
     throw new Error("Produce item is not available");
   }
   availableStock = MAX_QTY["Produce"];
 }


 // 6) one-vendor-per-cart rule:
 if (user.vendorId) {
   if (user.vendorId.toString() !== vendorIdFromController.toString()) {
     throw new Error("Cart can contain items from only one vendor");
   }
 }


 return {
   vendorId: vendorIdFromController.toString(),
   available: availableStock,
 };
}


/**
* addToCart:
*
* 1) Load the User (not lean).
* 2) _validateAndFetch(user, itemId, kind, qty, vendorIdFromController) → { vendorId, available }.
* 3) Compute newQty = (existingQtyInCart) + qty. Ensure newQty ≤ MAX_QTY[kind] and newQty ≤ available.
* 4) Either increment existing entry or push a new { itemId, kind, quantity }.
* 5) If user.vendorId was empty, set it to the vendorIdFromController.
* 6) Save the user document exactly once.
*
* If any step throws, nothing was saved or we throw before persisting partial state.
*/
async function addToCart(userId, itemId, kind, qty, vendorIdFromController) {
 // 1) load user
 const user = await User.findById(userId).select("cart vendorId");
 if (!user) {
   throw new Error("User not found");
 }


 // 2) validate item‐vendor pairing, stock, fail-safe, one-vendor-per-cart
 const { vendorId: realVendorId, available } = await _validateAndFetch(
   user,
   itemId,
   kind,
   qty,
   vendorIdFromController
 );


 // 3) enforce per‐item max and available stock
 const MAX_ALLOWED = MAX_QTY[kind];
 const oItemId = toObjectId(itemId);
 const existingEntry = user.cart.find(
   (e) => e.itemId.toString() === itemId.toString() && e.kind === kind
 );
 const existingQty = existingEntry ? existingEntry.quantity : 0;
 const newQty = existingQty + qty;


 if (newQty > MAX_ALLOWED) {
   throw new Error(
     `Cannot exceed max quantity of ${MAX_ALLOWED} for a single ${kind} item`
   );
 }
 if (newQty > available) {
   throw new Error(`Only ${available} unit(s) available`);
 }


 // 4) update or push the cart entry
 if (existingEntry) {
   existingEntry.quantity = newQty;
 } else {
   user.cart.push({ itemId: oItemId, kind, quantity: newQty });
 }


 // 5) if this was the first item, set user.vendorId now
 if (!user.vendorId) {
   user.vendorId = realVendorId;
 }


 // 6) save once
 await user.save();
}


/**
* changeQuantity:
*
* - If delta > 0, re-validate via _validateAndFetch(user, itemId, kind, newQty, user.vendorId).
* - If delta < 0, ensure entry exists; decrement or remove if newQty=0.
* - If cart becomes empty, unset vendorId.
* - If item not in cart and delta > 0 and vendorId is provided, add the item using addToCart logic.
*/
async function changeQuantity(userId, itemId, kind, delta, vendorId = null) {
 const user = await User.findById(userId).select("cart vendorId");
 if (!user) {
   throw new Error("User not found");
 }

 const oItemId = toObjectId(itemId);
 const entryIndex = user.cart.findIndex(
   (e) => e.itemId.toString() === itemId.toString() && e.kind === kind
 );

 // If decreasing and item not in cart
 if (entryIndex === -1 && delta < 0) {
   throw new Error("Item not in cart");
 }

 const currentQty = entryIndex >= 0 ? user.cart[entryIndex].quantity : 0;
 const newQty = currentQty + delta;

 if (newQty < 0) {
   throw new Error("Quantity cannot go below zero");
 }

 // If increasing and item not in cart, and vendorId is provided, use addToCart logic
 if (delta > 0 && entryIndex === -1 && vendorId) {
   // Use addToCart logic to add the item with quantity = delta
   await module.exports.addToCart(userId, itemId, kind, delta, vendorId);
   return;
 }

 // If increasing, re-validate (stock, max, one-vendor-per-cart)
 if (delta > 0) {
   await _validateAndFetch(
     user,
     itemId,
     kind,
     newQty,
     user.vendorId.toString()
   );

   const MAX_ALLOWED = MAX_QTY[kind];
   if (newQty > MAX_ALLOWED) {
     throw new Error(
       `Cannot exceed max quantity of ${MAX_ALLOWED} for a single ${kind} item`
     );
   }
 }

 // Apply the change
 if (entryIndex >= 0) {
   if (newQty === 0) {
     user.cart.splice(entryIndex, 1);
   } else {
     user.cart[entryIndex].quantity = newQty;
   }
 }

 // If cart is now empty, unset vendorId
 if (user.cart.length === 0) {
   user.vendorId = undefined;
 }

 await user.save();
}


/**
* removeItem: drop a specific (itemId, kind) from the cart.
* If cart becomes empty, unset vendorId.
*/
async function removeItem(userId, itemId, kind) {
 const user = await User.findById(userId).select("cart vendorId");
 if (!user) {
   throw new Error("User not found");
 }


 user.cart = user.cart.filter(
   (e) => !(e.itemId.toString() === itemId.toString() && e.kind === kind)
 );


 if (user.cart.length === 0) {
   user.vendorId = undefined;
 }


 await user.save();
}


/**
* getCartDetails:
* - Load user.cart & vendorId (lean).
* - If vendorId exists, fetch its fullName.
* - Batch-fetch all Retail & Produce item docs.
* - Assemble the "detailedCart" array.
*/
async function getCartDetails(userId) {
 const user = await User.findById(userId).select("cart vendorId").lean();
 if (!user) {
   throw new Error("User not found");
 }


 let vendorName = null;
 if (user.vendorId) {
   const vend = await Vendor.findById(user.vendorId).select("fullName").lean();
   if (vend) vendorName = vend.fullName;
 }


 const entries = user.cart;
 if (!entries.length) {
   return { cart: [], vendorId: null, vendorName: null };
 }


 const retailIds = [];
 const produceIds = [];
 entries.forEach((e) => {
   if (e.kind === "Retail") {
     retailIds.push(toObjectId(e.itemId));
   } else {
     produceIds.push(toObjectId(e.itemId));
   }
 });


 const [retailDocs, produceDocs] = await Promise.all([
   retailIds.length
     ? Retail.find({ _id: { $in: retailIds } })
         .select("name image unit price type packable")
         .lean()
     : [],
   produceIds.length
     ? Produce.find({ _id: { $in: produceIds } })
         .select("name image unit price type packable")
         .lean()
     : [],
 ]);


 const retailMap = new Map(retailDocs.map((d) => [d._id.toString(), d]));
 const produceMap = new Map(produceDocs.map((d) => [d._id.toString(), d]));


 const detailedCart = entries
   .map((e) => {
     const idStr = e.itemId.toString();
     const doc =
       e.kind === "Retail" ? retailMap.get(idStr) : produceMap.get(idStr);
     if (!doc) return null;


     return {
       itemId: doc._id,
       name: doc.name,
       image: doc.image,
       unit: doc.unit,
       price: doc.price,
       quantity: e.quantity,
       kind: e.kind,
       type: doc.type,
       packable: doc.packable,
       totalPrice: doc.price * e.quantity,
     };
   })
   .filter(Boolean);


 return {
   cart: detailedCart,
   vendorId: user.vendorId,
   vendorName,
 };
}


/**
* getExtras:
* - Load user.cart & vendorId (lean).
* - If no cart or no vendorId, return [].
* - Fetch that vendor's full retailInventory & produceInventory.
* - Build a Set of itemIds already in the cart.
* - Filter:
*     • Retail entries with quantity > MAX_QTY["Retail"] AND not in cart
*     • Produce entries with isAvailable === "Y" AND not in cart
* - Batch-fetch those IDs and return a merged extras array.
*/
async function getExtras(userId) {
 const user = await User.findById(userId).select("cart vendorId").lean();
 if (!user) throw new Error("User not found");
 if (!user.cart.length || !user.vendorId) {
   return [];
 }


 const vendorData = await Vendor.findById(user.vendorId)
   .select("retailInventory produceInventory")
   .lean();
 if (!vendorData) return [];


 const inCartSet = new Set(user.cart.map((e) => e.itemId.toString()));
 const MAX_R = MAX_QTY["Retail"];


 // Filter Retail extras
 const retailExtrasIds = vendorData.retailInventory
   .filter((inv) => inv.itemId && inv.quantity > MAX_R)
   .map((inv) => inv.itemId.toString())
   .filter((id) => !inCartSet.has(id));


 // Filter Produce extras
 const produceExtrasIds = vendorData.produceInventory
   .filter((inv) => inv.itemId && inv.isAvailable === "Y")
   .map((inv) => inv.itemId.toString())
   .filter((id) => !inCartSet.has(id));


 if (!retailExtrasIds.length && !produceExtrasIds.length) {
   return [];
 }


 const [retailDocs, produceDocs] = await Promise.all([
   retailExtrasIds.length
     ? Retail.find({ _id: { $in: retailExtrasIds.map(toObjectId) } })
         .select("name price image")
         .lean()
     : [],
   produceExtrasIds.length
     ? Produce.find({ _id: { $in: produceExtrasIds.map(toObjectId) } })
         .select("name price image")
         .lean()
     : [],
 ]);


 const extras = [];


 retailDocs.forEach((doc) => {
   extras.push({
     itemId: doc._id,
     name: doc.name,
     price: doc.price,
     image: doc.image,
     kind: "Retail",
   });
 });
 produceDocs.forEach((doc) => {
   extras.push({
     itemId: doc._id,
     name: doc.name,
     price: doc.price,
     image: doc.image,
     kind: "Produce",
   });
 });


 return extras;
}


module.exports = {
 addToCart,
 changeQuantity,
 removeItem,
 getCartDetails,
 getExtras,
};