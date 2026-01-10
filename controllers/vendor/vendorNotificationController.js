const { addVendorClient } = require("../../services/vendorNotificationHub");
const logger = require("../../utils/pinoLogger");

exports.streamVendorNotifications = async (req, res) => {
  try {
    const vendorId = req.vendor?._id || req.vendor?.vendorId;

    if (!vendorId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: vendor identity missing.",
      });
    }

    addVendorClient(vendorId, res);
  } catch (error) {
    logger.error({ error: error.message }, "Failed to establish vendor notification stream");
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Failed to establish stream." });
    } else {
      res.end();
    }
  }
};

