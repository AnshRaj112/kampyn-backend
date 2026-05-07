const mongoose = require("mongoose");
const { guestHouseBaseFields } = require("./guestHouseSchemaFields");

function guestRequestBaseFields() {
  return {
    ...guestHouseBaseFields(),
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "GuestHouseRoomBooking", required: true, index: true },
    guestName: { type: String, trim: true, maxlength: 120, default: "" },
    guestPhone: { type: String, trim: true, maxlength: 20, default: "" },
    roomLabel: { type: String, trim: true, maxlength: 80, default: "" },
  };
}

module.exports = { guestRequestBaseFields };
