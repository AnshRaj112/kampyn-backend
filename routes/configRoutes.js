const express = require('express');
const router = express.Router();

router.get('/cloudinary/cloud-name', (req, res) => {
  res.json({ cloudName: process.env.CLOUDINARY_CLOUD_NAME });
});

module.exports = router; 