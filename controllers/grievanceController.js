const mongoose = require("mongoose");
const Grievance = require("../models/account/Grievance");
const Uni = require("../models/account/Uni");
const Vendor = require("../models/account/Vendor");
const Order = require("../models/order/Order");

// Create a new grievance
const createGrievance = async (req, res) => {
  try {
    const {
      title,
      description,
      severity,
      category,
      relatedOrderId,
      tags = [],
      attachments = []
    } = req.body;

    const { uniId } = req.params;
    const raisedBy = req.vendor || req.user; // From vendor or auth middleware

    // Validate required fields
    if (!title || !description || !category) {
      return res.status(400).json({
        success: false,
        message: "Title, description, and category are required"
      });
    }

    // Check if university exists
    const university = await Uni.findById(uniId);
    if (!university) {
      return res.status(404).json({
        success: false,
        message: "University not found"
      });
    }

    // Validate related order if provided (skip validation for now due to schema issues)
    // TODO: Fix Order model import and re-enable validation
    // if (relatedOrderId) {
    //   try {
    //     const order = await Order.findById(relatedOrderId);
    //     if (!order) {
    //       return res.status(404).json({
    //         success: false,
    //         message: "Related order not found"
    //       });
    //     }
    //   } catch (error) {
    //     console.error("Error validating related order:", error);
    //     return res.status(400).json({
    //       success: false,
    //       message: "Invalid related order ID"
    //     });
    //   }
    // }

    // Determine raisedBy type and id based on middleware used
    let raisedByType, raisedById;
    if (req.vendor) {
      // Vendor authentication middleware
      raisedByType = 'vendor';
      raisedById = raisedBy.vendorId;
    } else {
      // Regular auth middleware
      raisedByType = raisedBy.type;
      raisedById = raisedBy.id;
    }

    // Create grievance
    const grievance = new Grievance({
      title,
      description,
      severity: severity || "medium",
      category,
      raisedBy: {
        type: raisedByType,
        id: raisedById
      },
      uniId,
      relatedOrderId: relatedOrderId || null,
      tags,
      attachments
    });

    // Add initial progress entry
    grievance.progress.push({
      status: "open",
      note: "Grievance created",
      updatedBy: {
        type: raisedByType,
        id: raisedById
      }
    });

    await grievance.save();

    // Populate the response (disabled due to schema registration issues)
    // await grievance.populate([
    //   { path: 'raisedBy.id', select: 'fullName email' }
    //   // Note: relatedOrderId population disabled due to Order model schema issues
    // ]);

    res.status(201).json({
      success: true,
      message: "Grievance created successfully",
      data: grievance
    });

  } catch (error) {
    console.error("Error creating grievance:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get all grievances for a university
const getUniversityGrievances = async (req, res) => {
  try {
    const { uniId } = req.params;
    const {
      status,
      severity,
      category,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filters = {};
    if (status) filters.status = status;
    if (severity) filters.severity = severity;
    if (category) filters.category = category;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const grievances = await Grievance.find({ uniId, ...filters })
      .populate('raisedBy.id', 'fullName email')
      .populate('relatedOrderId', 'orderNumber status')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Grievance.countDocuments({ uniId, ...filters });

    res.json({
      success: true,
      data: grievances,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error("Error fetching university grievances:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get grievances raised by a vendor
const getVendorGrievances = async (req, res) => {
  try {
    const { uniId } = req.params;
    const vendorId = req.user.id;
    const {
      status,
      severity,
      category,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filters = {
      'raisedBy.type': 'vendor',
      'raisedBy.id': vendorId
    };
    if (status) filters.status = status;
    if (severity) filters.severity = severity;
    if (category) filters.category = category;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const grievances = await Grievance.find({ uniId, ...filters })
      .populate('raisedBy.id', 'fullName email')
      .populate('relatedOrderId', 'orderNumber status')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Grievance.countDocuments({ uniId, ...filters });

    res.json({
      success: true,
      data: grievances,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error("Error fetching vendor grievances:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get a specific grievance
const getGrievanceById = async (req, res) => {
  try {
    const { grievanceId } = req.params;
    const { uniId } = req.params;

    const grievance = await Grievance.findOne({ _id: grievanceId, uniId })
      .populate('raisedBy.id', 'fullName email')
      .populate('relatedOrderId', 'orderNumber status')
      .populate('uniId', 'fullName email');

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
    console.error("Error fetching grievance:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Update grievance status and add progress
const updateGrievanceStatus = async (req, res) => {
  try {
    const { grievanceId } = req.params;
    const { uniId } = req.params;
    const { status, note } = req.body;
    const updatedBy = req.user;

    const grievance = await Grievance.findOne({ _id: grievanceId, uniId });

    if (!grievance) {
      return res.status(404).json({
        success: false,
        message: "Grievance not found"
      });
    }

    // Validate status transition
    const validTransitions = {
      'open': ['in_progress', 'rejected'],
      'in_progress': ['resolved', 'closed'],
      'resolved': ['closed'],
      'closed': [],
      'rejected': ['open']
    };

    if (!validTransitions[grievance.status].includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from ${grievance.status} to ${status}`
      });
    }

    // Add progress update
    await grievance.addProgressUpdate(status, note, {
      type: updatedBy.type,
      id: updatedBy.id
    });

    // If resolved, set resolution details
    if (status === 'resolved') {
      grievance.resolution = {
        note: note,
        resolvedBy: {
          type: updatedBy.type,
          id: updatedBy.id
        },
        resolvedAt: new Date()
      };
      await grievance.save();
    }

    await grievance.populate([
      { path: 'raisedBy.id', select: 'fullName email' },
      { path: 'relatedOrderId', select: 'orderNumber status' }
    ]);

    res.json({
      success: true,
      message: "Grievance status updated successfully",
      data: grievance
    });

  } catch (error) {
    console.error("Error updating grievance status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Add internal note (university/admin only)
const addInternalNote = async (req, res) => {
  try {
    const { grievanceId } = req.params;
    const { uniId } = req.params;
    const { note } = req.body;
    const addedBy = req.user;

    // Only university and admin can add internal notes
    if (addedBy.type !== 'university' && addedBy.type !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Only university and admin can add internal notes"
      });
    }

    const grievance = await Grievance.findOne({ _id: grievanceId, uniId });

    if (!grievance) {
      return res.status(404).json({
        success: false,
        message: "Grievance not found"
      });
    }

    await grievance.addInternalNote(note, {
      type: addedBy.type,
      id: addedBy.id
    });

    res.json({
      success: true,
      message: "Internal note added successfully",
      data: grievance
    });

  } catch (error) {
    console.error("Error adding internal note:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get grievance statistics
const getGrievanceStats = async (req, res) => {
  try {
    const { uniId } = req.params;
    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const stats = await Grievance.aggregate([
      { $match: { uniId: new mongoose.Types.ObjectId(uniId), ...dateFilter } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
          high: { $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] } },
          medium: { $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] } },
          low: { $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] } },
          overdue: { $sum: { $cond: [{ $gt: ['$slaDeadline', new Date()] }, 0, 1] } }
        }
      }
    ]);

    const result = stats[0] || {
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0,
      rejected: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      overdue: 0
    };

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("Error fetching grievance statistics:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Search grievances
const searchGrievances = async (req, res) => {
  try {
    const { uniId } = req.params;
    const { q, page = 1, limit = 10 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Search query is required"
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const grievances = await Grievance.find({
      uniId,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } }
      ]
    })
      .populate('raisedBy.id', 'fullName email')
      .populate('relatedOrderId', 'orderNumber status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Grievance.countDocuments({
      uniId,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } }
      ]
    });

    res.json({
      success: true,
      data: grievances,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error("Error searching grievances:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Delete grievance (soft delete)
const deleteGrievance = async (req, res) => {
  try {
    const { grievanceId } = req.params;
    const { uniId } = req.params;
    const deletedBy = req.user;

    // Only university and admin can delete grievances
    if (deletedBy.type !== 'university' && deletedBy.type !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Only university and admin can delete grievances"
      });
    }

    const grievance = await Grievance.findOne({ _id: grievanceId, uniId });

    if (!grievance) {
      return res.status(404).json({
        success: false,
        message: "Grievance not found"
      });
    }

    // Add deletion note to progress
    await grievance.addProgressUpdate('closed', 'Grievance deleted', {
      type: deletedBy.type,
      id: deletedBy.id
    });

    // Soft delete by updating status
    grievance.status = 'closed';
    await grievance.save();

    res.json({
      success: true,
      message: "Grievance deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting grievance:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

module.exports = {
  createGrievance,
  getUniversityGrievances,
  getVendorGrievances,
  getGrievanceById,
  updateGrievanceStatus,
  addInternalNote,
  getGrievanceStats,
  searchGrievances,
  deleteGrievance
};
