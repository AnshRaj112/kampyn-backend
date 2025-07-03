const express = require('express');
const University = require('../models/university');

const router = express.Router();

router.post('/upload-image', async (req, res) => {
  const { universityId, imageUrl } = req.body;
  if (!universityId || !imageUrl) return res.status(400).json({ message: "Missing data" });

  try {
    // Save imageUrl to the university's record (adjust as per your schema)
    await University.findByIdAndUpdate(universityId, { $push: { images: imageUrl } }); // or $set if only one image
    res.json({ message: "Image URL saved" });
  } catch (err) {
    res.status(500).json({ message: "Failed to save image URL" });
  }
});

router.get('/api/cloudinary/cloud-name', (req, res) => {
  res.json({ cloudName: process.env.CLOUDINARY_CLOUD_NAME });
});

module.exports = router; 