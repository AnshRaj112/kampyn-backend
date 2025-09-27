const express = require('express');
const Uni = require('../models/account/Uni');
const Feature = require('../models/account/Feature');
const Service = require('../models/account/Service');

const router = express.Router();

// Get university charges
router.get('/charges/:uniId', async (req, res) => {
  try {
    const { uniId } = req.params;
    const university = await Uni.findById(uniId).select('packingCharge deliveryCharge platformFee fullName');
    
    if (!university) {
      return res.status(404).json({ message: "University not found" });
    }
    
    res.json({
      packingCharge: university.packingCharge,
      deliveryCharge: university.deliveryCharge,
      platformFee: university.platformFee,
      universityName: university.fullName
    });
  } catch (err) {
    console.error('Error fetching university charges:', err);
    res.status(500).json({ message: "Failed to fetch university charges" });
  }
});

// Update university charges (no authentication required)
router.put('/charges/:uniId', async (req, res) => {
  try {
    const { uniId } = req.params;
    const { packingCharge, deliveryCharge } = req.body;
    
    // Validate input
    if (packingCharge !== undefined && (packingCharge < 0 || !Number.isFinite(packingCharge))) {
      return res.status(400).json({ message: "Packing charge must be a non-negative number" });
    }
    
    if (deliveryCharge !== undefined && (deliveryCharge < 0 || !Number.isFinite(deliveryCharge))) {
      return res.status(400).json({ message: "Delivery charge must be a non-negative number" });
    }
    
    const updateData = {};
    if (packingCharge !== undefined) updateData.packingCharge = packingCharge;
    if (deliveryCharge !== undefined) updateData.deliveryCharge = deliveryCharge;
    
    const university = await Uni.findByIdAndUpdate(
      uniId, 
      updateData,
      { new: true, runValidators: true }
    ).select('packingCharge deliveryCharge fullName');
    
    if (!university) {
      return res.status(404).json({ message: "University not found" });
    }
    
    res.json({
      message: "Charges updated successfully",
      packingCharge: university.packingCharge,
      deliveryCharge: university.deliveryCharge,
      universityName: university.fullName
    });
  } catch (err) {
    console.error('Error updating university charges:', err);
    res.status(500).json({ message: "Failed to update university charges" });
  }
});

router.post('/upload-image', async (req, res) => {
  const { universityId, imageUrl } = req.body;
  if (!universityId || !imageUrl) return res.status(400).json({ message: "Missing data" });

  try {
    // Save imageUrl to the university's record (adjust as per your schema)
    await Uni.findByIdAndUpdate(universityId, { $push: { images: imageUrl } }); // or $set if only one image
    res.json({ message: "Image URL saved" });
  } catch (err) {
    res.status(500).json({ message: "Failed to save image URL" });
  }
});

router.get('/api/cloudinary/cloud-name', (req, res) => {
  res.json({ cloudName: process.env.CLOUDINARY_CLOUD_NAME });
});

// Get assigned features and services for a university
router.get('/universities/:uniId/assignments', async (req, res) => {
  try {
    const { uniId } = req.params;
    const uni = await Uni.findById(uniId)
      .populate('features')
      .populate({ path: 'services', populate: { path: 'feature' } });

    if (!uni) return res.status(404).json({ success: false, message: 'University not found' });

    res.json({
      success: true,
      data: {
        features: uni.features,
        services: uni.services,
      }
    });
  } catch (err) {
    console.error('Error fetching assignments:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch assignments' });
  }
});

// Update assigned features for a university
router.patch('/universities/:uniId/features', async (req, res) => {
  try {
    const { uniId } = req.params;
    const { features } = req.body; // array of feature IDs

    if (!Array.isArray(features)) {
      return res.status(400).json({ success: false, message: 'features must be an array of IDs' });
    }

    // Validate that provided IDs exist (optional lightweight check)
    const count = await Feature.countDocuments({ _id: { $in: features } });
    if (count !== features.length) {
      return res.status(400).json({ success: false, message: 'One or more feature IDs are invalid' });
    }

    const uni = await Uni.findByIdAndUpdate(
      uniId,
      { $set: { features } },
      { new: true }
    ).populate('features');

    if (!uni) return res.status(404).json({ success: false, message: 'University not found' });

    res.json({ success: true, message: 'Features updated', data: uni.features });
  } catch (err) {
    console.error('Error updating features:', err);
    res.status(500).json({ success: false, message: 'Failed to update features' });
  }
});

