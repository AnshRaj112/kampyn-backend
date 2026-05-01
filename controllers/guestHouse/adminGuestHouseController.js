const GuestHouse = require("../../models/account/GuestHouse");
const Service = require("../../models/account/Service");
const logger = require("../../utils/pinoLogger");

exports.listGuestHousesForAdmin = async (req, res) => {
  try {
    const guestHouses = await GuestHouse.find({})
      .select("-password -__v")
      .populate({ path: "services", populate: { path: "feature" } })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: guestHouses,
      total: guestHouses.length,
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to fetch guest houses for admin");
    return res.status(500).json({
      success: false,
      message: "Failed to fetch guest houses",
    });
  }
};

exports.updateGuestHouseServices = async (req, res) => {
  try {
    const { guestHouseId } = req.params;
    const { services } = req.body;

    if (!Array.isArray(services)) {
      return res.status(400).json({
        success: false,
        message: "services must be an array of service IDs",
      });
    }

    const count = await Service.countDocuments({ _id: { $in: services } });
    if (count !== services.length) {
      return res.status(400).json({
        success: false,
        message: "One or more service IDs are invalid",
      });
    }

    const guestHouse = await GuestHouse.findByIdAndUpdate(
      guestHouseId,
      { $set: { services } },
      { new: true }
    )
      .select("-password -__v")
      .populate({ path: "services", populate: { path: "feature" } });

    if (!guestHouse) {
      return res.status(404).json({
        success: false,
        message: "Guest house not found",
      });
    }

    return res.json({
      success: true,
      message: "Guest house services updated successfully",
      data: guestHouse.services,
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to update guest house services");
    return res.status(500).json({
      success: false,
      message: "Failed to update guest house services",
    });
  }
};

