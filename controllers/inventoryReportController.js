// controllers/inventoryReportController.js

const {
  generateDailyReportForVendor,
  generateDailyReportForUni,
  getInventoryReport,
} = require("../utils/inventoryReportUtils");

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
    return res.json({ success: true, data: report });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  postVendorReport,
  postUniReport,
  getVendorReport,
};
