const express = require('express');
const Uni = require('../models/account/Uni');
const { uniAuthMiddleware } = require('../middleware/uniAuthMiddleware');

const router = express.Router();

// Get university charges
router.get('/charges/:uniId', async (req, res) => {
  try {
    const { uniId } = req.params;
    const university = await Uni.findById(uniId).select('packingCharge deliveryCharge fullName');
    
    if (!university) {
      return res.status(404).json({ message: "University not found" });
    }
    
    res.json({
      packingCharge: university.packingCharge,
      deliveryCharge: university.deliveryCharge,
      universityName: university.fullName
    });
  } catch (err) {
    console.error('Error fetching university charges:', err);
    res.status(500).json({ message: "Failed to fetch university charges" });
  }
});

// Update university charges (requires university authentication)
router.put('/charges/:uniId', uniAuthMiddleware, async (req, res) => {
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
    
    // Check if the authenticated university is updating their own charges
    if (req.uni._id.toString() !== uniId) {
      return res.status(403).json({ message: "You can only update your own university charges" });
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

module.exports = router; 