/**
 * Builds a bulk invoice ZIP on disk. Called from the export queue worker,
 * never from an HTTP handler.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const sanitizeFilename = require('sanitize-filename');
const Invoice = require('../models/invoice/Invoice');
const Vendor = require('../models/account/Vendor');
const Uni = require('../models/account/Uni');
const Order = require('../models/order/Order');
const { isValidCloudinaryUrl, isValidRazorpayUrl } = require('./urlValidation');
const logger = require('./pinoLogger');

let fetchFn;
if (typeof globalThis.fetch === 'undefined') {
  fetchFn = (...args) => require('node-fetch')(...args);
} else {
  fetchFn = globalThis.fetch;
}

async function resolveInvoicePdfBuffer(invoice) {
  if (invoice.pdfUrl && isValidCloudinaryUrl(invoice.pdfUrl)) {
    try {
      const cloudinaryResponse = await fetchFn(invoice.pdfUrl);
      if (cloudinaryResponse.ok) {
        return Buffer.from(await cloudinaryResponse.arrayBuffer());
      }
    } catch (err) {
      logger.info({ invoiceNumber: invoice.invoiceNumber, error: err.message }, 'Cloudinary PDF fetch failed');
    }
  }

  if (invoice.razorpayInvoiceUrl && isValidRazorpayUrl(invoice.razorpayInvoiceUrl)) {
    try {
      const razorpayResponse = await fetchFn(invoice.razorpayInvoiceUrl);
      if (razorpayResponse.ok) {
        return Buffer.from(await razorpayResponse.arrayBuffer());
      }
    } catch (err) {
      logger.info({ invoiceNumber: invoice.invoiceNumber, error: err.message }, 'Razorpay PDF fetch failed');
    }
  }

  if (invoice.razorpayInvoiceId) {
    try {
      const razorpayResponse = await fetchFn(
        `https://api.razorpay.com/v1/invoices/${invoice.razorpayInvoiceId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/json'
          }
        }
      );
      if (razorpayResponse.ok) {
        const razorpayData = await razorpayResponse.json();
        if (razorpayData.short_url) {
          const pdfResponse = await fetchFn(razorpayData.short_url);
          if (pdfResponse.ok) {
            return Buffer.from(await pdfResponse.arrayBuffer());
          }
        }
      }
    } catch (err) {
      logger.info({ invoiceNumber: invoice.invoiceNumber, error: err.message }, 'Razorpay API PDF fetch failed');
    }
  }

  if (invoice.pdfUrl && invoice.pdfUrl.startsWith('/uploads/')) {
    const filePath = path.join(process.cwd(), invoice.pdfUrl);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
  }

  return null;
}

function placeholderText(invoice, reason) {
  const orderNumber = invoice.orderId?.orderNumber || invoice.orderNumber || 'UNKNOWN';
  return `Invoice ${invoice.invoiceNumber} (${invoice.invoiceType})
Order: ${orderNumber}
Status: ${invoice.status}
Total Amount: ${invoice.totalAmount}
Created: ${invoice.createdAt}

${reason}`;
}

async function buildBulkInvoiceZip(job) {
  const invoices = await Invoice.find(job.query)
    .populate({ path: 'vendorId', select: 'name fullName', model: Vendor })
    .populate({ path: 'uniId', select: 'fullName', model: Uni })
    .populate({ path: 'orderId', select: 'orderNumber', model: Order })
    .sort({ createdAt: -1 })
    .lean();

  const cleanStart = sanitizeFilename(job.startDate || 'start');
  const cleanEnd = sanitizeFilename(job.endDate || 'end');
  const tempDir = path.join(os.tmpdir(), `bulk_invoices_${job.id}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const zipPath = path.join(tempDir, `bulk_invoices_${cleanStart}_to_${cleanEnd}.zip`);

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);

    (async () => {
      for (const invoice of invoices) {
        const orderNumber = invoice.orderId?.orderNumber || invoice.orderNumber || 'UNKNOWN';
        const filename = `invoice_${invoice.invoiceNumber}_${invoice.invoiceType}_order_${orderNumber}.pdf`;
        try {
          const pdfBuffer = await resolveInvoicePdfBuffer(invoice);
          if (pdfBuffer) {
            archive.append(pdfBuffer, { name: filename });
          } else {
            archive.append(
              placeholderText(invoice, 'This invoice could not be included because no PDF was available.'),
              { name: `invoice_${invoice.invoiceNumber}_${invoice.invoiceType}_NOT_AVAILABLE.txt` }
            );
          }
        } catch (invoiceError) {
          archive.append(
            placeholderText(invoice, `Error: ${invoiceError.message}`),
            { name: `invoice_${invoice.invoiceNumber}_${invoice.invoiceType}_ERROR.txt` }
          );
        }
      }
      await archive.finalize();
    })().catch(reject);
  });

  return {
    zipPath,
    tempDir,
    invoiceCount: invoices.length,
    filename: `bulk_invoices_${cleanStart}_to_${cleanEnd}.zip`
  };
}

module.exports = {
  buildBulkInvoiceZip,
  resolveInvoicePdfBuffer
};
