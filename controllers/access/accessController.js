const Service = require("../../models/account/Service");
const logger = require("../../utils/pinoLogger");
const Feature = require("../../models/account/Feature");

/**
 * Get vendor services based on university, vendor, and role
 * This endpoint is used by the vendor dashboard to determine which services are accessible
 */
exports.getVendorFeatures = async (req, res) => {
  try {
    const { uniId, vendorId, role } = req.query;
    const vendor = req.vendor; // From authentication middleware

    // Get vendor's assigned services with their features
    const vendorServices = await Service.find({
      _id: { $in: vendor.services || [] },
      isActive: true
    }).populate('feature', 'name').lean();

    // Group services by feature
    const featuresWithServices = {};
    vendorServices.forEach(service => {
      const featureName = service.feature.name;
      const featureKey = featureName.toLowerCase().replace(/\s+/g, '_');
      
      if (!featuresWithServices[featureKey]) {
        featuresWithServices[featureKey] = {
          featureName: featureName,
          services: []
        };
      }
      
      featuresWithServices[featureKey].services.push({
        id: service._id,
        name: service.name,
        description: service.description,
        basePrice: service.basePrice
      });
    });

    // Convert to the format expected by frontend
    const featureMap = {};
    Object.keys(featuresWithServices).forEach(featureKey => {
      featureMap[featureKey] = {
        enabled: true,
        services: featuresWithServices[featureKey].services
      };
    });

    res.json({
      success: true,
      features: featureMap
    });
  } catch (error) {
    logger.error("getVendorFeatures error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch vendor services"
    });
  }
};
