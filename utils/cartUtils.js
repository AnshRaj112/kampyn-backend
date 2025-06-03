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
 * Helper: convert a string (or ObjectId) → ObjectId instance
 */
function toObjectId(id) {
  return new mongoose.Types.ObjectId(id);
}

/**
 * 1) Return the correct Mongoose model for a given "kind"
 */
function _itemModel(kind) {
  if (kind === "Retail") return Retail;
  if (kind === "Produce") return Produce;
  throw new Error("Invalid kind");
}

/**
 * 2) Fetch item details by ID (lean) so we can read `uniId` & other fields
 */
async function getItem(itemId, kind) {
  return await _itemModel(kind)
    .findById(itemId)
    .select("uniId price name image unit type")
    .lean();
}

/**
 * 3) Find the Vendor document that carries this item AND project only the single
 *    matching inventory sub‐document (so we never fetch the entire inventory array).
 *
 *    Returns something like:
 *      { _id, retailInventory: [ { itemId, quantity } ] }
 *    or
 *      { _id, produceInventory: [ { itemId, isAvailable } ] }
 */
async function _findVendorEntry(itemId, kind, uniId) {
  const oId = toObjectId(itemId);

  if (kind === "Retail") {
    return await Vendor.findOne(
      { uniID: uniId, "retailInventory.itemId": oId },
      { "retailInventory.$": 1 } // only the matching retailInventory element
    )
      .select("_id")
      .lean();
  } else {
    // kind === "Produce"
    return await Vendor.findOne(
      { uniID: uniId, "produceInventory.itemId": oId },
      { "produceInventory.$": 1 } // only the matching produceInventory element
    )
      .select("_id")
      .lean();
  }
}

/**
 * 4) Shared validation & fetch logic:
 *    - Ensure `kind` is either "Retail" or "Produce"
 *    - Ensure the item exists
 *    - Ensure a vendor carries that item (and get exactly that one inventory sub‐doc)
 *    - For Retail: check that `desiredQty <= vendorQuantity`
 *      * ALSO: (fail‐safe) if after removing `desiredQty`, vendor's remaining stock < MAX_QTY["Retail"], we refuse.
 *    - For Produce: ensure `isAvailable === "Y"`, and allow desiredQty ≤ MAX_QTY["Produce"]
 *    - Enforce "one‐vendor‐per‐cart" rule: if the user already has a vendor in cart, it must match.
 *
 *    Returns `{ vendorId, available }` or throws an Error.
 */
async function _validateAndFetch(user, itemId, kind, desiredQty = 1) {
  // 4.1) Kind must be valid
  if (!["Retail", "Produce"].includes(kind)) {
    throw new Error("Invalid kind provided");
  }

  // 4.2) Fetch item doc (to read uniId)
  const itemDoc = await getItem(itemId, kind);
  if (!itemDoc) {
    throw new Error("Item not found");
  }

  // 4.3) Find vendor + single inventory entry
  const vendorData = await _findVendorEntry(itemId, kind, itemDoc.uniId);
  if (!vendorData) {
    throw new Error("Vendor for item not found");
  }

  const vendorId = vendorData._id;
  let available = 0;

  if (kind === "Retail") {
    // 4.4) Retail: check vendor's quantity
    const invQty = vendorData.retailInventory[0]?.quantity || 0;
    if (desiredQty > invQty) {
      throw new Error(`Only ${invQty} unit(s) available`);
    }

    // === FAIL‐SAFE CHECK FOR RETAIL ===
    // If (invQty - desiredQty) < MAX_QTY["Retail"], refuse.
    const remainingAfter = invQty - desiredQty;
    if (remainingAfter < MAX_QTY["Retail"]) {
      throw new Error(
        `Cannot add to cart: vendor stock would drop below minimum required of ${MAX_QTY["Retail"]}`
      );
    }
    available = invQty;
  } else {
    // 4.5) Produce: ensure "isAvailable === 'Y'"
    const inv = vendorData.produceInventory[0];
    if (!inv || inv.isAvailable !== "Y") {
      throw new Error("Produce item is not available");
    }

    // Now allow up to MAX_QTY["Produce"]
    available = MAX_QTY["Produce"];
  }

  // 4.6) One‐vendor‐per‐cart rule
  if (user.vendorId && user.vendorId.toString() !== vendorId.toString()) {
    throw new Error("Cart can contain items from only one vendor");
  }

  return { vendorId, available };
}

/**
 * 5) addToCart:
 *    - Load the User once (not `.lean()`, because we'll modify & then `.save()`).
 *    - Run `_validateAndFetch(...)` to ensure item exists, vendor exists, stock + fail‐safe passed.
 *    - Compute newQty = (existingQty in cart) + qty
 *      * Enforce newQty ≤ MAX_QTY[kind].
 *    - Either increment the existing entry or push a fresh { itemId, kind, quantity }.
 *    - If user.vendorId was empty, set it now.
 *    - Save the User document.
 */
