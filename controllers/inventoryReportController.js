// controllers/inventoryReportController.js

const {
  generateDailyReportForVendor,
  generateDailyReportForUni,
  getInventoryReport,
  generateReportsForAllVendors,
} = require("../utils/inventoryReportUtils");
const InventoryReport = require("../models/inventory/InventoryReport");
const mongoose = require("mongoose");
const logger = require("../utils/pinoLogger");

/** Format date as YYYY-MM-DD in IST */
function formatDateIST(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * POST /inventory/report/vendor/:vendorId
 * Body (optional): { date: "YYYY-MM-DD" }
 */
async function postVendorReport(req, res, next) {
  try {
    const { vendorId } = req.params;
    const date = req.body.date;
    const { created, added } = await generateDailyReportForVendor(
      vendorId,
      date
    );

    let message;
    if (created) {
      message = "Inventory report created for today.";
    } else if (added) {
      message = `Report existed; added ${added} new item(s).`;
    } else {
      message = "Report already up-to-date; no changes made.";
    }

    return res.json({ success: true, message });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /inventory/report/uni/:uniId
 * Body (optional): { date: "YYYY-MM-DD" }
 */
async function postUniReport(req, res, next) {
  try {
    const { uniId } = req.params;
    const date = req.body.date;
    const { total, created, added } = await generateDailyReportForUni(
      uniId,
      date
    );

    const message =
      `Processed ${total} vendor(s): ` +
      `${created} report(s) created, ${added} new item(s) added.`;

    return res.json({ success: true, message });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /inventory/report/vendor/:vendorId?date=YYYY-MM-DD
 */
async function getVendorReport(req, res, next) {
  try {
    const { vendorId } = req.params;
    const date = req.query.date;
    const report = await getInventoryReport(vendorId, date);
    // If utility indicates no report exists, surface that clearly to the client
    if (report && report.error) {
      return res.json({ success: false, message: report.error, data: report });
    }
    return res.json({ success: true, data: report });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /inventoryreport/vendor/:vendorId/dates
 * Returns all dates for which a report exists for this vendor
 */
async function getVendorReportDates(req, res) {
  try {
    const { vendorId } = req.params;
    // Validate vendorId
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ error: "Invalid vendorId" });
    }
    // Ensure vendorId is an ObjectId
    const reports = await InventoryReport.find({ vendorId: new mongoose.Types.ObjectId(vendorId) }).select("date -_id").lean();
    // Format date as YYYY-MM-DD string using local time
    const dates = [...new Set(reports.map(r => {
      if (r.date instanceof Date) {
        return formatDateIST(r.date);
      } 
        return String(r.date).slice(0, 10);
      
    }))].sort((a, b) => b.localeCompare(a));
    res.json({ dates });
  } catch (err) {
    logger.error("Error in getVendorReportDates:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
}

/**
 * POST /inventory/report/generate-all
 * Generate inventory reports for all vendors (useful for testing and manual triggers)
 */
async function generateAllVendorReports(req, res, next) {
  try {
    const date = req.body.date;
    const result = await generateReportsForAllVendors(date);
    
    const message = `Generated reports for ${result.successCount} vendors. ${result.errorCount} errors occurred.`;
    return res.json({ success: true, message, data: result });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  postVendorReport,
  postUniReport,
  getVendorReport,
  getVendorReportDates,
  generateAllVendorReports,
};
