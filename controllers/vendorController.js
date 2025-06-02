const Vendor = require("../models/account/Vendor");

// Get all vendors for a specific university
exports.getVendorsByUni = async (req, res) => {
  try {
    const { uniId } = req.params;

    if (!uniId) {
      return res.status(400).json({ error: "Missing 'uniId' in path." });
    }

    const vendors = await Vendor.find({ uniID: uniId }).select('_id fullName').lean();
    res.status(200).json(vendors);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
}; 