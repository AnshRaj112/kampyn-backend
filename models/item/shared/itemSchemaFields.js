const mongoose = require("mongoose");

function commonTaxedItemFields() {
  return {
    name: { type: String, required: true },
    description: { type: String },
    type: { type: String, required: true },
    uniId: { type: mongoose.Schema.Types.ObjectId, ref: "Uni", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true },
    price: { type: Number, required: true },
    priceExcludingTax: { type: Number, required: true },
    hsnCode: { type: String, required: true },
    gstPercentage: { type: Number, required: true },
    sgstPercentage: { type: Number, required: true },
    cgstPercentage: { type: Number, required: true },
    image: { type: String, required: true },
    isVeg: { type: Boolean, default: true },
  };
}

module.exports = { commonTaxedItemFields };
