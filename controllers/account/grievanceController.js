const mongoose = require("mongoose");
const Grievance = require("../../models/account/Grievance");
const Vendor = require("../../models/account/Vendor");
const logger = require("../../utils/pinoLogger");

// Create a new grievance (vendor only)
exports.createGrievance = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { category, severity, title, description } = req.body;

    // Validate required fields
    if (!category || !title || !description) {
      return res.status(400).json({
        success: false,
        message: "Category, title, and description are required"
      });
    }

    // Get vendor details to associate university
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found"
      });
    }

    if (!vendor.uniID) {
      return res.status(400).json({
        success: false,
        message: "Vendor is not associated with any university"
      });
    }

    // Create grievance
    const grievance = await Grievance.create({
      vendor: vendorId,
      university: vendor.uniID,
      category,
      severity: severity || "medium",
      title,
      description
    });

    const populatedGrievance = await Grievance.findById(grievance._id)
      .populate("vendor", "fullName email")
      .populate("university", "fullName");

    res.status(201).json({
      success: true,
      data: populatedGrievance
    });
  } catch (error) {
    logger.error("Error creating grievance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create grievance"
    });
  }
};

// Get all grievances for a vendor
exports.getVendorGrievances = async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    const grievances = await Grievance.find({ vendor: vendorId })
      .populate("vendor", "fullName email")
      .populate("university", "fullName")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: grievances
    });
  } catch (error) {
    logger.error("Error fetching vendor grievances:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch grievances"
    });
  }
};

// Get all grievances for a university (with vendor grouping)
exports.getUniversityGrievances = async (req, res) => {
  try {
    const { uniId } = req.params;
    const { status, severity } = req.query;
    
    const filter = { university: uniId };
    if (status) filter.status = status;
    if (severity) filter.severity = severity;

    const grievances = await Grievance.find(filter)
      .populate("vendor", "fullName email")
      .populate("university", "fullName")
      .sort({ 
        // Sort by severity priority: critical, high, medium, low
        severity: -1,
        createdAt: -1 
      });

    res.json({
      success: true,
      data: grievances
    });
  } catch (error) {
    logger.error("Error fetching university grievances:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch grievances"
    });
  }
};

// Get grievance by ID
exports.getGrievanceById = async (req, res) => {
  try {
    const { grievanceId } = req.params;
    
    const grievance = await Grievance.findById(grievanceId)
      .populate("vendor", "fullName email")
      .populate("university", "fullName");

    if (!grievance) {
      return res.status(404).json({
        success: false,
        message: "Grievance not found"
      });
    }

    res.json({
      success: true,
      data: grievance
    });
  } catch (error) {
    logger.error("Error fetching grievance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch grievance"
    });
  }
};

// Update grievance status (university only)
exports.updateGrievanceStatus = async (req, res) => {
  try {
    const { grievanceId } = req.params;
    const { status, remarks } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required"
      });
    }

    const updateData = { status };
    
    if (remarks) {
      updateData.remarks = remarks;
    }

    // Set resolvedAt if status is completed or closed
    if (status === "completed" || status === "closed" || status === "not_required") {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = req.body.universityId; // Pass university ID from frontend
    }

    const grievance = await Grievance.findByIdAndUpdate(
      grievanceId,
      updateData,
      { new: true, runValidators: true }
    ).populate("vendor", "fullName email")
     .populate("university", "fullName");

    if (!grievance) {
      return res.status(404).json({
        success: false,
        message: "Grievance not found"
      });
    }

    res.json({
      success: true,
      data: grievance
    });
  } catch (error) {
    logger.error("Error updating grievance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update grievance"
    });
  }
};

// Get grievance statistics for university
exports.getGrievanceStats = async (req, res) => {
  try {
    const { uniId } = req.params;
    
    const stats = await Grievance.aggregate([
      { $match: { university: mongoose.Types.ObjectId(uniId) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] }
          },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          closed: {
            $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] }
          },
          critical: {
            $sum: { $cond: [{ $eq: ["$severity", "critical"] }, 1, 0] }
          },
          high: {
            $sum: { $cond: [{ $eq: ["$severity", "high"] }, 1, 0] }
          },
          medium: {
            $sum: { $cond: [{ $eq: ["$severity", "medium"] }, 1, 0] }
          },
          low: {
            $sum: { $cond: [{ $eq: ["$severity", "low"] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: stats[0] || {
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        closed: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      }
    });
  } catch (error) {
    logger.error("Error fetching grievance stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch grievance statistics"
    });
  }
};
