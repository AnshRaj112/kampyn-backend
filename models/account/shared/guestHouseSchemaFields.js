const mongoose = require("mongoose");

function guestHouseBaseFields() {
  return {
    uniId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Uni",
      required: true,
      index: true,
    },
    guestHouseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GuestHouse",
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      index: true,
    },
  };
}

module.exports = { guestHouseBaseFields };
