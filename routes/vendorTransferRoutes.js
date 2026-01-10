const express = require("express");
const router = express.Router();
const {
  bulkTransferRetailItems,
  getTransferOrdersForReceiver,
  confirmTransfer,
} = require("../controllers/vendor/venodorTransferController");

router.post("/transfer", bulkTransferRetailItems);
router.get("/transfer-orders/:receiverId", getTransferOrdersForReceiver);
router.post("/confirm-transfer", confirmTransfer);
module.exports = router;