// Update assigned services for a university
router.patch('/universities/:uniId/services', async (req, res) => {
  try {
    const { uniId } = req.params;
    const { services } = req.body; // array of service IDs

    if (!Array.isArray(services)) {
      return res.status(400).json({ success: false, message: 'services must be an array of IDs' });
    }

    const count = await Service.countDocuments({ _id: { $in: services } });
    if (count !== services.length) {
      return res.status(400).json({ success: false, message: 'One or more service IDs are invalid' });
    }

    const uni = await Uni.findByIdAndUpdate(
      uniId,
      { $set: { services } },
      { new: true }
    ).populate({ path: 'services', populate: { path: 'feature' } });

    if (!uni) return res.status(404).json({ success: false, message: 'University not found' });

    res.json({ success: true, message: 'Services updated', data: uni.services });
  } catch (err) {
    console.error('Error updating services:', err);
    res.status(500).json({ success: false, message: 'Failed to update services' });
  }
});

// Get all available services for a vendor (from university's features) with assignment status
router.get('/universities/:uniId/vendors/:vendorId/services', async (req, res) => {
  try {
    const { uniId, vendorId } = req.params;

    // Verify the vendor belongs to the university
    const Vendor = require('../models/account/Vendor');
    const vendor = await Vendor.findOne({ _id: vendorId, uniID: uniId });

    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found or not associated with this university' });
    }

    // Get university with its features
    const university = await Uni.findById(uniId)
      .populate('features')
      .lean();

    if (!university) {
      return res.status(404).json({ success: false, message: 'University not found' });
    }

    // Get all services from the university's features
    const allServices = await Service.find({ 
      feature: { $in: university.features.map(f => f._id) },
      isActive: true 
    }).populate('feature').lean();

    // Check which services are assigned to this vendor
    const assignedServiceIds = vendor.services.map(s => s.toString());

    // Combine all services with their assignment status
    const servicesWithStatus = allServices.map(service => ({
      ...service,
      isAssigned: assignedServiceIds.includes(service._id.toString())
    }));

    res.json({ 
      success: true, 
      data: {
        services: servicesWithStatus,
        features: university.features
      }
    });
  } catch (err) {
    console.error('Error fetching vendor services:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch vendor services' });
  }
});

// Get all services available for a university (from its features)
router.get('/universities/:uniId/allowed-services', async (req, res) => {
  try {
    const { uniId } = req.params;

    // Get university with its features
    const university = await Uni.findById(uniId)
      .populate('features')
      .lean();

    if (!university) {
      return res.status(404).json({ success: false, message: 'University not found' });
    }

    // Get all services from the university's features
    const allServices = await Service.find({ 
      feature: { $in: university.features.map(f => f._id) },
      isActive: true 
    }).populate('feature').lean();

    res.json({ 
      success: true, 
      data: {
        services: allServices,
        features: university.features
      }
    });
  } catch (err) {
    console.error('Error fetching allowed services:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch allowed services' });
  }
});

// Update assigned services for a specific vendor
router.patch('/universities/:uniId/vendors/:vendorId/services', async (req, res) => {
  try {
    const { uniId, vendorId } = req.params;
    const { services } = req.body; // array of service IDs

    if (!Array.isArray(services)) {
      return res.status(400).json({ success: false, message: 'services must be an array of service IDs' });
    }

    // Verify the vendor belongs to the university
    const Vendor = require('../models/account/Vendor');
    const vendor = await Vendor.findOne({ _id: vendorId, uniID: uniId });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found or not associated with this university' });
    }

    // Get university features to validate services belong to them
    const university = await Uni.findById(uniId).populate('features').lean();
    if (!university) {
      return res.status(404).json({ success: false, message: 'University not found' });
    }

    // Validate that all services belong to university's features
    const validServices = await Service.find({ 
      _id: { $in: services },
      feature: { $in: university.features.map(f => f._id) }
    });

    if (validServices.length !== services.length) {
      return res.status(400).json({ success: false, message: 'One or more services are not available for this university' });
    }

    // Update vendor services
    const updatedVendor = await Vendor.findByIdAndUpdate(
      vendorId,
      { $set: { services } },
      { new: true }
    ).populate({ path: 'services', populate: { path: 'feature' } });

    if (!updatedVendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

    res.json({ success: true, message: 'Vendor services updated', data: updatedVendor.services });
  } catch (err) {
    console.error('Error updating vendor services:', err);
    res.status(500).json({ success: false, message: 'Failed to update vendor services' });
  }
});

module.exports = router; 