async function addToCart(userId, itemId, kind, qty, vendorId) {
  const user = await User.findById(userId).select("cart vendorId");
  if (!user) {
    throw new Error("User not found");
  }

  // Convert vendorId to ObjectId
  const oVendorId = toObjectId(vendorId);

  // Check if vendor exists
  const vendor = await Vendor.findById(oVendorId);
  if (!vendor) {
    throw new Error("Vendor not found");
  }

  // Check if item exists in vendor's inventory
  const itemDoc = await getItem(itemId, kind);
  if (!itemDoc) {
    throw new Error("Item not found");
  }

  // Validate stock and availability
  let available = 0;
  if (kind === "Retail") {
    const inv = vendor.retailInventory.find(i => i.itemId.toString() === itemId);
    if (!inv) {
      throw new Error("Item not found in vendor's inventory");
    }
    available = inv.quantity;
    if (qty > available) {
      throw new Error(`Only ${available} unit(s) available`);
    }
  } else {
    const inv = vendor.produceInventory.find(i => i.itemId.toString() === itemId);
    if (!inv || inv.isAvailable !== "Y") {
      throw new Error("Produce item is not available");
    }
    available = MAX_QTY[kind];
  }

  const MAX_ALLOWED = MAX_QTY[kind];

  // See if the item is already in the cart
  const oItemId = toObjectId(itemId);
  const existingEntry = user.cart.find(
    (e) => e.itemId.toString() === itemId.toString() && e.kind === kind
  );
  const existingQty = existingEntry ? existingEntry.quantity : 0;
  const newQty = existingQty + qty;

  // Enforce max-per-item limit
  if (newQty > MAX_ALLOWED) {
    throw new Error(
      `Cannot exceed max quantity of ${MAX_ALLOWED} for a single ${kind} item`
    );
  }

  // Enforce vendor stock again
  if (newQty > available) {
    throw new Error(`Only ${available} unit(s) available`);
  }

  // One-vendor-per-cart rule
  if (user.vendorId && user.vendorId.toString() !== vendorId.toString()) {
    throw new Error("Cart can contain items from only one vendor");
  }

  // Update or push
  if (existingEntry) {
    existingEntry.quantity = newQty;
  } else {
    user.cart.push({ itemId: oItemId, kind, quantity: newQty });
  }

  // Set vendorId on user if not already set
  if (!user.vendorId) {
    user.vendorId = oVendorId;
  }

  await user.save();
}

/**
 * 6) changeQuantity:
 *    - If delta > 0, re‐validate via `_validateAndFetch(...)` (which now treats Produce up to 10).
 *    - If delta < 0, ensure the item exists in cart; decrement or remove if newQty=0.
 */
async function changeQuantity(userId, itemId, kind, delta) {
  const user = await User.findById(userId).select("cart vendorId");
  if (!user) {
    throw new Error("User not found");
  }

  const oItemId = toObjectId(itemId);
  const entryIndex = user.cart.findIndex(
    (e) => e.itemId.toString() === itemId.toString() && e.kind === kind
  );

  if (entryIndex === -1 && delta < 0) {
    throw new Error("Item not in cart");
  }

  const currentQty = entryIndex >= 0 ? user.cart[entryIndex].quantity : 0;
  const newQty = currentQty + delta;

  if (newQty < 0) {
    throw new Error("Quantity cannot go below zero");
  }

  // If increasing, re‐validate (this now allows Produce up to 10)
  if (delta > 0) {
    await _validateAndFetch(user, itemId, kind, newQty);

    // Also enforce max‐per‐item for both kinds
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
  } else {
    // entryIndex < 0 AND delta>0 → push new entry
    user.cart.push({ itemId: oItemId, kind, quantity: newQty });
  }

  // If cart is now empty, unset vendorId
  if (user.cart.length === 0) {
    user.vendorId = undefined;
  }

  await user.save();
}

/**
 * 7) removeItem: remove a specific (itemId, kind) from the user's cart
 */
async function removeItem(userId, itemId, kind) {
  const user = await User.findById(userId).select("cart vendorId");
  if (!user) {
    throw new Error("User not found");
  }

  user.cart = user.cart.filter(
    (e) => !(e.itemId.toString() === itemId.toString() && e.kind === kind)
  );

  // If cart now empty → unset vendorId
  if (user.cart.length === 0) {
    user.vendorId = undefined;
  }

  await user.save();
}

/**
 * 8) getCartDetails:
 *    - Load user.cart & vendorId (lean, because we won't modify).
 *    - If vendorId exists, fetch vendorName via `.select("fullName").lean()`.
 *    - Split cart entries by kind → two arrays of ObjectId.
 *    - Batch‐fetch Retail items & Produce items (each is one .find({ _id: { $in } }).select(...).lean()).
 *    - Build a map for O(1) lookups, then assemble the final array in memory.
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
          .select("name image unit price type")
          .lean()
      : [],
    produceIds.length
      ? Produce.find({ _id: { $in: produceIds } })
          .select("name image unit price type")
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
 * 9) getExtras:
 *    - Load user.cart & vendorId (lean).
 *    - If no cart entries or no vendorId, return [].
 *    - Fetch Vendor's `retailInventory` & `produceInventory` arrays (via `.select(...) .lean()`).
 *    - Build a Set of itemIds already in the cart.
 *    - Filter out:
 *        • Retail entries where quantity > MAX_QTY["Retail"] AND not in cart
 *        • Produce entries where isAvailable === "Y" AND not in cart
 *    - Batch‐fetch those filtered item IDs in two queries:
 *        • Retail.find({ _id: { $in: […] } }).select("…").lean()
 *        • Produce.find({ _id: { $in: […] } }).select("…").lean()
 *    - Merge into one `extras` array and return.
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
